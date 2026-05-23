const crypto = require("crypto");
const SNAPSHOT = require("./winner-snapshot.json");

const ODDS_MIN = 1.4;
const ODDS_MAX = 1.9;
/** Open Winner picks shown per sport on today / tomorrow (verified line + odds in range). */
const TARGET_PICKS_PER_SPORT = 20;
const SUPABASE_URL = "https://jgcmtrlviuivbtimtqjq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnY210cmx2aXVpdmJ0aW10cWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTc5NzYsImV4cCI6MjA5MTY5Mzk3Nn0.LxaX1xDcvLFPtF4Q5QnUlV4zeHQBeDwlcJq3nao3mqk";
const SPORTS = {
  240: "כדורגל",
  227: "כדורסל",
};
const WINNER_FOOTBALL_ID = 240;
const WINNER_BASKETBALL_ID = 227;
const SCORES365_BASKETBALL_ID = 2;
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

function scoreText(a, b, fallback = "") {
  const left = cleanText(a);
  const right = cleanText(b);
  if (left !== "" && right !== "") return `${left}:${right}`;
  return cleanText(fallback);
}

function parseSpread(value) {
  const match = cleanText(value).match(/\(([+-]?\d+(?:\.\d+)?)\)/);
  return match ? Number(match[1]) : null;
}

function outcomeTeam(value) {
  return cleanText(value).replace(/\s*\([+-]?\d+(?:\.\d+)?\)\s*$/, "").trim();
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

function normalizeMatchName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(fc|bc|bk|basket|basketball|club|women|w)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultKeyFor(row) {
  const home = normalizeMatchName(row?.home || row?.teamA);
  const away = normalizeMatchName(row?.away || row?.teamB);
  const day = cleanText(row?.day || row?.date);
  const sportId = Number(row?.sportId || row?.sportid || 0);
  if (!day || !sportId || !home || !away) return "";
  return `${sportId}:${day}:${home}:${away}`;
}

function resultKeyVariants(row) {
  const key = resultKeyFor(row);
  if (!key) return [];
  const parts = key.split(":");
  return [
    key,
    `${parts[0]}:${parts[1]}:${parts[3]}:${parts[2]}`,
  ];
}

function scores365Date(dateKey) {
  const [year, month, day] = String(dateKey || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
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

async function sportsDbSearch(kind, term) {
  const value = cleanText(term);
  if (!value || value.length < 3) return null;
  const endpoint = kind === "league" ? "search_all_leagues.php" : "searchteams.php";
  const param = kind === "league" ? "l" : "t";
  const url = `https://www.thesportsdb.com/api/v1/json/3/${endpoint}?${param}=${encodeURIComponent(value)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  const data = await fetchJson(url, { signal: controller.signal }).catch(() => null);
  clearTimeout(timeout);
  const rows = kind === "league" ? (data?.countries || data?.leagues) : data?.teams;
  if (!Array.isArray(rows) || !rows.length) return null;
  const normalized = value.toLowerCase();
  const exact = rows.find((row) =>
    cleanText(row.strTeam || row.strLeague).toLowerCase() === normalized
  );
  const row = exact || rows[0];
  return {
    name: cleanText(row.strTeam || row.strLeague || value),
    logo_url: row.strBadge || row.strLogo || row.strFanart1 || "",
    source: "TheSportsDB",
  };
}

async function wikipediaLogoSearch(name, kind) {
  const value = cleanText(name);
  if (!value || value.length < 3) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(value)}`;
  const data = await fetchJson(url, {
    headers: { "User-Agent": "HapogeaLogoBot/1.0" },
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timeout);
  const logo = data?.thumbnail?.source || data?.originalimage?.source || "";
  if (!logo) return null;
  return {
    name: cleanText(data.title || value),
    logo_url: logo,
    source: `Wikipedia ${kind}`,
  };
}

async function enrichLogos(rows) {
  const teamCache = new Map();
  const leagueCache = new Map();
  async function teamAsset(name) {
    const key = cleanText(name);
    if (!teamCache.has(key)) {
      const mappedLogo = TEAM_LOGOS[key] || "";
      const row = mappedLogo
        ? { logo_url: mappedLogo, source: "curated teams" }
        : await supabaseSearch("teams", key) ||
          await sportsDbSearch("team", key) ||
          await wikipediaLogoSearch(key, "team");
      teamCache.set(key, row);
    }
    const row = teamCache.get(key);
    return {
      name: key,
      logo: row?.logo_url || fallbackLogo(key, "team"),
      initials: initials(key),
      logoSource: row?.source || (row?.logo_url ? "win2go teams" : "generated team badge"),
    };
  }
  async function leagueAsset(name) {
    const key = cleanText(name);
    if (!leagueCache.has(key)) {
      const mappedLogo = LEAGUE_LOGOS[key] || "";
      const row = mappedLogo
        ? { logo_url: mappedLogo, source: "curated leagues" }
        : await supabaseSearch("leagues", key) ||
          await sportsDbSearch("league", key) ||
          await wikipediaLogoSearch(key, "league");
      leagueCache.set(key, row);
    }
    const row = leagueCache.get(key);
    return {
      name: key,
      logo: row?.logo_url || fallbackLogo(key, "league"),
      initials: initials(key),
      logoSource: row?.source || (row?.logo_url ? "win2go leagues" : "generated league badge"),
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

function resultIndex(results) {
  const map = new Map();
  for (const event of results || []) {
    map.set(String(event.eventid), event);
    for (const key of resultKeyVariants({
      day: event.date,
      sportId: event.sportid,
      home: event.teamA,
      away: event.teamB,
    })) {
      map.set(key, event);
    }
  }
  return map;
}

function resultWinner(event) {
  const markets = event?.markets || [];
  const market = markets.find((m) => cleanText(m.title).includes("1X2")) ||
    markets.find((m) => cleanText(m.title).includes("׳”׳׳ ׳¦׳—"));
  const raw = cleanText((market?.marketResults || [])[0]);
  return raw.toLowerCase() === "x" ? "׳×׳™׳§׳•" : raw;
}

function scoreNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function spreadStatus(event, row) {
  const spread = Number(row?.spread);
  if (!Number.isFinite(spread)) return "";
  const homeScore = scoreNumber(event?.scoreA);
  const awayScore = scoreNumber(event?.scoreB);
  if (homeScore === null || awayScore === null) return "";
  const pick = cleanText(row.pickTeam || row.winnerPick || row.pick);
  const home = cleanText(row.home);
  const away = cleanText(row.away);
  const adjusted = pick === home
    ? homeScore + spread - awayScore
    : pick === away
      ? awayScore + spread - homeScore
      : null;
  if (adjusted === null) return "";
  if (adjusted > 0) return "תפס";
  if (adjusted < 0) return "נפל";
  return "החזר";
}

function resultPhase(event) {
  if (!event) return "scheduled";
  const status = cleanText(event.status || event.statusText || event.eventStatus || event.matchStatus || event.state);
  const hasScore = scoreText(event.scoreA, event.scoreB, event.noScoreLabel);
  if (/live|in.?play|playing|׳—׳™|משוחק/i.test(status)) return "live";
  if (resultWinner(event)) return "final";
  if (hasScore) return "live";
  return "scheduled";
}

function applyResult(row, event) {
  if (!event) return row;
  const actualWinner = resultWinner(event);
  const result = scoreText(event.scoreA, event.scoreB, event.noScoreLabel);
  const phase = resultPhase(event);
  const calculatedSpreadStatus = phase === "final" ? spreadStatus(event, row) : "";
  return {
    ...row,
    liveScore: result || row.liveScore || "",
    result: result || row.result || "",
    actualWinner: actualWinner || row.actualWinner || "",
    matchPhase: phase,
    status: phase === "final"
      ? calculatedSpreadStatus || resultStatus({ markets: event.markets || [] }, row.winnerPick || row.pick)
      : "׳׳׳×׳™׳",
  };
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
    team: outcomeTeam(outcome.desc),
    price: odds,
    spread: cleanText(outcome.spread) || parseSpread(outcome.desc),
    probability: hitProbability,
    score,
  };
}

function marketOddsBook(market) {
  const teams = splitTeams(market.desc);
  const rawOutcomes = (market.outcomes || [])
    .map((outcome) => ({
      desc: cleanText(outcome.desc),
      team: outcomeTeam(outcome.desc),
      spread: parseSpread(outcome.desc),
      odds: decimal(outcome.price),
    }))
    .filter((outcome) => outcome.desc && outcome.odds);
  const impliedTotal = rawOutcomes.reduce((total, outcome) => total + (1 / outcome.odds), 0);
  const withProbability = rawOutcomes.map((outcome) => ({
    ...outcome,
    implied: 1 / outcome.odds,
    noVigProbability: impliedTotal ? (1 / outcome.odds) / impliedTotal : null,
  }));
  const findBySide = (side) => {
    const raw = side === "home" ? teams.home : teams.away;
    const target = outcomeTeam(raw); // strip spread e.g. "(+6.5)" from desc-derived name
    return withProbability.find((outcome) => cleanText(outcome.team || outcome.desc) === cleanText(target));
  };
  const draw = withProbability.find((outcome) => cleanText(outcome.desc).toLowerCase() === "x");
  return {
    home: findBySide("home") || null,
    draw: draw || null,
    away: findBySide("away") || null,
    outcomes: withProbability,
    overround: Math.max(0, impliedTotal - 1),
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
    const isWinner = title.includes("המנצח");
    const isFullGameSpread =
      title.includes("הימור יתרון") &&
      (title.includes("כולל הארכות") || title.includes("ללא הארכות"));
    return isWinner || isFullGameSpread;
  }
  return false;
}

function scoreOutcome(market, outcome) {
  const odds = decimal(outcome.price);
  if (!odds || odds < ODDS_MIN || odds > ODDS_MAX) return null;
  const oddsBook = marketOddsBook(market);
  const reliability = marketReliability(market.mp, market.sId);
  const implied = 1 / odds;
  const pickTeam = outcomeTeam(outcome.desc);
  const spread = parseSpread(outcome.desc);
  const current = oddsBook.outcomes.find((item) => item.desc === cleanText(outcome.desc) && item.odds === odds);
  const normalizedProbability = current?.noVigProbability || implied;
  const competitors = oddsBook.outcomes
    .filter((item) => item.desc !== cleanText(outcome.desc))
    .map((item) => item.noVigProbability || item.implied)
    .sort((a, b) => b - a);
  const closestCompetitor = competitors[0] || 0;
  const marketGap = Math.max(0, normalizedProbability - closestCompetitor);
  const marginPenalty = Math.min(0.16, oddsBook.overround) * 100;
  const sourceDepth = Math.min(1, Number(market.count || market.outcomes?.length || 1) / 8);
  const hitProbability = Math.max(0.34, Math.min(0.82, normalizedProbability * reliability));
  const score = Math.round(
    normalizedProbability * 70 +
      marketGap * 34 +
      reliability * 12 +
      sourceDepth * 6 -
      marginPenalty
  );
  return {
    outcomeId: outcome.outcomeId,
    pick: cleanText(outcome.desc),
    pickTeam,
    spread,
    odds,
    implied,
    normalizedProbability,
    marketGap,
    overround: oddsBook.overround,
    hitProbability,
    reliability,
    score: Math.max(1, Math.min(100, score)),
    oddsBook,
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
  const pickedTeam = cleanText(scored.pickTeam || scored.pick);
  const side =
    pickedTeam === cleanText(teams.home) ? "home" :
    pickedTeam === cleanText(teams.away) ? "away" :
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

const BOARD_PICK_LIMIT = TARGET_PICKS_PER_SPORT;

function countRecommendedPicks(rows) {
  return (rows || []).filter((row) => row.recommended && row.odds && row.status === "ממתין").length;
}

function recommendationRank(row) {
  const odds = Number(row.odds || row.oddsRaw || 0);
  const oddsQuality = odds
    ? Math.max(0, Math.min(1, (odds - ODDS_MIN) / (ODDS_MAX - ODDS_MIN)))
    : 0;
  const hit = Number(row.probability || row.normalizedProbability || 0);
  const marketGap = Number(row.marketGap || 0);
  const reliability = Number(row.reliability || 0);
  const overroundPenalty = Math.min(0.16, Number(row.overround || 0)) * 30;
  return Math.round(
    hit * 72 +
      marketGap * 34 +
      oddsQuality * 18 +
      reliability * 10 -
      overroundPenalty
  );
}

function buildCurrentPicks(markets, dateKey, limit = TARGET_PICKS_PER_SPORT, resultsByEvent = new Map(), sportIdFilter = null) {
  const events = new Map();

  // First pass: collect all events that have an allowed market on this date
  // regardless of odds range — so every Winner game is represented
  for (const market of markets) {
    const date = winnerDateToIso(market.e_date);
    if (sportIdFilter && Number(market.sId) !== Number(sportIdFilter)) continue;
    if (date !== dateKey || !allowedMarket(market)) continue;

    const teams = splitTeams(market.desc);
    const oddsBook = marketOddsBook(market);
    const eventMarkets = buildEventMarkets(markets.filter((candidate) => candidate.eId === market.eId));

    // Try to find an in-range scored outcome first
    let bestScored = null;
    for (const outcome of market.outcomes || []) {
      const scored = scoreOutcome(market, outcome);
      if (!scored) continue;
      if (!bestScored || scored.score > bestScored.score || (scored.score === bestScored.score && scored.odds < bestScored.odds)) {
        bestScored = scored;
      }
    }

    // If no in-range outcome, pick the best (lowest odds = favourite) outcome
    // and mark it as outside-range so the UI can show it without a recommendation
    let outsideRange = false;
    if (!bestScored) {
      const allOutcomes = (market.outcomes || [])
        .map((outcome) => ({ outcome, odds: decimal(outcome.price) }))
        .filter((item) => item.odds)
        .sort((a, b) => a.odds - b.odds); // ascending = favourite first
      if (allOutcomes.length) {
        const best = allOutcomes[0];
        const odds = best.odds;
        const pickTeam = outcomeTeam(best.outcome.desc);
        const spread = parseSpread(best.outcome.desc);
        const normalizedProbability = oddsBook.outcomes.find(
          (item) => item.desc === cleanText(best.outcome.desc)
        )?.noVigProbability || (1 / odds);
        bestScored = {
          outcomeId: best.outcome.outcomeId,
          pick: cleanText(best.outcome.desc),
          pickTeam,
          spread,
          odds,
          implied: 1 / odds,
          normalizedProbability,
          marketGap: 0,
          overround: oddsBook.overround,
          hitProbability: normalizedProbability,
          reliability: marketReliability(market.mp, market.sId),
          score: 0,
          oddsBook,
        };
        outsideRange = true;
      }
    }

    if (!bestScored) continue; // market has no outcomes at all — skip

    const scored = bestScored;
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
      resultKey: resultKeyFor({ day: dateKey, sportId: market.sId, home: teams.home, away: teams.away }),
      market: cleanText(market.mp),
      marketId: market.mId,
      outcomeId: scored.outcomeId,
      pick: scored.pick,
      pickTeam: scored.pickTeam,
      spread: scored.spread,
      winnerPick: cleanText(scored.pick).toLowerCase() === "x" ? "תיקו" : scored.pick,
      odds: outsideRange ? null : scored.odds,           // null = no recommendation
      oddsRaw: scored.odds,                               // always the actual odds
      outsideRange,
      oddsBook: scored.oddsBook,
      probability: outsideRange ? null : scored.hitProbability,
      normalizedProbability: scored.normalizedProbability,
      marketGap: scored.marketGap,
      overround: scored.overround,
      score: outsideRange ? 0 : scored.score,
      status: "ממתין",
      result: "",
      signals: outsideRange
        ? [
            `יחס Winner ${scored.odds.toFixed(2)} — מחוץ לטווח ההמלצה (1.40–1.90)`,
            `הסתברות שוק ${Math.round(scored.normalizedProbability * 100)} אחוז`,
            "המשחק מוצג ללא בחירה",
          ]
        : [
            `הסתברות Winner מנוכת מרווח ${Math.round(scored.normalizedProbability * 100)} אחוז`,
            `אמינות שוק ${Math.round(scored.reliability * 100)} אחוז`,
            `יחס Winner ${scored.odds.toFixed(2)}`,
            `פער מול היריבה הקרובה ${Math.round(scored.marketGap * 100)} אחוז`,
          ],
      allMarkets: eventMarkets,
      explanation: outsideRange
        ? [
            "המשחק מופיע בווינר-ליין אך הפייבוריט מחוץ לטווח ההמלצה.",
            `יחס הפייבוריט הוא ${scored.odds.toFixed(2)} — ${scored.odds < 1.4 ? "נמוך מדי (פערים ברורים מדי, סיכון גבוה להפתעה)" : "גבוה מדי (שוק פתוח מדי, אין יתרון ברור)"}. אין כאן המלצה.`,
            "האלגוריתם מציג את המשחק כדי שתוכל לראות את כל הלוח — אך לא ממליץ על הימור.",
          ]
        : [
            "המשחק מופיע בווינר-ליין ולכן ניתן להמר עליו בזמן משיכת הנתונים.",
            describeWinnerPick(market, scored, teams),
            "האלגוריתם משתמש ביחסי Winner לפני המשחק, ממיר אותם להסתברויות, מנכה את מרווח הבית, ואז מדרג לפי הסתברות מנורמלת ופער מול היריבה הקרובה. אין כאן המצאה של פציעות, הרכבים או מידע שלא חזר מהמקור.",
          ],
    };

    const matchedResult = resultsByEvent.get(String(market.eId)) || resultsByEvent.get(row.resultKey);
    const enrichedRow = applyResult(row, matchedResult);

    const current = events.get(market.eId);
    // Prefer: in-range pick > outside-range; within same category prefer higher score
    const currentOutside = current?.outsideRange ?? true;
    const newOutside = enrichedRow.outsideRange;
    const shouldReplace = !current
      || (currentOutside && !newOutside)
      || (!currentOutside && !newOutside && (enrichedRow.score > current.score || (enrichedRow.score === current.score && (enrichedRow.oddsRaw || 0) < (current.oddsRaw || 0))));
    if (shouldReplace) {
      events.set(market.eId, enrichedRow);
    }
  }

  return [...events.values()]
    .filter((row) => row.status === "ממתין")
    .filter((row) => !row.outsideRange && row.odds)
    .map((row) => ({
      ...row,
      recommendationScore: recommendationRank(row),
    }))
    .sort((a, b) => {
      return (b.recommendationScore || 0) - (a.recommendationScore || 0)
        || (b.probability || 0) - (a.probability || 0)
        || (b.odds || 0) - (a.odds || 0)
        || String(a.time).localeCompare(String(b.time));
    })
    .slice(0, limit)
    .map((row) => {
      return {
        ...row,
        recommended: true,
        recommendationReason: "top-20",
        signals: [
          `סבירות פגיעה ${Math.round((row.probability || 0) * 100)} אחוז`,
          `יחס Winner ${Number(row.odds).toFixed(2)}`,
          `ציון משולב ${row.recommendationScore || row.score || 0}`,
        ],
      };
    });
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
      const actualWinnerRaw = cleanText((market.marketResults || [])[0]);
      const actualWinner = actualWinnerRaw.toLowerCase() === "x" ? "תיקו" : actualWinnerRaw;
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
        resultKey: resultKeyFor({ day: dateKey, sportId: event.sportid, home: teams.home, away: teams.away }),
        market: cleanText(market?.title || "תוצאת משחק"),
        pick: actualWinner,
        winnerPick: actualWinner,
        actualWinner,
        odds: null,
        probability: null,
        score: 0,
        status: "נסגר",
        liveScore: scoreText(event.scoreA, event.scoreB, event.noScoreLabel),
        matchPhase: resultPhase(event),
        result: scoreText(event.scoreA, event.scoreB, event.noScoreLabel),
        signals: ["תוצאה רשמית מווינר", "ארכיון לבדיקת פגיעה", "אין יחס עבר בממשק הציבורי"],
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
          "זהו משחק סגור מארכיון התוצאות של Winner.",
          `התוצאה הרשמית בשוק המנצח היא ${actualWinner || "לא זמינה"}. היא משמשת רק לסגירת תחזיות שנשמרו קודם לכן.`,
          "ממשק התוצאות הציבורי לא מחזיר יחס סגירה, ולכן יחס עבר לא מוצג ולא מומצא.",
        ],
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

async function get365BasketballResults(startDate, endDate) {
  const dates = [startDate];
  if (endDate && endDate !== startDate) dates.push(endDate);
  const rows = [];
  for (const dateKey of dates) {
    const day = scores365Date(dateKey);
    if (!day) continue;
    const params = new URLSearchParams({
      langId: "2",
      timezoneName: "Asia/Jerusalem",
      userCountryId: "6",
      appTypeId: "5",
      sports: String(SCORES365_BASKETBALL_ID),
      startDate: day,
      endDate: day,
    });
    const data = await fetchJson(`https://webws.365scores.com/web/games/?${params}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Origin: "https://www.365scores.com",
        Referer: "https://www.365scores.com/he/basketball/match-results",
        Accept: "application/json",
      },
    }).catch(() => null);
    for (const game of data?.games || []) {
      const home = cleanText(game.homeCompetitor?.name);
      const away = cleanText(game.awayCompetitor?.name);
      if (!home || !away) continue;
      const homeScore = Number(game.homeCompetitor?.score);
      const awayScore = Number(game.awayCompetitor?.score);
      const hasScore = Number.isFinite(homeScore) && Number.isFinite(awayScore) && homeScore >= 0 && awayScore >= 0;
      const isFinal = Number(game.statusGroup) === 4 || /final|ended|הסתיים/i.test(cleanText(game.statusText));
      const actualWinner = hasScore && isFinal
        ? homeScore === awayScore
          ? "תיקו"
          : homeScore > awayScore ? home : away
        : "";
      const start = game.startTime ? new Date(game.startTime) : null;
      rows.push({
        eventid: `365-${game.id}`,
        eventid365: String(game.id),
        date: dateKey,
        time: start && !Number.isNaN(start.getTime())
          ? new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hour12: false }).format(start)
          : "",
        sportid: WINNER_BASKETBALL_ID,
        league: cleanText(game.competitionDisplayName),
        teamA: home,
        teamB: away,
        scoreA: hasScore ? String(homeScore) : "",
        scoreB: hasScore ? String(awayScore) : "",
        statusText: cleanText(game.statusText),
        markets: actualWinner ? [{ title: "המנצח", marketResults: [actualWinner] }] : [],
        source: "365Scores",
      });
    }
  }
  return rows;
}

function build365BasketballRows(results, dateKey) {
  return (results || [])
    .filter((event) => String(event.sportid) === String(WINNER_BASKETBALL_ID) && event.date === dateKey)
    .map((event) => {
      const actualWinner = resultWinner(event);
      const teams = { home: cleanText(event.teamA), away: cleanText(event.teamB) };
      return {
        id: `result-${event.eventid}`,
        eventId: String(event.eventid),
        eventId365: event.eventid365 || String(event.eventid).replace(/^365-/, ""),
        source: "365Scores Results",
        day: dateKey,
        time: String(event.time || "").slice(0, 5),
        sport: SPORTS[WINNER_BASKETBALL_ID],
        sportId: WINNER_BASKETBALL_ID,
        league: cleanText(event.league),
        country: "",
        match: `${teams.home} - ${teams.away}`,
        home: teams.home,
        away: teams.away,
        resultKey: resultKeyFor({ day: dateKey, sportId: WINNER_BASKETBALL_ID, home: teams.home, away: teams.away }),
        market: "המנצח",
        pick: actualWinner,
        winnerPick: actualWinner,
        actualWinner,
        odds: null,
        probability: null,
        score: 0,
        status: "נסגר",
        liveScore: scoreText(event.scoreA, event.scoreB, event.noScoreLabel),
        matchPhase: resultPhase(event),
        result: scoreText(event.scoreA, event.scoreB, event.noScoreLabel),
        signals: ["תוצאה מ-365Scores", "כיסוי כדורסל לכל הליגות", "משמש לסגירת תחזיות Winner"],
        allMarkets: [{
          marketId: null,
          title: "המנצח",
          category: marketCategory("המנצח"),
          bettable: false,
          best: null,
          outcomes: actualWinner ? [{ outcomeId: null, desc: actualWinner, price: null, spread: "", probability: null, score: null }] : [],
        }],
        explanation: [
          "זהו משחק כדורסל מארכיון התוצאות של 365Scores.",
          `התוצאה הרשמית לפי 365Scores היא ${actualWinner || "לא זמינה"}.`,
          "היחסים והבחירה עדיין מגיעים מ-Winner; 365Scores משמש רק לסגירת התוצאה.",
        ],
      };
    })
    .slice(0, 60);
}

function splitBySport(rows) {
  return {
    football: rows.filter((row) => row.sportId === 240),
    basketball: rows.filter((row) => row.sportId === 227),
  };
}

function mergeRows(primary, secondary) {
  const byEvent = new Map();
  for (const row of [...primary, ...secondary]) {
    const key = String(row.resultKey || row.eventId || row.id);
    const current = byEvent.get(key);
    if (!current) {
      byEvent.set(key, row);
      continue;
    }
    byEvent.set(key, {
      ...row,
      ...current,
      liveScore: current.liveScore || row.liveScore || "",
      result: current.result || row.result || "",
      actualWinner: current.actualWinner || row.actualWinner || "",
      matchPhase: current.matchPhase || row.matchPhase || "",
    });
  }
  return [...byEvent.values()];
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

async function buildWinnerFeedPayload({ withLogos = true } = {}) {
  const yesterday = israelDate(-1);
  const today = israelDate(0);
  const tomorrow = israelDate(1);
  const [{ hashes, markets }, winnerResultEvents, scores365BasketballEvents] = await Promise.all([
    getWinnerLine(),
    getResults(yesterday, tomorrow),
    Promise.all([
      get365BasketballResults(yesterday, yesterday),
      get365BasketballResults(today, today),
      get365BasketballResults(tomorrow, tomorrow),
    ]).then((items) => items.flat()),
  ]);
  const resultEvents = [...winnerResultEvents, ...scores365BasketballEvents];
  const resultsByEvent = resultIndex(resultEvents);
  const yesterdayMerged = mergeRows(
    buildResultRows(winnerResultEvents, yesterday),
    build365BasketballRows(scores365BasketballEvents, yesterday)
  );
  const yesterdayRows = splitBySport(
    withLogos ? await enrichLogos(yesterdayMerged) : yesterdayMerged
  );
  const todayCurrentRows = [
    ...buildCurrentPicks(markets, today, BOARD_PICK_LIMIT, resultsByEvent, WINNER_FOOTBALL_ID),
    ...buildCurrentPicks(markets, today, BOARD_PICK_LIMIT, resultsByEvent, WINNER_BASKETBALL_ID),
  ];
  const todayRows = splitBySport(withLogos ? await enrichLogos(todayCurrentRows) : todayCurrentRows);
  const tomorrowCurrentRows = [
    ...buildCurrentPicks(markets, tomorrow, BOARD_PICK_LIMIT, resultsByEvent, WINNER_FOOTBALL_ID),
    ...buildCurrentPicks(markets, tomorrow, BOARD_PICK_LIMIT, resultsByEvent, WINNER_BASKETBALL_ID),
  ];
  const tomorrowRows = splitBySport(
    withLogos ? await enrichLogos(tomorrowCurrentRows) : tomorrowCurrentRows
  );
  const lineStats = {
    football: {
      today: countRecommendedPicks(todayRows.football),
      tomorrow: countRecommendedPicks(tomorrowRows.football),
    },
    basketball: {
      today: countRecommendedPicks(todayRows.basketball),
      tomorrow: countRecommendedPicks(tomorrowRows.basketball),
    },
  };
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    serverVersion: hashes.currentVersion,
    oddsRange: { min: ODDS_MIN, max: ODDS_MAX },
    targetPicksPerSport: TARGET_PICKS_PER_SPORT,
    lineStats,
    tabs: {
      yesterday: { label: "אתמול", date: yesterday, sports: yesterdayRows },
      today: { label: "היום", date: today, sports: todayRows },
      tomorrow: { label: "מחר", date: tomorrow, sports: tomorrowRows },
    },
    modelStats: {
      title: "מה עומד מאחורי הניחושים",
      factors: [
        "שוק מנצח בלבד: 1X2 בכדורגל והמנצח/ת בכדורסל מכל הליגות שמופיעות ב-Winner.",
        `${TARGET_PICKS_PER_SPORT} המלצות ביום לכל ספורט — יחס Winner אמיתי בטווח 1.40-1.90; שאר משחקי הלוח מוצגים בלי המלצה.`,
        "היחסים מומרים להסתברות, עוברים ניכוי מרווח בית, ואז מדורגים לפי הסתברות מנורמלת ופער מול היריבה הקרובה.",
        "בית/חוץ: פייבוריט בחוץ מקבל הסבר של פער איכות; פייבוריט בבית מקבל יתרון מגרש.",
        "לא מוצגים פציעות, הרכבים או חדשות אם הם לא חזרו ממקור מאומת.",
      ],
    },
    win2goFeatures: [
      "טאבים אתמול/היום/מחר",
      "קטגוריות כדורגל וכדורסל",
      "יחסי Winner בזמן אמת או snapshot מאומת",
      "לוגואים לקבוצות ולליגות",
      "אחוז פגיעה חודשי לפי תחזיות שנשמרו",
      "ציון ביטחון והסתברות שוק",
      "הסבר למה הבחירה צפויה לנצח",
      "חיפוש ומיון",
      "פירוט משחק",
    ],
    notes: [
      `היום ומחר: עד ${TARGET_PICKS_PER_SPORT} המלצות לכל ספורט עם יחס Winner בטווח 1.40-1.90; כל שאר משחקי הלוח נשארים גלויים.`,
      "אם בווינר יש פחות מ-20 משחקים בטווח, יוצג המספר האמיתי בלי להמציא נתונים.",
      "אתמול הוא מסך סגירה ובדיקת פגיעה מול תוצאה רשמית, לא מסך הימור פתוח.",
      "לכל קבוצה וליגה מוצג לוגו ממקור חיצוני או תג גרפי כאשר אין לוגו רשמי זמין.",
    ],
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  try {
    const payload = await buildWinnerFeedPayload({ withLogos: true });
    res.status(200).json(payload);
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

module.exports.buildWinnerFeedPayload = buildWinnerFeedPayload;
module.exports.TARGET_PICKS_PER_SPORT = TARGET_PICKS_PER_SPORT;
