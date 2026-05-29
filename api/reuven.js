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
  return String(value || "").replace(/[‪-‮‌‎‏]/g, "").replace(/\s+/g, " ").trim();
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
function findMatchesByContext(markets, { competition, rawCompetitionFallback, dateKey, isFinal }) {
  const seen = new Map();
  const compNorm = competition
    ? normalizeTeamName(competition)
    : rawCompetitionFallback
      ? normalizeTeamName(rawCompetitionFallback)
      : null;

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
    const date = winnerDateToIso(m.e_date);
    if (dateKey && date !== dateKey) continue;
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
  { key: "ליגת האלופות", terms: ["ליגת האלופות", "champions league", "ucl", "champion league"] },
  { key: "ליגה אירופאית", terms: ["ליגה אירופאית", "europa league", "uel"] },
  { key: "קונפרנס", terms: ["קונפרנס", "conference league", "uecl"] },
  { key: "סופר קאפ", terms: ["סופר קאפ", "super cup", "supercup", "uefa super"] },
  { key: "ליגת האומות", terms: ["ליגת האומות", "ליגה לאומית", "nations league", "uefa nations", "nations"] },
  { key: "יורו", terms: ["יורו", "euro 20", "european championship", "uefa euro", "אליפות אירופה"] },
  { key: "מונדיאל", terms: ["מונדיאל", "world cup", "fifa world", "גביע העולם", "wc 20"] },
  { key: "קופה אמריקה", terms: ["קופה אמריקה", "copa america", "copa améri"] },
  { key: "גביע אפריקה", terms: ["גביע אפריקה", "africa cup", "afcon", "can 20", "cup of nations"] },
  { key: "אסיאן קאפ", terms: ["אסיאן קאפ", "asian cup", "afc asian cup"] },
  { key: "גולד קאפ", terms: ["גולד קאפ", "gold cup", "concacaf gold"] },
  { key: "פרמייר ליג", terms: ["פרמייר ליג", "premier league", "epl", "אנגלית ראשונה", "english premier"] },
  { key: "צ'מפיונשיפ", terms: ["צ'מפיונשיפ", "championship", "efl championship", "אנגלית שנייה"] },
  { key: "גביע FA", terms: ["גביע fa", "fa cup", "גביע אנגליה"] },
  { key: "ליג קאפ", terms: ["ליג קאפ", "league cup", "carabao cup", "efl cup"] },
  { key: "לה ליגה", terms: ["לה ליגה", "la liga", "laliga", "ספרדית ראשונה"] },
  { key: "סגונדה", terms: ["סגונדה", "segunda", "ספרדית שנייה"] },
  { key: "קופה דל ריי", terms: ["קופה דל ריי", "copa del rey", "גביע ספרד"] },
  { key: "בונדסליגה", terms: ["בונדסליגה", "bundesliga", "גרמנית ראשונה"] },
  { key: "בונדסליגה 2", terms: ["בונדסליגה 2", "2. bundesliga", "גרמנית שנייה"] },
  { key: "DFB פוקאל", terms: ["dfb pokal", "dfb-pokal", "גביע גרמניה"] },
  { key: "סריה א", terms: ["סריה א", "serie a", "serie-a", "איטלקית ראשונה"] },
  { key: "סריה ב", terms: ["סריה ב", "serie b", "איטלקית שנייה"] },
  { key: "קופה איטליה", terms: ["קופה איטליה", "coppa italia", "גביע איטליה"] },
  { key: "ליג 1", terms: ["ליג 1", "ligue 1", "ligue-1", "צרפתית ראשונה"] },
  { key: "ליג 2", terms: ["ליג 2", "ligue 2", "צרפתית שנייה"] },
  { key: "קופה דה פראנס", terms: ["קופה דה פראנס", "coupe de france", "גביע צרפת"] },
  { key: "פורטוגלית", terms: ["פורטוגלית", "primeira liga", "liga portugal", "פורטוגל"] },
  { key: "ארדיביזי", terms: ["ארדיביזי", "eredivisie", "הולנדית", "dutch eredivisie"] },
  { key: "בלגית", terms: ["בלגית", "jupiler pro", "belgian first", "בלגיה"] },
  { key: "סופר ליג טורקיה", terms: ["טורקית", "super lig", "süper lig", "turkish süper", "טורקיה"] },
  { key: "פרמייר ליג סקוטלנד", terms: ["סקוטית", "scottish premiership", "spfl", "סקוטלנד"] },
  { key: "סופר ליג יוון", terms: ["יוונית", "super league greece", "greek super", "יוון"] },
  { key: "שווייצרית", terms: ["שווייצרית", "swiss super league", "שווייץ"] },
  { key: "אוסטרית", terms: ["אוסטרית", "austrian bundesliga", "admiral bundesliga", "אוסטריה"] },
  { key: "שבדית", terms: ["שבדית", "allsvenskan", "שבדיה"] },
  { key: "נורבגית", terms: ["נורבגית", "eliteserien", "נורבגיה"] },
  { key: "דנית", terms: ["דנית", "danish superliga", "דנמרק"] },
  { key: "פינית", terms: ["פינית", "veikkausliiga", "פינלנד"] },
  { key: "רוסית", terms: ["רוסית", "russian premier", "רפל", "רוסיה"] },
  { key: "אוקראינית", terms: ["אוקראינית", "ukrainian premier", "ukraine"] },
  { key: "פולנית", terms: ["פולנית", "ekstraklasa", "פולין"] },
  { key: "ליגת העל", terms: ["ליגת העל", "israeli premier", "ישראלית ראשונה", "ליגה ראשונה ישראל"] },
  { key: "ליגה לאומית ישראל", terms: ["ליגה לאומית", "leumit", "ישראלית שנייה", "ליגה לאומית ישראל"] },
  { key: "גביע המדינה", terms: ["גביע המדינה", "state cup", "גביע ישראל", "גביע הטוטו"] },
  { key: "MLS", terms: ["mls", "major league soccer"] },
  { key: "ליגה MX", terms: ["ליגה mx", "liga mx", "מקסיקנית", "מקסיקו"] },
  { key: "ברזילאית", terms: ["ברזילאית", "brasileirao", "campeonato brasileiro", "ברזיל"] },
  { key: "ארגנטינאית", terms: ["ארגנטינאית", "liga profesional", "primera division argentina", "ארגנטינה"] },
  { key: "קופה ליברטדורס", terms: ["ליברטדורס", "copa libertadores", "libertadores"] },
  { key: "קופה סודאמריקאנה", terms: ["סודאמריקאנה", "copa sudamericana", "sudamericana"] },
  { key: "AFC ליגת האלופות", terms: ["afc champions", "ליגת האלופות afc", "asian champions"] },
  { key: "J-League", terms: ["j-league", "j league", "jleague", "יפנית"] },
  { key: "K-League", terms: ["k-league", "k league", "kleague", "קוריאנית"] },
  { key: "סינית", terms: ["סינית", "chinese super league", "csl", "סין"] },
  { key: "סאודית", terms: ["סאודית", "saudi pro league", "roshn", "ערב הסעודית"] },
  { key: "אמירויות", terms: ["אמירויות", "uae pro league", "emirates"] },
  { key: "קטרית", terms: ["קטרית", "qatar stars league", "קטר"] },
  { key: "NBA", terms: ["nba"] },
  { key: "יורוליג", terms: ["יורוליג", "euroleague", "euro league"] },
  { key: "יורוקאפ", terms: ["יורוקאפ", "eurocup"] },
  { key: "NCAA", terms: ["ncaa", "college basketball", "march madness"] },
  { key: "כדורסל ישראל", terms: ["כדורסל ישראל", "ליגת winner כדורסל", "winner league basketball"] },
  { key: "FIBA", terms: ["fiba", "אליפות עולם כדורסל", "basketball world cup"] },
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

  const hasDateWord = /היום|מחר|אתמול|today|tomorrow|yesterday/.test(lc);
  let offset = 0;
  let dateKey = null;
  if (hasDateWord) {
    if (/מחר|tomorrow/.test(lc)) offset = 1;
    else if (/אתמול|yesterday/.test(lc)) offset = -1;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem" }).format(d);
  }

  let competition = null;
  for (const { key, terms } of COMPETITION_MAP) {
    if (terms.some(t => lc.includes(t))) { competition = key; break; }
  }
  const rawCompetitionFallback = !competition && !home && !away ? text : null;
  const isFinal = /גמר|final/.test(lc);

  return { home, away, dateKey, offset, competition, rawCompetitionFallback, isFinal, hasDateWord };
}

// ── Gemini API call ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an elite sports intelligence agent — sharp, honest, and conversational.
Your domain is sports, odds, statistics, fixtures, and predictions. Respond in Hebrew at all times.

## Core rules
- You NEVER invent games, fabricate fixtures, or hallucinate odds.
- You answer confidently when data is present, and honestly when it is not.
- You never give betting instructions or guarantee outcomes.

## When the match IS found (Winner data has ✅)
Analyze in 4-5 clear sections:
1. סגנון משחק ואיכות
2. ביצועים אחרונים
3. היסטוריה H2H
4. ניתוח טקטי
5. תחזית — pick a clear winner, include a suggested score

Always end with:
**🏆 אני חושב ש-[קבוצה] ינצחו.**

## When the match is NOT found (Winner data has ⚠️ or "לא מצאתי")
You MUST respond exactly like this:
"לא מצאתי את המשחק הזה ב-Winner. תוכל לציין תאריך, ליגה, או תחרות?"
Then STOP. Do NOT invent a game or fabricate analysis.
You may add one sentence of genuine H2H context if you know it — clearly labeled "מידע כללי".

## When asked "מה לשים" / "על מה להמר"
Say: "אני לא נותן הוראות להמר." then give sports analysis only.`;


async function callGemini(userMessage, conversationHistory) {
  if (!GEMINI_API_KEY) {
    return "הפוגע AI לא מופעל — מפתח GEMINI_API_KEY חסר. יש להגדיר אותו ב-Vercel environment variables.";
  }

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
    const { home, away, dateKey, offset, competition, rawCompetitionFallback, isFinal } = parseQuery(query);

    let winnerSection = "";
    let matchInfo = null;

    try {
      const markets = await getWinnerLine();
      const dateLabel = offset === 0 ? "היום" : offset === 1 ? "מחר" : "אתמול";

      let found = (home || away) ? findMatchInMarkets(markets, home, away, dateKey) : null;
      if (!found && (home || away)) found = findMatchInMarkets(markets, home, away, null);

      if (found) {
        matchInfo = { desc: found.desc, league: found.league, date: found.date };
        const formatted = formatMarketsForPrompt(markets, found.eId);
        const dl = found.date === dateKey ? dateLabel : found.date;
        winnerSection = `✅ נמצא ב-Winner: ${found.desc}\nליגה: ${found.league}\nתאריך: ${dl} (${found.date})\n\nשווקים ויחסים:\n${formatted}`;

      } else {
        const contextMatches = findMatchesByContext(markets, { competition, rawCompetitionFallback, dateKey, isFinal });

        if (contextMatches.length === 1) {
          const m = contextMatches[0];
          matchInfo = { desc: m.desc, league: m.league, date: m.date };
          const formatted = formatMarketsForPrompt(markets, m.eId);
          winnerSection = `✅ נמצא ב-Winner: ${m.desc}\nליגה: ${m.league}\nתאריך: ${m.date} ${m.time}\n\nשווקים ויחסים:\n${formatted}`;

        } else if (contextMatches.length > 1) {
          const lines = contextMatches.slice(0, 8).map(m => {
            const odds = formatMarketsForPrompt(markets, m.eId);
            return `📅 ${m.date} ${m.time} | ${m.league}\n⚽ ${m.desc}\n${odds}`;
          }).join("\n\n---\n\n");
          winnerSection = `נמצאו ${contextMatches.length} משחקים רלוונטיים ב-Winner:\n\n${lines}`;

        } else if (home || away) {
          winnerSection = `⚠️ לא מצאתי "${[home, away].filter(Boolean).join(" נגד ")}" ב-Winner. ייתכן שהמשחק עבר, נדחה, או שם הקבוצה שונה.`;

        } else {
          if (dateKey) {
            const schedule = formatScheduleSummary(markets, dateKey);
            winnerSection = schedule.length > 0
              ? `לוח משחקים ${dateLabel} (${dateKey}) ב-Winner:\n${schedule.join("\n")}`
              : `לא מצאתי משחקים ב-Winner ל-${dateLabel} (${dateKey}).`;
          } else {
            const allUpcoming = formatScheduleSummary(markets, null);
            winnerSection = allUpcoming.length > 0
              ? `משחקים קרובים ב-Winner:\n${allUpcoming.join("\n")}`
              : "לא מצאתי משחקים קרובים ב-Winner כרגע.";
          }
        }
      }
    } catch (winnerErr) {
      winnerSection = `⚠️ לא הצלחתי להתחבר ל-Winner (${winnerErr.message}). אענה לפי ידע כללי.`;
    }

    const safeQuery = query.replace(/`/g, "'").replace(/\$\{/g, "\\${" );
    const notFound = winnerSection && (winnerSection.startsWith("⚠️ לא מצאתי") || winnerSection.startsWith("⚠️ לא הצלחתי"));
    const instruction = notFound
      ? "המשחק לא נמצא ב-Winner. פעל לפי כלל NOT FOUND בהנחיות המערכת: אמור שלא מצאת ובקש הבהרה."
      : "אם יש אודס — חשב הסתברות גלומה (1/אודס). ענה לפי הנחיות המערכת.";
    const userMessage = `שאלת המשתמש: ${safeQuery}\n\n--- נתוני Winner בזמן אמת ---\n${winnerSection || "(לא נמצא)"}\n-----------------------------\n\n${instruction}`;

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
