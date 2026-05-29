const crypto = require("crypto");
const { rateLimit, sanitizeInput } = require("./_rate-limit");

const GROQ_API_KEY = process.env.AI_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile";

const FOOTBALL_API_KEY = process.env.FOOTBALL_KEY;
const ODDS_API_KEY_EXT = process.env.ODDS_API_KEY;
const ODDS_API_EXT = "https://api.the-odds-api.com/v4";

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

// ── API-Football (api-sports.io) ──────────────────────────────────────────────

async function fetchApiFootballData(home, away) {
  if (!FOOTBALL_API_KEY) return null;
  try {
    const teamRes = await fetch(
      `https://v3.football.api-sports.io/teams?search=${encodeURIComponent(home.slice(0, 25))}`,
      { headers: { "x-apisports-key": FOOTBALL_API_KEY }, signal: AbortSignal.timeout(9000) }
    );
    if (!teamRes.ok) return null;
    const teamData = await teamRes.json();
    const teamId = teamData.response?.[0]?.team?.id;
    if (!teamId) return null;

    const fixRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&next=10`,
      { headers: { "x-apisports-key": FOOTBALL_API_KEY }, signal: AbortSignal.timeout(9000) }
    );
    if (!fixRes.ok) return null;
    const fixData = await fixRes.json();

    for (const f of (fixData.response || [])) {
      const fHome = f.teams?.home?.name || "";
      const fAway = f.teams?.away?.name || "";
      const score = teamMatchScore(home, fHome) + teamMatchScore(away, fAway);
      const revScore = teamMatchScore(home, fAway) + teamMatchScore(away, fHome);
      if (Math.max(score, revScore) < 0.8) continue;

      const league = f.league?.name || "";
      const country = f.league?.country || "";
      const date = (f.fixture?.date || "").slice(0, 10);
      const time = (f.fixture?.date || "").slice(11, 16);
      const venue = f.fixture?.venue?.name || "";
      const round = f.league?.round || "";
      const parts = [
        `📊 API-Football: ${fHome} vs ${fAway}`,
        `ליגה: ${league}${country ? ` (${country})` : ""}${round ? ` — ${round}` : ""}`,
        `תאריך: ${date}${time ? ` ${time} UTC` : ""}${venue ? ` | ${venue}` : ""}`,
      ];
      return parts.join("\n");
    }
    return null;
  } catch {
    return null;
  }
}

// ── The Odds API (external odds when Winner is blocked) ───────────────────────

const ODDS_SPORT_MAP = {
  "ליגת האלופות": "soccer_uefa_champs_league",
  "ליגה אירופאית": "soccer_uefa_europa_league",
  "קונפרנס": "soccer_uefa_europa_conference_league",
  "פרמייר ליג": "soccer_epl",
  "בונדסליגה": "soccer_germany_bundesliga",
  "סריה א": "soccer_italy_serie_a",
  "ליג 1": "soccer_france_ligue_one",
  "לה ליגה": "soccer_spain_la_liga",
  "ארדיביזי": "soccer_netherlands_eredivisie",
  "סופר ליג טורקיה": "soccer_turkey_super_league",
  "פרמייר ליג סקוטלנד": "soccer_scotland_premier_league",
  "פורטוגלית": "soccer_portugal_primeira_liga",
  "בלגית": "soccer_belgium_first_div",
  "שבדית": "soccer_sweden_allsvenskan",
  "נורבגית": "soccer_norway_eliteserien",
  "דנית": "soccer_denmark_superliga",
  "ליגת העל": "soccer_israel_premier_league",
  "MLS": "soccer_usa_mls",
  "ליגה MX": "soccer_mexico_ligamx",
  "ברזילאית": "soccer_brazil_campeonato",
  "ארגנטינאית": "soccer_argentina_primera_division",
  "קופה ליברטדורס": "soccer_conmebol_copa_libertadores",
  "NBA": "basketball_nba",
  "יורוליג": "basketball_euroleague",
  "NCAA": "basketball_ncaab",
};

const ODDS_FALLBACK_KEYS = [
  "soccer_epl",
  "soccer_uefa_champs_league",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
];

async function fetchOddsApiData(home, away, competition) {
  if (!ODDS_API_KEY_EXT) return null;
  const mappedKey = competition ? ODDS_SPORT_MAP[competition] : null;
  const keysToTry = mappedKey ? [mappedKey] : ODDS_FALLBACK_KEYS.slice(0, 2);

  for (const sportKey of keysToTry) {
    try {
      const url = `${ODDS_API_EXT}/sports/${sportKey}/odds?apiKey=${ODDS_API_KEY_EXT}&regions=eu&markets=h2h&oddsFormat=decimal`;
      const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) continue;
      const events = await res.json();

      for (const ev of (Array.isArray(events) ? events : [])) {
        const s1 = teamMatchScore(home, ev.home_team) + teamMatchScore(away, ev.away_team);
        const s2 = teamMatchScore(home, ev.away_team) + teamMatchScore(away, ev.home_team);
        if (Math.max(s1, s2) < 0.9) continue;

        const bookmaker = ev.bookmakers?.[0];
        if (!bookmaker) continue;
        const h2h = bookmaker.markets?.find(m => m.key === "h2h");
        if (!h2h?.outcomes?.length) continue;

        const outcomeLines = h2h.outcomes
          .map(o => `  ${o.name}: ${Number(o.price).toFixed(2)} (${(100 / o.price).toFixed(1)}%)`)
          .join("\n");
        const date = new Date(ev.commence_time).toLocaleDateString("he-IL");
        return `💰 The Odds API (${bookmaker.title}): ${ev.home_team} vs ${ev.away_team}\nתאריך: ${date}\nיחסים:\n${outcomeLines}`;
      }
    } catch {
      continue;
    }
  }
  return null;
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

// ── Groq API call ────────────────────────────────────────────────────────────

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

## When live odds data is provided
Use the real odds as statistical context — calculate implied probability (1/odds), note market edges, and use them to support your analysis. Never invent odds.

## When NO live data is available — CRITICAL RULE
If no live odds or fixture data is available (Winner blocked, match not found, etc.) — DO NOT refuse to answer.
Instead: give a FULL analysis based on your training knowledge.
You have deep knowledge of team styles, historical H2H, tactical systems, coach philosophies, standings, and squad depth.
Focus on TACTICAL analysis, historical patterns, and team strengths/weaknesses — NOT on specific current player rosters, which may have changed since your training cutoff.
Use that knowledge confidently. Just note briefly at the end: "⚠️ ניתוח מבוסס ידע כללי — אין נתוני אודס בזמן אמת."
Never say "אין לי מספיק נתונים" or "לא אוכל לספק ניתוח" — you always CAN analyze.

## Short follow-up messages — CRITICAL RULE
If the user sends a very short or vague message like "מחר", "ומה עם הגמר?", "ואם?", "כן", "מה הסיכויים?" —
ALWAYS treat it as a follow-up to the previous message in the conversation history.
Look at the conversation history to understand the context (which match, which teams, which competition).
Do NOT ask "מי הקבוצות?" if the previous messages already established the context.
Continue the conversation naturally, like ChatGPT would.

## Betting instruction rule
If the user asks "מה לשים", "על מה להמר" or similar — respond: "אני לא נותן הוראות להמר. לפי הנתונים הספורטיביים..." and then give your analysis.`;


async function callGroq(userMessage, conversationHistory) {
  if (!GROQ_API_KEY) {
    return "הפוגע AI לא מופעל — מפתח AI_KEY חסר. יש להגדיר אותו ב-Vercel environment variables.";
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-6).map(h => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.text || "",
    })),
    { role: "user", content: userMessage },
  ];

  const body = {
    model: GROQ_MODEL,
    messages,
    max_tokens: 1500,
    temperature: 0.7,
  };

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [3000, 6000, 12000];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "לא קיבלתי תגובה.";
    }

    if (res.status === 429 && attempt < MAX_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      continue;
    }

    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API ${res.status}: ${errText.slice(0, 200)}`);
  }
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

  let winnerSection = "";
  let matchInfo = null;

  try {
    const { home, away, dateKey, offset, competition, rawCompetitionFallback, isFinal } = parseQuery(query);

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
      winnerSection = `⚠️ לא הצלחתי להתחבר ל-Winner (${winnerErr.message}).`;
    }

    // If Winner returned no useful data, fetch from external APIs in parallel
    const winnerLackingData = !winnerSection ||
      winnerSection.startsWith("⚠️") ||
      winnerSection.startsWith("לא מצאתי");

    if (winnerLackingData && (home || away)) {
      const [apifResult, oddsResult] = await Promise.allSettled([
        (home && away) ? fetchApiFootballData(home, away) : Promise.resolve(null),
        (home || away) ? fetchOddsApiData(home || "", away || "", competition) : Promise.resolve(null),
      ]);
      const extras = [];
      if (apifResult.status === "fulfilled" && apifResult.value) extras.push(apifResult.value);
      if (oddsResult.status === "fulfilled" && oddsResult.value) extras.push(oddsResult.value);
      if (extras.length > 0) {
        winnerSection = (winnerLackingData && winnerSection ? winnerSection + "\n\n" : "") + extras.join("\n\n");
      }
    }

    const safeQuery = query.replace(/`/g, "'").replace(/\$\{/g, "\\${" );
    const userMessage = `שאלת המשתמש: ${safeQuery}\n\n--- נתוני Winner בזמן אמת ---\n${winnerSection}\n-----------------------------\n\nענה בעברית. אם יש אודס — חשב הסתברות גלומה (1/אודס). אל תיתן הוראות הימור. אם אין נתונים מספיקים — ציין זאת בבירור.`;

    const answer = await callGroq(userMessage, history);

    res.status(200).json({ ok: true, answer, matchInfo });
  } catch (err) {
    console.error("Reuven API error:", err);
    const isQuota = /429|quota|rate.?limit/i.test(err.message);
    if (isQuota) {
      const hasWinnerData = winnerSection && !winnerSection.startsWith("⚠️") && winnerSection.length > 20;
      const answer = hasWinnerData
        ? `ה-AI לא זמין כרגע (מכסה יומית מוצתה). הנה נתוני Winner ישירות:\n\n${winnerSection}`
        : `ה-AI לא זמין כרגע (מכסה יומית מוצתה). ${winnerSection || "נסה שוב מאוחר יותר."}`;
      res.status(200).json({ ok: false, answer, matchInfo });
      return;
    }
    res.status(200).json({
      ok: false,
      answer: `שגיאה טכנית: ${err.message}. אנא נסה שוב.`,
      matchInfo: null,
    });
  }
};
