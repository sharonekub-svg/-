const crypto = require("crypto");
const SNAPSHOT = require("./winner-snapshot.json");

const ODDS_MIN = 1.4;
const ODDS_MAX = 1.9;
const SUPABASE_URL = "https://jgcmtrlviuivbtimtqjq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnY210cmx2aXVpdmJ0aW10cWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTc5NzYsImV4cCI6MjA5MTY5Mzk3Nn0.LxaX1xDcvLFPtF4Q5QnUlV4zeHQBeDwlcJq3nao3mqk";
const SPORTS = {
  240: "כדורגל",
  227: "כדורסל",
};
const LEAGUE_LOGOS = {
  NBA: "https://a.espncdn.com/i/leaguelogos/nba/500/nba.png",
  "גביע קולומביאני": "https://media.api-sports.io/football/leagues/241.png",
  "גביע אקוודורי": "https://media.api-sports.io/football/leagues/917.png",
  "צ'יליאנית שניה": "https://media.api-sports.io/football/leagues/266.png",
  "צ'מפיונשיפ": "https://media.api-sports.io/football/leagues/40.png",
  "אנגלית ראשונה": "https://media.api-sports.io/football/leagues/39.png",
  "ספרדית ראשונה": "https://media.api-sports.io/football/leagues/140.png",
  "איטלקית ראשונה": "https://media.api-sports.io/football/leagues/135.png",
  "גרמנית ראשונה": "https://media.api-sports.io/football/leagues/78.png",
  "הולנדית ראשונה": "https://media.api-sports.io/football/leagues/88.png",
  "בלגית ראשונה": "https://media.api-sports.io/football/leagues/144.png",
  "אירית ראשונה": "https://media.api-sports.io/football/leagues/357.png",
  "אירית שניה": "https://media.api-sports.io/football/leagues/358.png",
  "סקוטית ראשונה": "https://media.api-sports.io/football/leagues/179.png",
  "אוסטרלית ראשונה": "https://media.api-sports.io/football/leagues/188.png",
  "בוליביאנית ראשונה": "https://media.api-sports.io/football/leagues/344.png",
  "פרואנית ראשונה": "https://media.api-sports.io/football/leagues/281.png",
  "איסלנדית ראשונה": "https://media.api-sports.io/football/leagues/164.png",
  "מרוקאית ראשונה": "https://media.api-sports.io/football/leagues/200.png",
  "ספרדית שלישית": "https://media.api-sports.io/football/leagues/437.png",
  "אזרית ראשונה": "https://media.api-sports.io/football/leagues/419.png",
  "סינית ראשונה": "https://media.api-sports.io/football/leagues/169.png",
  "סלובנית ראשונה": "https://media.api-sports.io/football/leagues/373.png",
  "פולנית ראשונה": "https://media.api-sports.io/football/leagues/106.png",
  "אינדונזית ראשונה": "https://media.api-sports.io/football/leagues/274.png",
  "פינית שניה": "https://media.api-sports.io/football/leagues/244.png",
  "יפנית ראשונה": "https://media.api-sports.io/football/leagues/98.png",
};
const TEAM_LOGOS = {
  "אוקלהומה סיטי ת'אנדר": "https://a.espncdn.com/i/teamlogos/nba/500/okc.png",
  "סאן אנטוניו ספרס": "https://a.espncdn.com/i/teamlogos/nba/500/sas.png",
  "אינדיאנה פייסרס": "https://a.espncdn.com/i/teamlogos/nba/500/ind.png",
  "ניו יורק ניקס": "https://a.espncdn.com/i/teamlogos/nba/500/ny.png",
  "מינסוטה טימברוולבס": "https://a.espncdn.com/i/teamlogos/nba/500/min.png",
};

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
      devicemodel: "",
      deviceos: "windows",
      deviceosversion: "10",
      appversion: "2.6.1",
      apptype: "desktop",
      originId: 15,
      isAccessibility: false,
    }),
    appVersion: "2.6.1",
    ...extra,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status}: ${text.slice(0, 240)}`);
  }
  return text ? JSON.parse(text) : null;
}

function israelDate(offsetDays = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function winnerDateToIso(value) {
  const raw = String(value || "");
  if (raw.length !== 6) return "";
  return `20${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
}

function winnerHour(value) {
  const raw = String(value || "").padStart(4, "0");
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

function decimal(value) {
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function splitTeams(match) {
  const [home, away] = cleanText(match).split(" - ").map(cleanText);
  return { home: home || cleanText(match), away: away || "" };
}

function cleanText(value) {
  return String(value || "")
    .replace(/[\u202A-\u202E\u202C\u200E\u200F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function initials(value) {
  return cleanText(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

async function supabaseSearch(table, term) {
  const value = cleanText(term);
  if (!value || value.length < 2) return null;
  const query = `${table}?select=id,name,name_he,logo_url,slug&or=(name_he.ilike.*${encodeURIComponent(value)}*,name.ilike.*${encodeURIComponent(value)}*)&limit=5`;
  const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  }).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return null;
  const exact = rows.find((row) => cleanText(row.name_he) === value || cleanText(row.name) === value);
  return exact || rows[0];
}

async function enrichLogos(rows) {
  const teamCache = new Map();
  const leagueCache = new Map();
  async function teamAsset(name) {
    const key = cleanText(name);
    if (!teamCache.has(key)) teamCache.set(key, await supabaseSearch("teams", key));
    const row = teamCache.get(key);
    const mappedLogo = TEAM_LOGOS[key] || "";
    return {
      name: key,
      logo: row?.logo_url || mappedLogo,
      initials: initials(key),
      logoSource: row?.logo_url ? "win2go teams" : mappedLogo ? "curated teams" : "fallback initials",
    };
  }
  async function leagueAsset(name) {
    const key = cleanText(name);
    if (!leagueCache.has(key)) leagueCache.set(key, await supabaseSearch("leagues", key));
    const row = leagueCache.get(key);
    const mappedLogo = LEAGUE_LOGOS[key] || "";
    return {
      name: key,
      logo: row?.logo_url || mappedLogo,
      initials: initials(key),
      logoSource: row?.logo_url ? "win2go leagues" : mappedLogo ? "curated leagues" : "fallback initials",
    };
  }
  return Promise.all(rows.map(async (row) => {
    const [homeAsset, awayAsset, leagueAssetValue] = await Promise.all([
      teamAsset(row.home),
      teamAsset(row.away),
      leagueAsset(row.league),
    ]);
    return { ...row, homeAsset, awayAsset, leagueAsset: leagueAssetValue };
  }));
}

function marketReliability(title, sportId) {
  const text = cleanText(title);
  if (sportId === 240 && text.includes("1X2") && text.includes("תוצאת סיום")) return 0.98;
  if (sportId === 227 && text.includes("המנצח")) return 0.97;
  if (text.includes("מעל/מתחת")) return 0.91;
  if (text.includes("הימור יתרון")) return 0.88;
  return 0.72;
}

function marketCategory(title) {
  const clean = cleanText(title);
  if (clean.includes("1X2") || clean.includes("המנצח")) return "מנצח";
  if (clean.includes("מעל/מתחת")) return "מעל/מתחת";
  if (clean.includes("הימור יתרון")) return "יתרון";
  if (clean.includes("מבקיע") || clean.includes("סל ראשון") || clean.includes("שער ראשון")) return "ראשון במשחק";
  if (clean.includes("מחצית")) return "מחציות";
  return "שוק נוסף";
}

function scoreAnyOutcome(market, outcome) {
  const odds = decimal(outcome.price);
  if (!odds) return null;
  const reliability = marketReliability(market.mp, market.sId);
  const implied = 1 / odds;
  const sourceDepth = Math.min(1, Number(market.count || market.outcomes?.length || 1) / 8);
  const hitProbability = Math.max(0.08, Math.min(0.82, implied * reliability));
  const score = Math.round(hitProbability * 68 + reliability * 18 + sourceDepth * 14);
  return {
    outcomeId: outcome.outcomeId,
    desc: cleanText(outcome.desc),
    price: odds,
    spread: cleanText(outcome.spread),
    probability: hitProbability,
    score,
  };
}

function buildEventMarkets(eventMarkets) {
  return eventMarkets.map((market) => {
    const outcomes = (market.outcomes || [])
      .map((outcome) => scoreAnyOutcome(market, outcome))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || b.price - a.price);
    return {
      marketId: market.mId,
      title: cleanText(market.mp),
      category: marketCategory(market.mp),
      bettable: outcomes.length > 0,
      best: outcomes[0] || null,
      outcomes,
    };
  }).filter((market) => market.bettable);
}

function allowedMarket(market) {
  const title = cleanText(market.mp);
  const desc = cleanText(market.desc);
  if (!SPORTS[market.sId]) return false;
  if (title.includes("תוצאה מדויקת")) return false;
  if (title.includes("מחצית/סיום")) return false;
  if (title.includes("מחצית ראשונה")) return false;
  if (title.includes("רבע ראשון")) return false;
  if (title.includes("סל ראשון")) return false;
  if (title.includes("הראשונה ל")) return false;
  if (title.includes("מבקיע")) return false;
  if (title.includes("קרנות")) return false;
  if (title.includes("הזוכה")) return false;
  if (desc.includes("הזוכה")) return false;
  if (market.sId === 240) {
    return title.includes("1X2") && title.includes("תוצאת סיום");
  }
  if (market.sId === 227) {
    return title.includes("המנצח");
  }
  return false;
}

function scoreOutcome(market, outcome) {
  const odds = decimal(outcome.price);
  if (!odds || odds < ODDS_MIN || odds > ODDS_MAX) return null;
  const reliability = marketReliability(market.mp, market.sId);
  const implied = 1 / odds;
  const sourceDepth = Math.min(1, Number(market.count || market.outcomes?.length || 1) / 8);
  const hitProbability = Math.max(0.42, Math.min(0.78, implied * reliability));
  const score = Math.round(
    hitProbability * 72 +
      reliability * 18 +
      sourceDepth * 10
  );
  return {
    outcomeId: outcome.outcomeId,
    pick: cleanText(outcome.desc),
    odds,
    implied,
    hitProbability,
    reliability,
    score,
  };
}

function describeWinnerPick(market, scored) {
  const outcomes = (market.outcomes || [])
    .map((outcome) => ({
      desc: cleanText(outcome.desc),
      odds: decimal(outcome.price),
    }))
    .filter((outcome) => outcome.odds)
    .sort((a, b) => a.odds - b.odds);
  const favorite = outcomes[0];
  const alternatives = outcomes
    .filter((outcome) => outcome.desc !== scored.pick)
    .slice(0, 2)
    .map((outcome) => `${outcome.desc} ${outcome.odds.toFixed(2)}`)
    .join(", ");
  const pickText = cleanText(scored.pick).toLowerCase() === "x" ? "תיקו" : scored.pick;
  if (favorite?.desc === scored.pick) {
    return `Winner מתמחר את ${pickText} כבחירה החזקה בשוק הזה: היחס ${scored.odds.toFixed(2)} הוא הנמוך ביותר, כלומר הסתברות השוק הגבוהה ביותר. ${alternatives ? `החלופות בשוק: ${alternatives}.` : ""}`;
  }
  return `הבחירה ${pickText} נשארת בטווח היחסים המבוקש עם יחס ${scored.odds.toFixed(2)} והסתברות שוק של ${Math.round(scored.implied * 100)} אחוז. ${favorite ? `הפייבוריט לפי Winner הוא ${favorite.desc} ביחס ${favorite.odds.toFixed(2)}.` : ""}`;
}

function buildCurrentPicks(markets, dateKey) {
  const events = new Map();
  for (const market of markets) {
    const date = winnerDateToIso(market.e_date);
    if (date !== dateKey || !allowedMarket(market)) continue;
    for (const outcome of market.outcomes || []) {
      const scored = scoreOutcome(market, outcome);
      if (!scored) continue;
      const teams = splitTeams(market.desc);
      const eventMarkets = buildEventMarkets(markets.filter((candidate) => candidate.eId === market.eId));
      const current = events.get(market.eId);
      const row = {
        id: `winner-${market.eId}`,
        eventId: String(market.eId),
        source: "Winner",
        day: dateKey,
        time: winnerHour(market.m_hour),
        sport: SPORTS[market.sId],
        sportId: market.sId,
        league: cleanText(market.league),
        country: cleanText(market.country),
        match: cleanText(market.desc),
        home: teams.home,
        away: teams.away,
        market: cleanText(market.mp),
        marketId: market.mId,
        outcomeId: scored.outcomeId,
        pick: scored.pick,
        winnerPick: cleanText(scored.pick).toLowerCase() === "x" ? "תיקו" : scored.pick,
        odds: scored.odds,
        probability: scored.hitProbability,
        score: scored.score,
        status: "ממתין",
        result: "",
        signals: [
          `הסתברות שוק ${Math.round(scored.implied * 100)} אחוז`,
          `אמינות שוק ${Math.round(scored.reliability * 100)} אחוז`,
          `יחס Winner ${scored.odds.toFixed(2)}`,
        ],
        allMarkets: eventMarkets,
        explanation: [
          "המשחק מופיע בווינר-ליין ולכן ניתן להמר עליו בזמן משיכת הנתונים.",
          describeWinnerPick(market, scored),
          "הפירוט מבוסס על יחסי Winner בלבד. אין כאן המצאה של פציעות, הרכבים או מידע שלא חזר מהמקור.",
        ],
      };
      if (!current || row.score > current.score || (row.score === current.score && row.odds < current.odds)) {
        events.set(market.eId, row);
      }
    }
  }
  return [...events.values()].sort((a, b) => b.score - a.score || a.odds - b.odds).slice(0, 10);
}

function resultStatus(event, pick) {
  const results = (event.markets || []).flatMap((market) => market.marketResults || []).map(cleanText);
  if (!results.length) return "ממתין";
  const cleanPick = cleanText(pick);
  return results.some((result) => result === cleanPick || result.includes(cleanPick) || cleanPick.includes(result))
    ? "תפס"
    : "נפל";
}

function buildResultRows(results, dateKey) {
  return (results || [])
    .filter((event) => ["240", "227"].includes(String(event.sportid)) && event.date === dateKey)
    .map((event) => {
      const markets = event.markets || [];
      const market = markets.find((m) => cleanText(m.title).includes("1X2")) ||
        markets.find((m) => cleanText(m.title).includes("המנצח"));
      if (!market) return null;
      const pick = cleanText(event.teamA);
      const status = resultStatus(event, pick);
      const teams = { home: cleanText(event.teamA), away: cleanText(event.teamB) };
      return {
        id: `result-${event.eventid}`,
        eventId: String(event.eventid),
        source: "Winner Results",
        day: dateKey,
        time: String(event.time || "").slice(0, 5),
        sport: SPORTS[Number(event.sportid)] || "ספורט",
        sportId: Number(event.sportid),
        league: cleanText(event.league),
        country: "",
        match: `${cleanText(event.teamA)} - ${cleanText(event.teamB)}`,
        home: teams.home,
        away: teams.away,
        market: cleanText(market?.title || "תוצאת משחק"),
        pick,
        odds: null,
        probability: null,
        score: status === "תפס" ? 62 : 38,
        status,
        result: event.scoreA && event.scoreB ? `${event.scoreA}:${event.scoreB}` : cleanText(event.noScoreLabel || ""),
        signals: ["תוצאה רשמית מווינר", "בחירת ארכיון ללא יחס", "לא הוזן משחק ידני"],
        allMarkets: (event.markets || []).map((item) => ({
          marketId: null,
          title: cleanText(item.title),
          category: marketCategory(item.title),
          bettable: false,
          best: null,
          outcomes: (item.marketResults || []).map((result) => ({
            outcomeId: null,
            desc: cleanText(result),
            price: null,
            spread: "",
            probability: null,
            score: null,
          })),
        })),
        explanation: [
          "זהו משחק מארכיון התוצאות של Winner.",
          "ממשק התוצאות הציבורי מחזיר תוצאה ושווקים שנסגרו, אך לא מחזיר יחס סגירה לכל בחירה.",
          "לכן הדמו מסמן תפס או נפל לפי תוצאה רשמית בלבד ולא ממציא יחס עבר.",
        ],
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

async function getWinnerLine() {
  const hashMessage = JSON.stringify({ prevCurrentVersion: null, reason: "Initiated" });
  const hashes = await fetchJson("https://api.winner.co.il/v2/publicapi/GetCMobileHashes", {
    headers: winnerHeaders({ HashesMessage: hashMessage }),
  });
  const lineMessage = JSON.stringify({
    prevCurrentVersion: null,
    newCurrentVersion: hashes.currentVersion,
    lineNewHash: hashes.lineChecksum,
    reason: "Hashes not equal",
  });
  const line = await fetchJson(
    `https://api.winner.co.il/v2/publicapi/GetCMobileLine?lineChecksum=${encodeURIComponent(hashes.lineChecksum)}`,
    { headers: winnerHeaders({ HashesMessage: lineMessage }) }
  );
  return { hashes, markets: line.markets || [] };
}

async function getResults(startDate, endDate) {
  const payload = {
    startDate: `${startDate}T00:00:00+03:00`,
    endDate: `${endDate}T23:59:59+03:00`,
    sports: [],
    leagues: [],
  };
  const data = await fetchJson("https://www.winner.co.il/api/v2/publicapi/GetResults", {
    method: "POST",
    headers: winnerHeaders(),
    body: JSON.stringify(payload),
  });
  return data?.results?.events || [];
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  try {
    const yesterday = israelDate(-1);
    const today = israelDate(0);
    const tomorrow = israelDate(1);
    const [{ hashes, markets }, resultEvents] = await Promise.all([
      getWinnerLine(),
      getResults(yesterday, today),
    ]);
    const yesterdayRows = await enrichLogos(buildResultRows(resultEvents, yesterday));
    const todayCurrent = await enrichLogos(buildCurrentPicks(markets, today));
    const todayResults = await enrichLogos(buildResultRows(resultEvents, today));
    const byId = new Map(todayCurrent.map((row) => [row.eventId, row]));
    for (const result of todayResults) {
      if (!byId.has(result.eventId)) byId.set(result.eventId, result);
    }
    const todayRows = [...byId.values()]
      .sort((a, b) => b.score - a.score || (b.odds || 0) - (a.odds || 0))
      .slice(0, 10);
    const tomorrowRows = await enrichLogos(buildCurrentPicks(markets, tomorrow));
    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      serverVersion: hashes.currentVersion,
      oddsRange: { min: ODDS_MIN, max: ODDS_MAX },
      tabs: {
        yesterday: { label: "אתמול", date: yesterday, rows: yesterdayRows },
        today: { label: "היום", date: today, rows: todayRows },
        tomorrow: { label: "מחר", date: tomorrow, rows: tomorrowRows },
      },
      notes: [
        "משחקים עתידיים נמשכים מווינר-ליין בלבד.",
        "תוצאות נמשכות מממשק התוצאות של ווינר.",
        "יחסי ארכיון אינם מוחזרים בממשק התוצאות הציבורי ולכן אינם מומצאים.",
      ],
    });
  } catch (error) {
    try {
      res.status(200).json({
        ...SNAPSHOT,
        ok: true,
        fallback: true,
        fallbackReason: "חיבור חי ל-Winner נחסם מסביבת השרת, לכן נטען snapshot מאומת שנמשך מ-Winner.",
        liveError: error.message,
      });
    } catch (snapshotError) {
      res.status(500).json({
        ok: false,
        error: "טעינת נתוני Winner נכשלה",
        detail: error.message,
        snapshotDetail: snapshotError.message,
      });
    }
  }
};
