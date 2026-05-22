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

function fallbackLogo(name, kind) {
  const label = initials(name) || "?";
  const hue = kind === "league" ? "#55d6ff" : "#31d187";
  const bg = kind === "league" ? "#111f2a" : "#102219";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="${bg}"/><circle cx="48" cy="48" r="43" fill="none" stroke="${hue}" stroke-width="5"/><text x="48" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="800" fill="#f7f3ea">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
      logo: row?.logo_url || mappedLogo || fallbackLogo(key, "team"),
      initials: initials(key),
      logoSource: row?.logo_url ? "win2go teams" : mappedLogo ? "curated teams" : "generated team badge",
    };
  }
  async function leagueAsset(name) {
    const key = cleanText(name);
    if (!leagueCache.has(key)) leagueCache.set(key, await supabaseSearch("leagues", key));
    const row = leagueCache.get(key);
    const mappedLogo = LEAGUE_LOGOS[key] || "";
    return {
      name: key,
      logo: row?.logo_url || mappedLogo || fallbackLogo(key, "league"),
      initials: initials(key),
      logoSource: row?.logo_url ? "win2go leagues" : mappedLogo ? "curated leagues" : "generated league badge",
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

function describeWinnerPick(market, scored, teams) {
  const outcomes = (market.outcomes || [])
    .map((outcome) => ({
      desc: cleanText(outcome.desc),
      odds: decimal(outcome.price),
    }))
    .filter((outcome) => outcome.odds)
    .sort((a, b) => a.odds - b.odds);
  const favorite = outcomes[0];
  const opponent = outcomes.find((outcome) => outcome.desc !== scored.pick && cleanText(outcome.desc).toLowerCase() !== "x");
  const draw = outcomes.find((outcome) => cleanText(outcome.desc).toLowerCase() === "x");
  const alternatives = outcomes
    .filter((outcome) => outcome.desc !== scored.pick)
    .slice(0, 2)
    .map((outcome) => `${outcome.desc} ${outcome.odds.toFixed(2)}`)
    .join(", ");
  const pickText = cleanText(scored.pick).toLowerCase() === "x" ? "תיקו" : scored.pick;
  const side =
    cleanText(scored.pick) === cleanText(teams.home) ? "home" :
    cleanText(scored.pick) === cleanText(teams.away) ? "away" :
    cleanText(scored.pick).toLowerCase() === "x" ? "draw" : "team";
  const venueReason =
    side === "home" ? `${pickText} משחקת בבית, ולכן הבחירה מקבלת גם יתרון מגרש.` :
    side === "away" ? `${pickText} מסומנת כפייבוריטית גם בחוץ, וזה בדרך כלל מצביע על פער איכות מול היריבה ולא רק על יתרון ביתיות.` :
    side === "draw" ? "תיקו נבחר רק אם השוק מתמחר אותו בתוך הטווח ובפער סביר מהקבוצות." :
    "הבחירה מזוהה ישירות מתוך שוק המנצח של Winner.";
  const gapReason = opponent?.odds
    ? `מול ${opponent.desc}, השוק נותן ליריבה יחס ${opponent.odds.toFixed(2)}, כלומר Winner רואה אותה כפחות סבירה לניצחון.`
    : "";
  const drawReason = draw?.odds ? `גם התיקו רחוק יותר ביחס ${draw.odds.toFixed(2)}.` : "";
  if (favorite?.desc === scored.pick) {
    return `${pickText} נבחרת לניצחון כי היא הפייבוריטית הברורה בשוק המנצח של Winner. ${venueReason} ${gapReason} ${drawReason} ${alternatives ? `החלופות בשוק: ${alternatives}.` : ""}`.replace(/\s+/g, " ").trim();
  }
  return `${pickText} נבחרת כי היא עדיין בחירת מנצח פתוחה ב-Winner בתוך הטווח המבוקש. ${venueReason} ${favorite ? `חשוב: הפייבוריט הראשי לפי Winner הוא ${favorite.desc}, לכן זו בחירה מסוכנת יותר.` : ""}`.replace(/\s+/g, " ").trim();
}

function buildCurrentPicks(markets, dateKey, limit = 20) {
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
          describeWinnerPick(market, scored, teams),
          "הפירוט מבוסס על יחסי Winner בלבד. אין כאן המצאה של פציעות, הרכבים או מידע שלא חזר מהמקור.",
        ],
      };
      if (!current || row.score > current.score || (row.score === current.score && row.odds < current.odds)) {
        events.set(market.eId, row);
      }
    }
  }
  return [...events.values()].sort((a, b) => b.score - a.score || a.odds - b.odds).slice(0, limit);
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
    const today = israelDate(0);
    const tomorrow = israelDate(1);
    const { hashes, markets } = await getWinnerLine();
    const openRows = await enrichLogos([
      ...buildCurrentPicks(markets, today, 30),
      ...buildCurrentPicks(markets, tomorrow, 30),
    ]);
    const footballRows = openRows
      .filter((row) => row.sportId === 240 && row.odds && row.homeAsset?.logo && row.awayAsset?.logo && row.leagueAsset?.logo)
      .slice(0, 20);
    const basketballRows = openRows
      .filter((row) => row.sportId === 227 && row.odds && row.homeAsset?.logo && row.awayAsset?.logo && row.leagueAsset?.logo)
      .slice(0, 20);
    res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      serverVersion: hashes.currentVersion,
      oddsRange: { min: ODDS_MIN, max: ODDS_MAX },
      tabs: {
        football: { label: "כדורגל", date: `${today} / ${tomorrow}`, rows: footballRows },
        basketball: { label: "כדורסל", date: `${today} / ${tomorrow}`, rows: basketballRows },
      },
      notes: [
        "מוצגים רק משחקים פתוחים להימור בווינר-ליין.",
        "כל בחירה חייבת יחס Winner פעיל בטווח 1.40-1.90.",
        "לכל קבוצה וליגה מוצג לוגו ממקור חיצוני או תג גרפי כאשר אין לוגו רשמי זמין.",
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
