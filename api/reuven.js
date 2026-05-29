const crypto = require("crypto");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
      // Strip date words from team names
      home = m[1].replace(/\b(היום|מחר|אתמול|today|tomorrow|yesterday)\b/gi, "").trim();
      away = m[2].replace(/\b(היום|מחר|אתמול|today|tomorrow|yesterday)\b/gi, "").trim();
      if (home && away) break;
    }
  }

  // Date offset
  const lc = text.toLowerCase();
  let offset = 0;
  if (/מחר|tomorrow/.test(lc)) offset = 1;
  else if (/אתמול|yesterday/.test(lc)) offset = -1;

  const d = new Date();
  d.setDate(d.getDate() + offset);
  const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d);
  return { home, away, dateKey, offset };
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


async function callClaude(userMessage, conversationHistory) {
  if (!ANTHROPIC_API_KEY) {
    return "AI Sports Analyst לא מופעל — מפתח ANTHROPIC_API_KEY חסר. יש להגדיר אותו ב-Vercel environment variables.";
  }

  const messages = [
    ...conversationHistory.slice(-6).map(h => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.text,
    })),
    { role: "user", content: userMessage },
  ];

  const body = {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages,
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "לא קיבלתי תגובה.";
}

// ── Handler ───────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { query, history = [] } = req.body || {};
  if (!String(query || "").trim()) {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  try {
    const { home, away, dateKey, offset } = parseQuery(query);

    // ── 1. Fetch Winner markets ──────────────────────────────────────────────
    let winnerSection = "";
    let matchInfo = null;

    try {
      const markets = await getWinnerLine();
      let found = (home || away) ? findMatchInMarkets(markets, home, away, dateKey) : null;

      // Retry without date constraint if not found
      if (!found && (home || away)) {
        found = findMatchInMarkets(markets, home, away, null);
      }

      if (found) {
        matchInfo = { desc: found.desc, league: found.league, date: found.date };
        const formatted = formatMarketsForPrompt(markets, found.eId);
        const dateLabel = found.date === dateKey ? (offset === 0 ? "היום" : offset === 1 ? "מחר" : "אתמול") : found.date;
        winnerSection = `✅ נמצא ב-Winner: ${found.desc}
ליגה: ${found.league}
תאריך: ${dateLabel} (${found.date})

שווקים ויחסים עכשיו:
${formatted}`;
      } else if (home || away) {
        winnerSection = `⚠️ לא מצאתי את המשחק "${[home, away].filter(Boolean).join(" נגד ")}" ב-Winner כרגע. ייתכן שהמשחק לא מופיע כרגע בשווקי Winner, שם הקבוצה שונה, או שהמשחק עבר.`;
      } else {
        winnerSection = "לא צוינו שמות קבוצות — לא חיפשתי ב-Winner.";
      }
    } catch (winnerErr) {
      winnerSection = `⚠️ לא הצלחתי להתחבר ל-Winner (${winnerErr.message}). אענה לפי ידע כללי.`;
    }

    // ── 2. Build user message for Claude ────────────────────────────────────
    const userMessage = `שאלת המשתמש: ${query}

--- נתוני Winner ---
${winnerSection}
--------------------

נתח את הבקשה וענה בעברית כ-AI Sports Analyst. אם יש אודס מ-Winner — השתמש בו לחישוב הסתברות גלומה ויתרון סטטיסטי אפשרי. אל תיתן הוראות או המלצות לשים כסף. אם אין נתונים — ציין זאת בבירור.`;

    // ── 3. Call Claude ───────────────────────────────────────────────────────
    const answer = await callClaude(userMessage, history);

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
