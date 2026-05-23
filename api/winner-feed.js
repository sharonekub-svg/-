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
const SCORES365_FOOTBALL_ID = 1;
const SCORES365_BASKETBALL_ID = 2;
// No hardcoded logo lists — logos are resolved dynamically via API search only.

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
  for (const lang of ["he", "en"]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(value)}`;
    const data = await fetchJson(url, {
      headers: { "User-Agent": "HapogeaLogoBot/1.0" },
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    const logo = data?.thumbnail?.source || data?.originalimage?.source || "";
    if (logo) {
      return {
        name: cleanText(data.title || value),
        logo_url: logo,
        source: `Wikipedia ${lang} ${kind}`,
      };
    }
  }
  return null;
}

async function wikipediaSearchLogo(name, kind) {
  const value = cleanText(name);
  if (!value || value.length < 3) return null;
  for (const lang of ["he", "en"]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2200);
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: value,
      gsrlimit: "1",
      prop: "pageimages",
      pithumbsize: "160",
      format: "json",
      origin: "*",
    });
    const data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "HapogeaLogoBot/1.0" },
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    const page = Object.values(data?.query?.pages || {})[0];
    const logo = page?.thumbnail?.source || page?.original?.source || "";
    if (logo) {
      return {
        name: cleanText(page.title || value),
        logo_url: logo,
        source: `Wikipedia search ${lang} ${kind}`,
      };
    }
  }
  return null;
}

async function wikidataLogoSearch(name, kind) {
  const value = cleanText(name);
  if (!value || value.length < 3) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=he&format=json&limit=1&search=${encodeURIComponent(value)}`;
  const search = await fetchJson(searchUrl, {
    headers: { "User-Agent": "HapogeaLogoBot/1.0" },
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timeout);
  const id = search?.search?.[0]?.id;
  if (!id) return null;

  const entityController = new AbortController();
  const entityTimeout = setTimeout(() => entityController.abort(), 2200);
  const entity = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, {
    headers: { "User-Agent": "HapogeaLogoBot/1.0" },
    signal: entityController.signal,
  }).catch(() => null);
  clearTimeout(entityTimeout);
  const claims = entity?.entities?.[id]?.claims || {};
  const image = claims.P154?.[0]?.mainsnak?.datavalue?.value ||
    claims.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!image) return null;
  return {
    name: value,
    logo_url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=160`,
    source: `Wikidata ${kind}`,
  };
}

async function enrichLogos(rows) {
  const teamCache = new Map();
  const leagueCache = new Map();
  async function teamAsset(name) {
    const key = cleanText(name);
    if (!teamCache.has(key)) {
      // Dynamic search only — no hardcoded list
      const row = await supabaseSearch("teams", key) ||
          await sportsDbSearch("team", key) ||
          await wikipediaLogoSearch(key, "team") ||
          await wikipediaSearchLogo(key, "team") ||
          await wikidataLogoSearch(key, "team");
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
      // Dynamic search only — no hardcoded list
      const row = await supabaseSearch("leagues", key) ||
          await sportsDbSearch("league", key) ||
          await wikipediaLogoSearch(key, "league") ||
          await wikipediaSearchLogo(key, "league") ||
          await wikidataLogoSearch(key, "league");
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
  return "לא אומת";
}

function resultPhase(event) {
  if (!event) return "scheduled";
  const status = cleanText(event.status || event.statusText || event.eventStatus || event.matchStatus || event.state);
  const hasScore = scoreText(event.scoreA, event.scoreB, event.noScoreLabel);
  if (/cancel|cancelled|canceled|abandon|void|בוטל|מבוטל/i.test(status)) return "cancelled";
  if (/postpone|postponed|delayed|נדחה|דחוי/i.test(status)) return "postponed";
  if (/halftime|half.?time|half_time|הפסקה|מחצית/i.test(status)) return "ht";
  if (/live|in.?play|playing|חי|משוחק/i.test(status)) return "live";
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
  const finalStatus = phase === "cancelled"
    ? "בוטל"
    : phase === "postponed"
      ? "לא אומת"
      : phase === "final"
        ? calculatedSpreadStatus || resultStatus({ markets: event.markets || [] }, row.winnerPick || row.pick)
        : "ממתין";
  return {
    ...row,
    liveScore: result || row.liveScore || "",
    result: result || row.result || "",
    actualWinner: actualWinner || row.actualWinner || "",
    matchPhase: phase,
    bettingStatus: phase === "cancelled" ? "cancelled" : phase === "postponed" ? "postponed" : row.bettingStatus,
    resultVerifiedAt: phase === "final" || phase === "cancelled" || phase === "postponed" ? new Date().toISOString() : row.resultVerifiedAt,
    status: finalStatus,
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

const BOARD_PICK_LIMIT = 200;
const CENTRAL_LEAGUE_PATTERNS = [
  "ליגת Winner",
  "פרמייר ליג",
  "אנגלית ראשונה",
  "ספרדית ראשונה",
  "איטלקית ראשונה",
  "גרמנית ראשונה",
  "NBA",
  "יורוליג",
];
const HIGH_PROFILE_TEAM_PATTERNS = [
  "בית\"ר ירושלים",
  "הפועל תל אביב",
  "מכבי תל אביב",
  "מכבי חיפה",
  "הפועל באר שבע",
  "ריאל מדריד",
  "ברצלונה",
  "ליברפול",
  "מנצ'סטר",
  "ארסנל",
  "צ'לסי",
  "טוטנהאם",
  "יובנטוס",
  "מילאן",
  "אינטר",
  "נאפולי",
  "באיירן",
  "דורטמונד",
  "קליבלנד",
  "ניו יורק ניקס",
];

function countRecommendedPicks(rows) {
  return (rows || []).filter((row) => row.recommended && row.odds && row.status === "ממתין").length;
}

function includesPattern(value, patterns) {
  const text = cleanText(value);
  return patterns.some((pattern) => text.includes(cleanText(pattern)));
}

function isCentralEvent(row) {
  return includesPattern(row.league, CENTRAL_LEAGUE_PATTERNS) ||
    includesPattern(`${row.home} ${row.away}`, HIGH_PROFILE_TEAM_PATTERNS);
}

function hasVerifiedLogo(asset) {
  const source = String(asset?.logoSource || "");
  const logo = String(asset?.logo || "");
  return Boolean(asset?.logo) && !source.includes("generated") && !logo.startsWith("data:image/svg");
}

function hasVerifiedTeamLogos(row) {
  return hasVerifiedLogo(row.homeAsset) &&
    hasVerifiedLogo(row.awayAsset) &&
    row.homeAsset.logo !== row.awayAsset.logo;
}

function favoriteInfo(row) {
  const outcomes = (row.oddsBook?.outcomes || [])
    .filter((item) => Number(item.odds))
    .sort((a, b) => a.odds - b.odds);
  const favorite = outcomes[0] || null;
  const second = outcomes[1] || null;
  const pick = cleanText(row.pickTeam || row.winnerPick || row.pick);
  const favoriteTeam = cleanText(favorite?.team || favorite?.desc);
  return {
    favorite,
    second,
    isFavorite: Boolean(favorite && pick && (pick === favoriteTeam || favoriteTeam.includes(pick) || pick.includes(favoriteTeam))),
    oddsGap: favorite && second ? second.odds - favorite.odds : 0,
  };
}

function hasSingleClearFavorite(row) {
  const info = favoriteInfo(row);
  return info.isFavorite && (
    Number(row.marketGap || 0) >= 0.025 ||
    Number(info.oddsGap || 0) >= 0.15 ||
    Number(row.normalizedProbability || 0) >= 0.5
  );
}

function scoreBreakdown(row) {
  const odds = Number(row.odds || row.oddsRaw || 0);
  const oddsQuality = odds
    ? Math.max(0, Math.min(1, (odds - ODDS_MIN) / (ODDS_MAX - ODDS_MIN)))
    : 0;
  const hit = Number(row.probability || row.normalizedProbability || 0);
  const marketGap = Number(row.marketGap || 0);
  const reliability = Number(row.reliability || 0);
  const overroundPenalty = Math.min(0.16, Number(row.overround || 0)) * 30;
  const clearFavorite = hasSingleClearFavorite(row);
  const central = isCentralEvent(row);
  const spread = Number(row.spread);
  const extremeSpreadPenalty = row.sportId === WINNER_BASKETBALL_ID && Number.isFinite(spread) && Math.abs(spread) > 12
    ? 18
    : 0;
  const tooLowOddsPenalty = odds <= 1.42 && marketGap < 0.08 ? 10 : 0;
  const components = {
    hitProbability: Math.round(hit * 72),
    oddsValue: Math.round(oddsQuality * 18),
    marketGap: Math.round(marketGap * 34),
    reliability: Math.round(reliability * 10),
    niche: central ? -22 : 16,
    clearFavorite: clearFavorite ? 18 : -30,
    overroundPenalty: -Math.round(overroundPenalty),
    lowOddsPenalty: -tooLowOddsPenalty,
    extremeSpreadPenalty: -extremeSpreadPenalty,
  };
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  return {
    ...components,
    total,
    labels: {
      hitProbability: "סבירות פגיעה",
      oddsValue: "ערך יחס",
      marketGap: "פער שוק",
      reliability: "אמינות שוק",
      niche: "נישה",
      clearFavorite: "פייבוריטית ברורה",
      overroundPenalty: "מרווח בית",
      lowOddsPenalty: "יחס נמוך מדי",
      extremeSpreadPenalty: "ליין קיצוני",
    },
  };
}

function recommendationRank(row) {
  return scoreBreakdown(row).total;
}

function rejectionReasons(row) {
  const reasons = [];
  if (!row.recommended || !row.odds) reasons.push("לא המלצה פעילה");
  if (!hasVerifiedLogo(row.homeAsset)) reasons.push("אין לוגו אמיתי לקבוצת הבית");
  if (!hasVerifiedLogo(row.awayAsset)) reasons.push("אין לוגו אמיתי לקבוצת החוץ");
  if (row.homeAsset?.logo && row.homeAsset.logo === row.awayAsset?.logo) reasons.push("לוגו זהה לשתי הקבוצות");
  if (isCentralEvent(row)) reasons.push("משחק מרכזי מדי, לא נישה");
  if (!hasSingleClearFavorite(row)) reasons.push("אין פייבוריטית אחת מספיק ברורה");
  if (row.sportId === WINNER_BASKETBALL_ID && Number.isFinite(Number(row.spread)) && Math.abs(Number(row.spread)) > 12) {
    reasons.push("ליין כדורסל קיצוני מדי");
  }
  if (Number(row.odds || 0) <= 1.42 && Number(row.marketGap || 0) < 0.08) {
    reasons.push("יחס נמוך מדי בלי פער שוק גדול");
  }
  return reasons;
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
    const _verifiedAt = new Date().toISOString();
    const row = {
      id: `winner-${market.eId}`,
      eventId: String(market.eId),
      source: "Winner",
      verifiedAt: _verifiedAt,
      bettingStatus: "available",
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
    .filter((row) => hasSingleClearFavorite(row))
    .map((row) => ({
      ...row,
      scoreBreakdown: scoreBreakdown(row),
      recommendationScore: recommendationRank(row),
      nichePick: !isCentralEvent(row),
    }))
    .sort((a, b) => {
      return (b.recommendationScore || 0) - (a.recommendationScore || 0)
        || (b.probability || 0) - (a.probability || 0)
        || (b.odds || 0) - (a.odds || 0)
        || String(a.time).localeCompare(String(b.time));
    })
    .slice(0, limit)
    .map((row) => {
      const sc = row.recommendationScore || row.score || 0;
      return {
        ...row,
        recommended: true,
        recommendationReason: "top-20",
        riskLevel: sc >= 70 ? "נמוך" : sc >= 50 ? "בינוני" : "גבוה",
        signals: [
          `סבירות פגיעה ${Math.round((row.probability || 0) * 100)} אחוז`,
          `יחס Winner ${Number(row.odds).toFixed(2)}`,
          `ציון משולב ${sc}`,
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

async function get365Results(startDate, endDate, sportId365, winnerSportId, refererSport) {
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
      sports: String(sportId365),
      startDate: day,
      endDate: day,
    });
    const data = await fetchJson(`https://webws.365scores.com/web/games/?${params}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Origin: "https://www.365scores.com",
        Referer: `https://www.365scores.com/he/${refererSport}/match-results`,
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
        sportid: winnerSportId,
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

function get365FootballResults(startDate, endDate) {
  return get365Results(startDate, endDate, SCORES365_FOOTBALL_ID, WINNER_FOOTBALL_ID, "football");
}

function get365BasketballResults(startDate, endDate) {
  return get365Results(startDate, endDate, SCORES365_BASKETBALL_ID, WINNER_BASKETBALL_ID, "basketball");
}

function build365ResultRows(results, dateKey, winnerSportId, marketTitle, signals) {
  return (results || [])
    .filter((event) => String(event.sportid) === String(winnerSportId) && event.date === dateKey)
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
        sport: SPORTS[winnerSportId],
        sportId: winnerSportId,
        league: cleanText(event.league),
        country: "",
        match: `${teams.home} - ${teams.away}`,
        home: teams.home,
        away: teams.away,
        resultKey: resultKeyFor({ day: dateKey, sportId: winnerSportId, home: teams.home, away: teams.away }),
        market: marketTitle,
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
        signals,
        allMarkets: [{
          marketId: null,
          title: marketTitle,
          category: marketCategory(marketTitle),
          bettable: false,
          best: null,
          outcomes: actualWinner ? [{ outcomeId: null, desc: actualWinner, price: null, spread: "", probability: null, score: null }] : [],
        }],
        explanation: [
          `זהו משחק ${SPORTS[winnerSportId] || "ספורט"} מארכיון התוצאות של 365Scores.`,
          `התוצאה הרשמית לפי 365Scores היא ${actualWinner || "לא זמינה"}.`,
          "היחסים והבחירה עדיין מגיעים מ-Winner; 365Scores משמש רק לסגירת התוצאה.",
        ],
      };
    })
    .slice(0, 60);
}

function build365FootballRows(results, dateKey) {
  return build365ResultRows(
    results,
    dateKey,
    WINNER_FOOTBALL_ID,
    "1X2",
    ["תוצאה מ-365Scores", "כיסוי כדורגל מ-365Scores", "משמש לסגירת תחזיות Winner"]
  );
}

function build365BasketballRows(results, dateKey) {
  return build365ResultRows(
    results,
    dateKey,
    WINNER_BASKETBALL_ID,
    "המנצח",
    ["תוצאה מ-365Scores", "כיסוי כדורסל לכל הליגות", "משמש לסגירת תחזיות Winner"]
  );
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

function finalOpenRows(rows) {
  return (rows || [])
    .filter((row) => rejectionReasons(row).length === 0)
    .sort((a, b) => {
      return (b.recommendationScore || 0) - (a.recommendationScore || 0)
        || (b.probability || 0) - (a.probability || 0)
        || (b.odds || 0) - (a.odds || 0)
        || String(a.time).localeCompare(String(b.time));
    })
    .slice(0, TARGET_PICKS_PER_SPORT);
}

function finalOpenRowsBySport(rows) {
  const split = splitBySport(rows || []);
  return [
    ...finalOpenRows(split.football),
    ...finalOpenRows(split.basketball),
  ];
}

function auditOpenRows(rows, acceptedRows) {
  const acceptedIds = new Set((acceptedRows || []).map((row) => String(row.id)));
  return (rows || [])
    .map((row) => ({
      id: row.id,
      eventId: row.eventId,
      day: row.day,
      sport: row.sport,
      sportId: row.sportId,
      league: row.league,
      match: row.match,
      pick: row.pickTeam || row.winnerPick || row.pick,
      odds: row.odds,
      score: row.score,
      recommendationScore: row.recommendationScore,
      scoreBreakdown: row.scoreBreakdown,
      homeLogoSource: row.homeAsset?.logoSource || "",
      awayLogoSource: row.awayAsset?.logoSource || "",
      leagueLogoSource: row.leagueAsset?.logoSource || "",
      accepted: acceptedIds.has(String(row.id)),
      reasons: acceptedIds.has(String(row.id)) ? ["accepted"] : rejectionReasons(row),
    }))
    .sort((a, b) => Number(b.accepted) - Number(a.accepted) || (b.recommendationScore || 0) - (a.recommendationScore || 0))
    .slice(0, 120);
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
  const [{ hashes, markets }, winnerResultEvents, scores365Events] = await Promise.all([
    getWinnerLine(),
    getResults(yesterday, tomorrow),
    Promise.all([
      get365FootballResults(yesterday, yesterday),
      get365FootballResults(today, today),
      get365FootballResults(tomorrow, tomorrow),
      get365BasketballResults(yesterday, yesterday),
      get365BasketballResults(today, today),
      get365BasketballResults(tomorrow, tomorrow),
    ]).then((items) => items.flat()),
  ]);
  const resultEvents = [...winnerResultEvents, ...scores365Events];
  const resultsByEvent = resultIndex(resultEvents);
  const yesterdayMerged = mergeRows(
    buildResultRows(winnerResultEvents, yesterday),
    [
      ...build365FootballRows(scores365Events, yesterday),
      ...build365BasketballRows(scores365Events, yesterday),
    ]
  );
  const yesterdayRows = splitBySport(
    withLogos ? await enrichLogos(yesterdayMerged) : yesterdayMerged
  );
  const todayCurrentRows = [
    ...buildCurrentPicks(markets, today, BOARD_PICK_LIMIT, resultsByEvent, WINNER_FOOTBALL_ID),
    ...buildCurrentPicks(markets, today, BOARD_PICK_LIMIT, resultsByEvent, WINNER_BASKETBALL_ID),
  ];
  const todayEnrichedRows = withLogos ? await enrichLogos(todayCurrentRows) : todayCurrentRows;
  const todayFinalRows = withLogos ? finalOpenRowsBySport(todayEnrichedRows) : todayEnrichedRows;
  const todayRows = splitBySport(todayFinalRows);
  const tomorrowCurrentRows = [
    ...buildCurrentPicks(markets, tomorrow, BOARD_PICK_LIMIT, resultsByEvent, WINNER_FOOTBALL_ID),
    ...buildCurrentPicks(markets, tomorrow, BOARD_PICK_LIMIT, resultsByEvent, WINNER_BASKETBALL_ID),
  ];
  const tomorrowEnrichedRows = withLogos ? await enrichLogos(tomorrowCurrentRows) : tomorrowCurrentRows;
  const tomorrowFinalRows = withLogos ? finalOpenRowsBySport(tomorrowEnrichedRows) : tomorrowEnrichedRows;
  const tomorrowRows = splitBySport(tomorrowFinalRows);
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
    debugAudit: {
      today: splitBySport(auditOpenRows(todayEnrichedRows, todayFinalRows)),
      tomorrow: splitBySport(auditOpenRows(tomorrowEnrichedRows, tomorrowFinalRows)),
    },
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
      "AI Advisor למנוי: ניתוח הימור ידני, סיכון, חלופה מומלצת וסטטיסטיקות רלוונטיות",
      "מונדיאל: המלצות רק בחלון 48 שעות לפני משחק עם פציעות, סגלים, מאמנים וכושר",
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

function normalizePredictionStatus(status) {
  const value = cleanText(status);
  if (value === "נתפס" || value === "תפס") return "תפס";
  if (value === "לא נתפס" || value === "נפל") return "נפל";
  if (value === "החזר" || value === "לא אומת") return "לא אומת";
  if (value === "בוטל") return "בוטל";
  return value || "ממתין";
}

function normalizeFallbackRows(payload) {
  const verifiedAt = payload.generatedAt || new Date().toISOString();
  const copy = JSON.parse(JSON.stringify(payload));
  for (const tab of Object.values(copy.tabs || {})) {
    for (const rows of Object.values(tab.sports || {})) {
      for (const row of rows || []) {
        row.verifiedAt = row.verifiedAt || verifiedAt;
        row.bettingStatus = row.bettingStatus || "available";
        row.status = normalizePredictionStatus(row.status);
        if (row.result && !row.resultVerifiedAt && (row.matchPhase === "final" || row.actualWinner)) {
          row.resultVerifiedAt = verifiedAt;
        }
        const sc = row.recommendationScore || row.score || 0;
        row.riskLevel = row.riskLevel || (sc >= 70 ? "נמוך" : sc >= 50 ? "בינוני" : "גבוה");
      }
    }
  }
  return copy;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  try {
    const payload = await buildWinnerFeedPayload({ withLogos: true });
    res.status(200).json(payload);
  } catch (error) {
    try {
      res.status(200).json({
        ...normalizeFallbackRows(SNAPSHOT),
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
