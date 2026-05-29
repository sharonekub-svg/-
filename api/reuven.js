const crypto = require("crypto");
const { rateLimit, sanitizeInput } = require("./_rate-limit");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";

// ── Winner API helpers ────────────────────────────────────────────────────────

function winnerHeaders(extra = {}) {
  return {
    "User-Agent": "Mozilla/5.0",
    Origin: "https://www.winner.co.il",
    Referer: "https://www.winner.co.il/",
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    RequestId: crypto.randomUUID(),
    DeviceId: crypto.randomUUID(),
    UserAgentData: JSON.stringify({
      devicemodel: "", deviceos: "windows", deviceosversion: "10",
      appversion: "2.6.1", apptype: "desktop", originId: 15, isAccessibility: false,
    }),
    appVersion: "2.6.1",
    ...extra,
  };
}

function cleanText(value) {
  return String(value || "").replace(/[‪-‮‬‎‏]/g, "").replace(/\s+/g, " ").trim();
}

function decimal(value) {
  const n = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(14000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getWinnerLine() {
  const hashMessage = JSON.stringify({ prevCurrentVersion: null, reason: "Initiated" });
  const hashes = await fetchJson("https://api.winner.co.il/v2/publicapi/GetCMobileHashes", {
    headers: winnerHeaders({ HashesMessage: hashMessage }),
  });
  const lineMessage = JSON.stringify({
    prevCurrentVersion: null, newCurrentVersion: hashes.currentVersion,
    lineNewHash: hashes.lineChecksum, reason: "Hashes not equal",
  });
  const line = await fetchJson(
    `https://api.winner.co.il/v2/publicapi/GetCMobileLine?lineChecksum=${encodeURIComponent(hashes.lineChecksum)}`,
    { headers: winnerHeaders({ HashesMessage: lineMessage }) }
  );
  return line.markets || [];
}

function winnerDateToIso(value) {
  const raw = String(value || "");
  if (raw.length !== 6) return "";
  return `20${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
}

function normalizeTeamName(name) {
  return cleanText(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\b(fc|bc|bk|club|women|cf)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamMatchScore(query, candidate) {
  const q = normalizeTeamName(query);
  const c = normalizeTeamName(candidate);
  if (!q || !c) return 0;
  if (c === q) return 1;
  if (c.includes(q) || q.includes(c)) return 0.9;
  const qWords = q.split(" ").filter(w => w.length >= 3);
  const cWords = c.split(" ").filter(w => w.length >= 3);
  if (!qWords.length) return 0;
  const hits = qWords.filter(w => cWords.some(cw => cw.includes(w) || w.includes(cw)));
  return hits.length / Math.max(qWords.length, 1) * 0.8;
}

function findMatchInMarkets(markets, homeQuery, awayQuery, dateKey) {
  const seen = new Map();
  for (const m of markets) {
    const date = winnerDateToIso(m.e_date);
    if (dateKey && date !== dateKey) continue;
    const desc = cleanText(m.desc);
    const parts = desc.split(" - ");
    if (parts.length < 2) continue;
    const [homeRaw, awayRaw] = parts;
    const homeScore = homeQuery ? teamMatchScore(homeQuery, homeRaw) : 0.4;
    const awayScore = awayQuery ? teamMatchScore(awayQuery, awayRaw) : 0.4;
    const total = homeScore + awayScore;
    if (total < 0.5) continue;
    const eId = String(m.eId);
    const prev = seen.get(eId);
    if (!prev || total > prev.total) {
      seen.set(eId, { eId, date, desc, homeRaw, awayRaw, total, sportId: m.sId, league: cleanText(m.league), time: m.m_hour || "" });
    }
  }
  return [...seen.values()].sort((a, b) => b.total - a.total)[0] || null;
}

// Broader search: by competition keyword and/or date when no team names given
function findMatchesByContext(markets, { competition, dateKey, isFinal }) {
  const seen = new Map();
  const compNorm = competition ? normalizeTeamName(competition) : null;

  for (const m of markets) {
    const date = winnerDateToIso(m.e_date);
    const matchesDate = !dateKey || date === dateKey;
    const leagueNorm = normalizeTeamName(cleanText(m.league || ""));
    const descNorm = normalizeTeamName(cleanText(m.desc || ""));

    const matchesComp = !compNorm || compNorm.split(" ").some(w => w.length >= 3 && leagueNorm.includes(w));
    const matchesFinal = !isFinal || leagueNorm.includes("final") || descNorm.includes("final") ||
                         leagueNorm.includes("גמר") || descNorm.includes("גמר");

    if (matchesDate && matchesComp && (!isFinal || matchesFinal) && !seen.has(String(m.eId))) {
      const desc = cleanText(m.desc);
      const parts = desc.split(" - ");
      seen.set(String(m.eId), {
        eId: String(m.eId), date, desc,
        home: parts[0] || "", away: parts[1] || "",
        league: cleanText(m.league), time: m.m_hour || "",
        sportId: m.sId,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

// Brief summary of all matches for a date (schedule view)
function formatScheduleSummary(markets, dateKey) {
  const seen = new Map();
  for (const m of markets) {
    if (winnerDateToIso(m.e_date) !== dateKey) continue;
    const eId = String(m.eId);
    if (!seen.has(eId)) {
      const desc = cleanText(m.desc);
      const league = cleanText(m.league);
      const time = m.m_hour || "";
      seen.set(eId, `${time} | ${league} | ${desc}`);
    }
  }
  return [...seen.values()].slice(0, 20);
}

function formatMarketsForPrompt(markets, eId) {
  const eventMarkets = markets.filter(m => String(m.eId) === String(eId));
  return eventMarkets.map(m => {
    const title = cleanText(m.mp);
    const outcomes = (m.outcomes || []).map(o => {
      const price = decimal(o.price);
      const implied = price ? `(${(100 / price).toFixed(1)}%)` : "";
      return `  ${cleanText(o.desc)}: ${price ? price.toFixed(2) : "N/A"} ${implied}`;
    }).join("\n");
    return `【${title}】\n${outcomes}`;
  }).slice(0, 12).join("\n\n");
}

// ── Competition keyword map ───────────────────────────────────────────────────

const COMPETITION_MAP = [
  { key: "ליגת האלופות", terms: ["ליגת האלופות", "champions league", "ucl", "champion"] },
  { key: "ליגה אירופית",  terms: ["ליגה אירופית", "europa league", "uel"] },
  { key: "קונפרנס",       terms: ["קונפרנס", "conference league", "uecl"] },
  { key: "פרמייר ליג",    terms: ["פרמייר ליג", "premier league", "epl"] },
  { key: "לה ליגה",       terms: ["לה ליגה", "la liga", "laliga"] },
  { key: "בונדסליגה",     terms: ["בונדסליגה", "bundesliga"] },
  { key: "סריה א",        terms: ["סריה א", "serie a", "serie-a"] },
  { key: "ליג 1",         terms: ["ליג 1", "ligue 1", "ligue-1"] },
  { key: "ליגת העל",      terms: ["ליגת העל", "israeli premier", "israel league"] },
  { key: "NBA",           terms: ["nba"] },
  { key: "יורוליג",       terms: ["יורוליג", "euroleague"] },
  { key: "קופה",          terms: ["קופה", "copa libertadores", "copa sudamericana"] },
  { key: "MLS",           terms: ["mls"] },
];

// ── Query parser ─────────────────────────────────────────────────────────────

function parseQuery(text) {
  const vsPatterns = [
    /(.+?)\s+(?:נגד|vs\.?|against|v\.?)\s+(.+)/i,
    /(.+?)\s*[-–—]\s*(.+)/,
  ];
  let home = null, away = null;
  for (const pattern of vsPatterns) {
    const m = text.match(pattern);
    if (m) {
      home = m[1].replace(/\b(היום|מחר|אתמול|today|tomorrow|yesterday)\b/gi, "").trim();
      away = m[2].replace(/\b(היום|מחר|אתמול|today|tomorrow|yesterday)\b/gi, "").trim();
      if (home && away) break;
    }
  }

  const lc = text.toLowerCase();

  // Date offset
  let offset = 0;
  if (/מחר|tomorrow/.test(lc)) offset = 1;
  else if (/אתמול|yesterday/.test(lc)) offset = -1;

  const d = new Date();
  d.setDate(d.getDate() + offset);
  const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d);

  // Competition detection
  let competition = null;
  for (const { key, terms } of COMPETITION_MAP) {
    if (terms.some(t => lc.includes(t))) { competition = key; break; }
  }
  // "גמר" alone without competition = finals in general
  const isFinal = /גמר|final/.test(lc);

  return { home, away, dateKey, offset, competition, isFinal };
}

// ── Claude API call ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are not a basic betting bot.
You are an elite sports intelligence agent.
You think, reason, and communicate like ChatGPT — but your entire world is sports, odds, statistics, fixtures, and predictions.

You never repeat the same answer mindlessly.
You understand context, ambiguity, and human intent.

When a user asks:
"Arsenal vs City, who wins?"
you do NOT panic if the match is unclear or missing.

You first think:

* Is there an upcoming match between these teams?
* Could the user mean a specific competition?
* Could they mean Premier League, Champions League, FA Cup, or a friendly?
* Is the fixture missing from the calendar?

If the match is unclear, you calmly ask:
"Which competition or date are you referring to?"

You NEVER invent fake games.
You NEVER hallucinate fixtures.
You NEVER repeat the same sentence over and over.

You behave like a real football analyst sitting in a studio with access to logic, memory, and context.

When the user clarifies:
"Champions League semifinal"
or
"The game in August"

you instantly continue naturally, understanding the conversation history like ChatGPT.

You analyze:

* Team form
* Injuries
* Motivation
* League standings
* Head-to-head history
* Tactical matchups
* Home vs away performance
* Betting market value
* Probability and risk

You explain predictions clearly and intelligently.

Bad AI behavior:
"I cannot find the game."
"The game does not exist."
Repeating the same line again and again.

Good AI behavior:
"I couldn't find an upcoming Arsenal vs City match right now. Are you talking about a specific competition or date?"

You are conversational, smart, adaptive, and human-like.

If the user says:
"Who wins Arsenal vs PSG?"
you understand they mean:
Arsenal F.C. vs Paris Saint-Germain F.C.

If multiple matches are possible, ask for clarification naturally.

You are an AI sports strategist, not a robotic database.

Your goal is to make the user feel like they are talking to a world-class sports analyst powered by GPT-level reasoning.

You do not guarantee wins.
You provide intelligent analysis, probabilities, value opportunities, and risk-aware predictions.

You answer with confidence, clarity, and context awareness at all times.

## Language
Always respond in Hebrew (עברית). The user interface is in Hebrew. Write naturally and fluently in Hebrew, like a professional sports analyst speaking to an Israeli audience.

## When Winner odds data is provided
Use the real odds as statistical context — calculate implied probability (1/odds), note market edges, and use them to support your analysis. Never invent odds.

## Betting instruction rule
If the user asks "מה לשים", "על מה להמר" or similar — respond: "אני לא נותן הוראות להמר. לפי הנתונים הספורטיביים..." and then give your analysis.`;


async function callGemini(userMessage, conversationHistory) {
  if (!GEMINI_API_KEY) {
    return "הפוגע AI לא מופעל — מפתח GEMINI_API_KEY חסר. יש להגדיר אותו ב-Vercel environment variables.";
  }

  // Build conversation history in Gemini format (user/model alternation)
  const contents = [];
  for (const h of conversationHistory.slice(-6)) {
    contents.push({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.text || "" }],
    });
  }
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "לא קיבלתי תגובה.";
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // 10 requests per IP per minute — protects Gemini API quota
  if (rateLimit(req, res, { max: 10, windowMs: 60_000 })) return;

  const rawQuery = (req.body || {}).query;
  const rawHistory = Array.isArray((req.body || {}).history) ? (req.body || {}).history : [];
  const query = sanitizeInput(rawQuery, 1000);
  if (!query) {
    res.status(400).json({ error: "Missing query" });
    return;
  }
  const history = rawHistory.slice(-6).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    text: sanitizeInput(m.text, 500),
  }));

  try {
    const { home, away, dateKey, offset, competition, isFinal } = parseQuery(query);

    // ── 1. Fetch Winner markets and build rich context ───────────────────────
    let winnerSection = "";
    let matchInfo = null;

    try {
      const markets = await getWinnerLine();
      const dateLabel = offset === 0 ? "היום" : offset === 1 ? "מחר" : "אתמול";

      // STEP A: exact team-name match
      let found = (home || away) ? findMatchInMarkets(markets, home, away, dateKey) : null;
      if (!found && (home || away)) found = findMatchInMarkets(markets, home, away, null);

      if (found) {
        matchInfo = { desc: found.desc, league: found.league, date: found.date };
        const formatted = formatMarketsForPrompt(markets, found.eId);
        const dl = found.date === dateKey ? dateLabel : found.date;
        winnerSection = `✅ נמצא ב-Winner: ${found.desc}\nליגה: ${found.league}\nתאריך: ${dl} (${found.date})\n\nשווקים ויחסים:\n${formatted}`;

      } else {
        // STEP B: competition + date search (handles "גמר ליגת האלופות מחר" etc.)
        const contextMatches = findMatchesByContext(markets, { competition, dateKey, isFinal });

        if (contextMatches.length === 1) {
          // Exactly one match found — treat as specific
          const m = contextMatches[0];
          matchInfo = { desc: m.desc, league: m.league, date: m.date };
          const formatted = formatMarketsForPrompt(markets, m.eId);
          winnerSection = `✅ נמצא ב-Winner: ${m.desc}\nליגה: ${m.league}\nתאריך: ${m.date} ${m.time}\n\nשווקים ויחסים:\n${formatted}`;

        } else if (contextMatches.length > 1) {
          // Multiple matches — show all with odds summary
          const lines = contextMatches.slice(0, 8).map(m => {
            const odds = formatMarketsForPrompt(markets, m.eId);
            return `📅 ${m.date} ${m.time} | ${m.league}\n⚽ ${m.desc}\n${odds}`;
          }).join("\n\n---\n\n");
          winnerSection = `נמצאו ${contextMatches.length} משחקים רלוונטיים ב-Winner:\n\n${lines}`;

        } else if (home || away) {
          winnerSection = `⚠️ לא מצאתי "${[home, away].filter(Boolean).join(" נגד ")}" ב-Winner. ייתכן שהמשחק עבר, נדחה, או שם הקבוצה שונה.`;

        } else {
          // STEP C: general date query — show full schedule for that day
          const schedule = formatScheduleSummary(markets, dateKey);
          winnerSection = schedule.length > 0
            ? `לוח משחקים ${dateLabel} (${dateKey}) ב-Winner:\n${schedule.join("\n")}`
            : `לא מצאתי משחקים ב-Winner ל-${dateLabel} (${dateKey}).`;
        }
      }
    } catch (winnerErr) {
      winnerSection = `⚠️ לא הצלחתי להתחבר ל-Winner (${winnerErr.message}). אענה לפי ידע כללי.`;
    }

    // ── 2. Build prompt ──────────────────────────────────────────────────────
    const safeQuery = query.replace(/`/g, "'").replace(/\$\{/g, "\\${");
    const userMessage = `שאלת המשתמש: ${safeQuery}

--- נתוני Winner בזמן אמת ---
${winnerSection}
-----------------------------

ענה בעברית. אם יש אודס — חשב הסתברות גלומה (1/אודס). אל תיתן הוראות הימור. אם אין נתונים מספיקים — ציין זאת בבירור.`;

    // ── 3. Call Claude ───────────────────────────────────────────────────────
    const answer = await callGemini(userMessage, history);

    res.status(200).json({ ok: true, answer, matchInfo });
  } catch (err) {
    console.error("Reuven API error:", err);
    res.status(200).json({
      ok: false,
      answer: `שגיאה טכנית: ${err.message}. אנא נסה שוב.`,
      matchInfo: null,
    });
  }
};
