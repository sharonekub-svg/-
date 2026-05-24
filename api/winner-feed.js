const crypto = require("crypto");
const SNAPSHOT = require("./winner-snapshot.json");

const ODDS_MIN = 1.4;
const ODDS_MAX = 1.9;
/** Top Winner picks shown per day (verified line + odds in range). */
const TARGET_PICKS_PER_SPORT = 20;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://jgcmtrlviuivbtimtqjq.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SPORTS = {
  240: "כדורגל",
  227: "כדורסל",
};
const WINNER_FOOTBALL_ID = 240;
const WINNER_BASKETBALL_ID = 227;
const SCORES365_FOOTBALL_ID = 1;
const SCORES365_BASKETBALL_ID = 2;
const CACHE_TTL_MS = {
  today: 5 * 60 * 1000,
  tomorrow: 60 * 60 * 1000,
  full: 5 * 60 * 1000,
};
const memoryCache = globalThis.__WINNER_FEED_CACHE__ || (globalThis.__WINNER_FEED_CACHE__ = new Map());
// Persists across warm Lambda invocations — avoids re-fetching logos for the same teams
const globalLogoCache = globalThis.__LOGO_CACHE__ || (globalThis.__LOGO_CACHE__ = new Map());

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(task, label, { attempts = 3, baseDelay = 2000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const jitter = Math.floor(Math.random() * 350);
      await sleep(baseDelay * (2 ** (attempt - 1)) + jitter);
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message || lastError}`);
}

async function fetchJson(url, options = {}) {
  return withRetry(async () => {
    const response = await fetch(url, options);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${response.status}: ${text.slice(0, 240)}`);
    }
    return text ? JSON.parse(text) : null;
  }, `fetch ${url}`, { attempts: options.retryAttempts || 3, baseDelay: options.retryBaseDelay || 2000 });
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

function israelNowParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function cacheKeyForToday() {
  const today = israelDate(0);
  return `winner-feed:${today}`;
}

function isFreshCache(entry, maxAgeMs) {
  return entry?.payload && Date.now() - Number(entry.cachedAt || 0) < maxAgeMs;
}

async function kvGet(key) {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const data = await fetchJson(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      retryAttempts: 1,
    }).catch(() => null);
    if (data?.result) {
      try {
        return typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      } catch {
        return null;
      }
    }
  }
  return memoryCache.get(key) || null;
}

async function kvSet(key, value, ttlSeconds = 3600) {
  memoryCache.set(key, value);
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    await fetchJson(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(value),
      retryAttempts: 1,
    }).catch(() => null);
    await fetchJson(`${process.env.KV_REST_API_URL}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      retryAttempts: 1,
    }).catch(() => null);
  }
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

function kickoffMs(dateKey, winnerTime) {
  const time = winnerHour(winnerTime);
  return new Date(`${dateKey}T${time}:00+03:00`).getTime();
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

function parseOverUnderLine(desc) {
  const clean = cleanText(desc);
  const m = clean.match(/(?:מעל|מתחת)\s+([+-]?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : parseSpread(clean);
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
  const label = initials(name).slice(0, 2) || "?";
  const seed = [...cleanText(name)].reduce((total, char) => total + char.charCodeAt(0), 0);
  const hueA = seed % 360;
  const hueB = (hueA + 54) % 360;
  const stroke = kind === "league" ? "#55d6ff" : "#ffc857";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="hsl(${hueA},78%,28%)"/><stop offset="1" stop-color="hsl(${hueB},82%,18%)"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".35"/></filter></defs><path d="M64 8 111 25v36c0 29-18 49-47 59-29-10-47-30-47-59V25L64 8Z" fill="url(#g)" stroke="${stroke}" stroke-width="5" filter="url(#s)"/><path d="M31 43h66" stroke="rgba(255,255,255,.18)" stroke-width="5"/><text x="64" y="78" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="900" fill="#f7f3ea">${label}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeLogoName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(מכבי|הפועל|בני|עירוני|ביתר|אף\.קיי|בי\.סי|פ\.ק|fc|f\.c|cf|bc|bk|club|women|basketball|basket)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const left = normalizeLogoName(a);
  const right = normalizeLogoName(b);
  if (!left || !right) return Math.max(left.length, right.length);
  const matrix = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[left.length][right.length];
}

function similarity(a, b) {
  const left = normalizeLogoName(a);
  const right = normalizeLogoName(b);
  const max = Math.max(left.length, right.length);
  if (!max) return 0;
  return 1 - levenshtein(left, right) / max;
}

function bestAssetCandidate(term, rows) {
  const candidates = (rows || [])
    .map((row) => ({
      ...row,
      score: Math.max(similarity(term, row.name), similarity(term, row.name_he), similarity(term, row.slug)),
    }))
    .filter((row) => row.logo_url && row.score >= 0.8)
    .sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function logoSearchTerms(name, kind) {
  const clean = cleanText(name);
  const terms = [clean, normalizeLogoName(clean)];
  const withoutSuffixes = clean
    .replace(/\b(מכבי|הפועל|בני|עירוני|אף\.קיי|בי\.סי|פ\.ק|מועדון|כדורסל|נשים)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutSuffixes && withoutSuffixes !== clean) terms.push(withoutSuffixes);
  return [...new Set(terms.filter(Boolean))];
}

async function supabaseSearch(table, term) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const value = cleanText(term);
  if (!value || value.length < 2) return null;
  const query = `${table}?select=id,name,name_he,logo_url,slug&or=(name_he.ilike.*${encodeURIComponent(value)}*,name.ilike.*${encodeURIComponent(value)}*,slug.ilike.*${encodeURIComponent(value)}*)&limit=20`;
  const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    retryAttempts: 1,
  }).catch(() => []);
  if (!Array.isArray(rows) || !rows.length) return null;
  const exact = rows.find((row) => cleanText(row.name_he) === value || cleanText(row.name) === value);
  return exact || bestAssetCandidate(value, rows) || rows.find((row) => row.logo_url) || null;
}

async function sportsDbSearch(kind, term) {
  const value = cleanText(term);
  if (!value || value.length < 3) return null;
  const endpoint = kind === "league" ? "search_all_leagues.php" : "searchteams.php";
  const param = kind === "league" ? "l" : "t";
  const url = `https://www.thesportsdb.com/api/v1/json/3/${endpoint}?${param}=${encodeURIComponent(value)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 900);
  const data = await fetchJson(url, { signal: controller.signal, retryAttempts: 1 }).catch(() => null);
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
    const timeout = setTimeout(() => controller.abort(), 900);
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(value)}`;
    const data = await fetchJson(url, {
      headers: { "User-Agent": "HapogeaLogoBot/1.0" },
      signal: controller.signal,
      retryAttempts: 1,
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
    const timeout = setTimeout(() => controller.abort(), 1000);
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
      retryAttempts: 1,
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
  const timeout = setTimeout(() => controller.abort(), 1000);
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=he&format=json&limit=1&search=${encodeURIComponent(value)}`;
  const search = await fetchJson(searchUrl, {
    headers: { "User-Agent": "HapogeaLogoBot/1.0" },
    signal: controller.signal,
    retryAttempts: 1,
  }).catch(() => null);
  clearTimeout(timeout);
  const id = search?.search?.[0]?.id;
  if (!id) return null;

  const entityController = new AbortController();
  const entityTimeout = setTimeout(() => entityController.abort(), 1000);
  const entity = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, {
    headers: { "User-Agent": "HapogeaLogoBot/1.0" },
    signal: entityController.signal,
    retryAttempts: 1,
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

// ── FCLOGO SVG (github.com/FCLOGO/fclogo.top via jsDelivr) ─────────────────
// Tier-1 source: high-quality official SVG logos per club.
// URL pattern: FC_CDN + "{ASSOC}/clubs/{NNN}_{Club}/svg/{Logo}.svg"
const FC_CDN = "https://cdn.jsdelivr.net/gh/FCLOGO/fclogo.top@main/src/data/logos/";
const FC_FA  = FC_CDN + "theFA/clubs/";
const FC_ESP = FC_CDN + "RFEF/clubs/";
const FC_ITA = FC_CDN + "FIGC/clubs/";
const FC_GER = FC_CDN + "DFB/clubs/";
const FC_POR = FC_CDN + "FPF/clubs/";

const FCLOGO_MAP = {
  // ── Premier League (theFA) ───────────────────────────────────────────────
  "צ'לסי":               FC_FA + "001_Chelsea/svg/Chelsea-FC-v2006.svg",
  "מנצ'סטר סיטי":       FC_FA + "002_Man City/svg/Manchester-City-v2016.svg",
  "ארסנל":               FC_FA + "003_Arsenal/svg/Arsenal-FC-v2002.svg",
  "ליברפול":             FC_FA + "004_Liverpool/svg/Liverpool-Football-Club-v2024-minor.svg",
  "בורנמות'":            FC_FA + "006_Bournemouth/svg/AFC-Bournemouth-v2013.svg",
  "ברנטפורד":            FC_FA + "007_Brentford/svg/Brentford-Football-Club-v2017.svg",
  "ברייטון":             FC_FA + "008_Brighton/svg/Brighton-Hove-Albion-v2011.svg",
  "אברטון":              FC_FA + "010_Everton/svg/Everton-Football-Club-v2014.svg",
  "מנצ'סטר יונייטד":    FC_FA + "014_Man United/svg/Manchester-United-Football-Club-v1998.svg",
  "ניוקאסל":             FC_FA + "015_Newcastle/svg/Newcastle-United-Football-Club-v1988.svg",
  "נוטינגהאם פורסט":    FC_FA + "016_Nottingham/svg/Nottingham-Forest-Football-Club-v2010.svg",
  "טוטנהאם":             FC_FA + "018_Hotspur/svg/Tottenham-Hotspur-Football-Club-v2024.svg",
  "ווסטהאם":             FC_FA + "019_West Ham/svg/West-Ham-United-Football-Club-v2016.svg",
  "לידס":                FC_FA + "021_Leeds United/svg/Leeds-United-v2002.svg",
  // ── La Liga (RFEF) ───────────────────────────────────────────────────────
  "ריאל מדריד":          FC_ESP + "001_Real Madrid/svg/Real-Madrid-CF-v2002.svg",
  "אתלטיקו מדריד":       FC_ESP + "002_Atletico Madrid/svg/Atletico-Madrid-v2024.svg",
  "אתלטיק בילבאו":       FC_ESP + "004_Athletic Bilbao/svg/Athletic-Club-Bilbao-v2008.svg",
  "ברצלונה":             FC_ESP + "006_Barcelona/svg/FC-Barcelona-v2002.svg",
  // ── Serie A (FIGC) ───────────────────────────────────────────────────────
  "יובנטוס":             FC_ITA + "001_Juventus/svg/Juventus-FC-v2017.svg",
  "אינטר מילאן":         FC_ITA + "002_Intel Milan/svg/FC-Inter-Milan-v2021.svg",
  "אטלנטה":              FC_ITA + "003_Atalanta/svg/Atalanta-BC-v1993.svg",
  "מילאן":               FC_ITA + "013_AC Milan/svg/AC-Milan-v2009.svg",
  "נאפולי":              FC_ITA + "015_Napoli/svg/SSC-Napoli-v2024.svg",
  "רומא":                FC_ITA + "017_Roma/svg/AS-Roma-v2016.svg",
  // ── Bundesliga (DFB) ─────────────────────────────────────────────────────
  "באיירן מינכן":        FC_GER + "001_Bayern Munich/svg/FC-Bayern-Munchen-v2024.svg",
  "בורוסיה דורטמונד":    FC_GER + "002_Dortmund/svg/Borussia-Dortmund-v1993.svg",
  "לבה קוזן":            FC_GER + "004_Leverkusen/svg/Bayer-04-Leverkusen-v2006.svg",
  "RB לייפציג":          FC_GER + "006_Leipzig/svg/RB-Leipzig-v2020.svg",
  "איינטרכט פרנקפורט":   FC_GER + "007_Frankfurt/svg/Eintracht-Frankfurt-v1998.svg",
  "פרייבורג":            FC_GER + "011_Freiburg/svg/SC-Freiburg-v2008.svg",
  // ── Liga Portugal (FPF) ──────────────────────────────────────────────────
  "בנפיקה":              FC_POR + "001_Benfica/svg/Sport-Lisboa-e-Benfica-v1999.svg",
  "פורטו":               FC_POR + "002_Porto/svg/Futebol-Clube-do-Porto-v2002.svg",
  "FC פורטו":            FC_POR + "002_Porto/svg/Futebol-Clube-do-Porto-v2002.svg",
};

/**
 * Returns FCLOGO SVG row (highest quality) or null.
 * Called first in resolveLogoRow(), before the PNG map and external APIs.
 */
function fclogoStaticLookup(name) {
  const clean = cleanText(name);
  if (!clean) return null;
  const url = FCLOGO_MAP[clean];
  if (url) return { name: clean, logo_url: url, source: "fclogo-svg" };
  // Partial match
  for (const [key, u] of Object.entries(FCLOGO_MAP)) {
    const k = cleanText(key);
    if (k && (clean.includes(k) || (k.length >= 4 && k.includes(clean)))) {
      return { name: clean, logo_url: u, source: "fclogo-svg" };
    }
  }
  return null;
}
// ────────────────────────────────────────────────────────────────────────────

// ── Football Logos CDN (github.com/luukhopman/football-logos via jsDelivr) ──
// Tier-2 source — PNG badges, wider league coverage than FCLOGO.
// Covers 25 European leagues with official PNG badges per team.
const FL_CDN = "https://cdn.jsdelivr.net/gh/luukhopman/football-logos@master/logos/";
const FL_EPL = FL_CDN + "England%20-%20Premier%20League/";
const FL_ESP = FL_CDN + "Spain%20-%20LaLiga/";
const FL_ITA = FL_CDN + "Italy%20-%20Serie%20A/";
const FL_GER = FL_CDN + "Germany%20-%20Bundesliga/";
const FL_POR = FL_CDN + "Portugal%20-%20Liga%20Portugal/";
const FL_BEL = FL_CDN + "Belgium%20-%20Jupiler%20Pro%20League/";
const FL_SCO = FL_CDN + "Scotland%20-%20Scottish%20Premiership/";
const FL_NOR = FL_CDN + "Norway%20-%20Eliteserien/";
const FL_SWE = FL_CDN + "Sweden%20-%20Allsvenskan/";
const FL_BUL = FL_CDN + "Bulgaria%20-%20efbet%20Liga/";
const FL_POL = FL_CDN + "Poland%20-%20PKO%20BP%20Ekstraklasa/";
const FL_ROM = FL_CDN + "Romania%20-%20SuperLiga/";
const FL_SUI = FL_CDN + "Switzerland%20-%20Super%20League/";
const FL_CRO = FL_CDN + "Croatia%20-%20SuperSport%20HNL/";
const FL_CZE = FL_CDN + "Czech%20Republic%20-%20Chance%20Liga/";
const FL_DEN = FL_CDN + "Denmark%20-%20Superliga/";
const FL_GRE = FL_CDN + "Greece%20-%20Super%20League%201/";
const FL_ISR = FL_CDN + "Israel%20-%20Ligat%20ha'Al/";
const FL_NED = FL_CDN + "Netherlands%20-%20Eredivisie/";
const FL_AUT = FL_CDN + "Austria%20-%20Bundesliga/";
const FL_SRB = FL_CDN + "Serbia%20-%20Super%20liga%20Srbije/";
const FL_TUR = FL_CDN + "T%C3%BCrkiye%20-%20S%C3%BCper%20Lig/";
const FL_RUS = FL_CDN + "Russia%20-%20Premier%20Liga/";
const FL_UKR = FL_CDN + "Ukraine%20-%20Premier%20Liga/";

/**
 * Static map of Hebrew team names → official logo URL (jsDelivr CDN).
 * Checked first in resolveLogoRow() before any external API call.
 * Add new entries here whenever new teams appear in Winner feed.
 */
const FOOTBALL_LOGOS_MAP = {
  // ── Premier League ──────────────────────────────────────────────────────
  "ווסטהאם":               FL_EPL + "West%20Ham%20United.png",
  "לידס":                  FL_EPL + "Leeds%20United.png",
  "ליברפול":               FL_EPL + "Liverpool%20FC.png",
  "ברנטפורד":              FL_EPL + "Brentford%20FC.png",
  "טוטנהאם":               FL_EPL + "Tottenham%20Hotspur.png",
  "אברטון":                FL_EPL + "Everton%20FC.png",
  "ברייטון":               FL_EPL + "Brighton%20%26%20Hove%20Albion.png",
  "מנצ'סטר יונייטד":      FL_EPL + "Manchester%20United.png",
  "נוטינגהאם פורסט":      FL_EPL + "Nottingham%20Forest.png",
  "בורנמות'":              FL_EPL + "AFC%20Bournemouth.png",
  "מנצ'סטר סיטי":         FL_EPL + "Manchester%20City.png",
  "ארסנל":                 FL_EPL + "Arsenal%20FC.png",
  "צ'לסי":                FL_EPL + "Chelsea%20FC.png",
  "אסטון וילה":            FL_EPL + "Aston%20Villa.png",
  "ניוקאסל":               FL_EPL + "Newcastle%20United.png",
  "פולהאם":                FL_EPL + "Fulham%20FC.png",
  "קריסטל פאלאס":          FL_EPL + "Crystal%20Palace.png",
  "וולברהמפטון":           FL_EPL + "Wolverhampton%20Wanderers.png",
  "ברנסלי":                FL_EPL + "Burnley%20FC.png",
  "סנדרלנד":               FL_EPL + "Sunderland%20AFC.png",
  // ── La Liga ─────────────────────────────────────────────────────────────
  "ריאל מדריד":            FL_ESP + "Real%20Madrid.png",
  "ברצלונה":               FL_ESP + "FC%20Barcelona.png",
  "אתלטיק בילבאו":         FL_ESP + "Athletic%20Bilbao.png",
  "ולנסיה":                FL_ESP + "Valencia%20CF.png",
  "אוסאסונה":              FL_ESP + "CA%20Osasuna.png",
  "ג'ירונה":               FL_ESP + "Girona%20FC.png",
  "מאיורקה":               FL_ESP + "RCD%20Mallorca.png",
  "אלצ'ה":                FL_ESP + "Elche%20CF.png",
  "אוביידו":               FL_ESP + "Real%20Oviedo.png",
  "חטאפה":                 FL_ESP + "Getafe%20CF.png",
  "סביליה":                FL_ESP + "Sevilla%20FC.png",
  "ריאל בטיס":             FL_ESP + "Real%20Betis%20Balompi%C3%A9.png",
  "וייאריאל":              FL_ESP + "Villarreal%20CF.png",
  "אתלטיקו מדריד":         FL_ESP + "Atl%C3%A9tico%20de%20Madrid.png",
  "ספורטינג חיחון":        FL_ESP + "Real%20Sporting%20de%20Gij%C3%B3n.png",
  "ריאל סוסיאדד":          FL_ESP + "Real%20Sociedad.png",
  "אספניול":               FL_ESP + "RCD%20Espanyol%20Barcelona.png",
  "סלטה ויגו":             FL_ESP + "Celta%20de%20Vigo.png",
  "לבנטה":                 FL_ESP + "Levante%20UD.png",
  "ריאו ואיקנו":           FL_ESP + "Rayo%20Vallecano.png",
  "אלאבס":                 FL_ESP + "Deportivo%20Alav%C3%A9s.png",
  // ── Serie A ─────────────────────────────────────────────────────────────
  "קרמונזה":               FL_ITA + "US%20Cremonese.png",
  "קומו":                  FL_ITA + "Como%201907.png",
  "לצ'ה":                 FL_ITA + "US%20Lecce.png",
  "גנואה":                 FL_ITA + "Genoa%20CFC.png",
  "יובנטוס":               FL_ITA + "Juventus%20FC.png",
  "מילאן":                 FL_ITA + "AC%20Milan.png",
  "אינטר מילאן":           FL_ITA + "Inter%20Milan.png",
  "נאפולי":                FL_ITA + "SSC%20Napoli.png",
  "פיורנטינה":             FL_ITA + "ACF%20Fiorentina.png",
  "לאציו":                 FL_ITA + "SS%20Lazio.png",
  "רומא":                  FL_ITA + "AS%20Roma.png",
  "אטלנטה":                FL_ITA + "Atalanta%20BC.png",
  "פיזה":                  FL_ITA + "Pisa%20Sporting%20Club.png",
  "בולוניה":               FL_ITA + "Bologna%20FC%201909.png",
  "טורינו":                FL_ITA + "Torino%20FC.png",
  "אודינזה":               FL_ITA + "Udinese%20Calcio.png",
  "קליארי":                FL_ITA + "Cagliari%20Calcio.png",
  "פארמה":                 FL_ITA + "Parma%20Calcio%201913.png",
  "ורונה":                 FL_ITA + "Hellas%20Verona.png",
  "ססואולו":               FL_ITA + "US%20Sassuolo.png",
  // ── Bundesliga ──────────────────────────────────────────────────────────
  "באיירן מינכן":          FL_GER + "Bayern%20Munich.png",
  "פרייבורג":              FL_GER + "SC%20Freiburg.png",
  "בורוסיה דורטמונד":      FL_GER + "Borussia%20Dortmund.png",
  "לבה קוזן":              FL_GER + "Bayer%2004%20Leverkusen.png",
  "RB לייפציג":            FL_GER + "RB%20Leipzig.png",
  "איינטרכט פרנקפורט":     FL_GER + "Eintracht%20Frankfurt.png",
  "מיינץ":                 FL_GER + "1.FSV%20Mainz%2005.png",
  "הופנהיים":              FL_GER + "TSG%201899%20Hoffenheim.png",
  "וולפסבורג":             FL_GER + "VfL%20Wolfsburg.png",
  "שטוטגרט":               FL_GER + "VfB%20Stuttgart.png",
  "ורדר ברמן":             FL_GER + "SV%20Werder%20Bremen.png",
  "בורוסיה מנכן גלדבך":    FL_GER + "Borussia%20M%C3%B6nchengladbach.png",
  "אוניון ברלין":          FL_GER + "1.FC%20Union%20Berlin.png",
  "היידנהיים":             FL_GER + "1.FC%20Heidenheim%201846.png",
  "קלן":                   FL_GER + "1.FC%20K%C3%B6ln.png",
  "המבורג":                FL_GER + "Hamburger%20SV.png",
  "סט. פאולי":             FL_GER + "FC%20St.%20Pauli.png",
  "אוגסבורג":              FL_GER + "FC%20Augsburg.png",
  // ── Liga Portugal ───────────────────────────────────────────────────────
  "בנפיקה":                FL_POR + "SL%20Benfica.png",
  "ספורטינג":              FL_POR + "Sporting%20CP.png",
  "ספורטינג פורטוגל":      FL_POR + "Sporting%20CP.png",
  "FC פורטו":              FL_POR + "FC%20Porto.png",
  "פורטו":                 FL_POR + "FC%20Porto.png",
  "ברגה":                  FL_POR + "SC%20Braga.png",
  "גיל ויסנטה":            FL_POR + "Gil%20Vicente%20FC.png",
  "ריו אבה":               FL_POR + "Rio%20Ave%20FC.png",
  "ויטוריה גימאראש":       FL_POR + "Vit%C3%B3ria%20Guimar%C3%A3es%20SC.png",
  "כאזה פיה":              FL_POR + "Casa%20Pia%20AC.png",
  "אסטוריל":               FL_POR + "GD%20Estoril%20Praia.png",
  // ── Jupiler Pro League ──────────────────────────────────────────────────
  "קלאב ברוז'":            FL_BEL + "Club%20Brugge%20KV.png",
  "קלאב ברוז'ז":           FL_BEL + "Club%20Brugge%20KV.png",
  "גנט":                   FL_BEL + "KAA%20Gent.png",
  "אנדרלכט":               FL_BEL + "RSC%20Anderlecht.png",
  "ז'נק":                  FL_BEL + "KRC%20Genk.png",
  "סרקל ברוז'":            FL_BEL + "Cercle%20Brugge.png",
  "רויאל אנטוורפ":         FL_BEL + "Royal%20Antwerp%20FC.png",
  "סטנדר לייז'":           FL_BEL + "Standard%20Li%C3%A8ge.png",
  "אוד הברלה לובן":        FL_BEL + "Oud-Heverlee%20Leuven.png",
  // ── Scottish Premiership ─────────────────────────────────────────────────
  "סט. מירן":              FL_SCO + "St.%20Mirren%20FC.png",
  "ריינג'רס":              FL_SCO + "Rangers%20FC.png",
  "סלטיק":                 FL_SCO + "Celtic%20FC.png",
  "הארט":                  FL_SCO + "Heart%20of%20Midlothian%20FC.png",
  "היברניאן":              FL_SCO + "Hibernian%20FC.png",
  "קילמרנוק":              FL_SCO + "Kilmarnock%20FC.png",
  "אברדין":                FL_SCO + "Aberdeen%20FC.png",
  "דנדי":                  FL_SCO + "Dundee%20FC.png",
  "דנדי יונייטד":          FL_SCO + "Dundee%20United%20FC.png",
  "מאדרוול":               FL_SCO + "Motherwell%20FC.png",
  // ── Eliteserien ─────────────────────────────────────────────────────────
  "פרדריקסטאד":            FL_NOR + "Fredrikstad%20FK.png",
  "הוגסונד":               FL_NOR + "FK%20Haugesund.png",
  "סנדפיורד":              FL_NOR + "Sandefjord%20Fotball.png",
  "רוזנבורג":              FL_NOR + "Rosenborg%20BK.png",
  "מולדה":                 FL_NOR + "Molde%20FK.png",
  "בודו גלימט":            FL_NOR + "FK%20Bod%C3%B8Glimt.png",
  "ויקינג":                FL_NOR + "Viking%20FK.png",
  "סקארפסבורג":            FL_NOR + "Sarpsborg%2008%20FF.png",
  "SK בראן":               FL_NOR + "SK%20Brann.png",
  "טרומסו":                FL_NOR + "Troms%C3%B8%20IL.png",
  "סטרומסגודסט":           FL_NOR + "Str%C3%B8msgodset%20IF.png",
  // ── Allsvenskan ─────────────────────────────────────────────────────────
  "נורקופינג אף.קיי":      FL_SWE + "IFK%20Norrk%C3%B6ping.png",
  "סיריוס":                FL_SWE + "IK%20Sirius.png",
  "אוסטרס":                FL_SWE + "%C3%96sters%20IF.png",
  "גאיס":                  FL_SWE + "GAIS.png",
  "AIK":                   FL_SWE + "AIK.png",
  "מלמו":                  FL_SWE + "Malm%C3%B6%20FF.png",
  "IFK גטבורג":            FL_SWE + "IFK%20G%C3%B6teborg.png",
  "המרבי":                 FL_SWE + "Hammarby%20IF.png",
  "דיורגורדן":             FL_SWE + "Djurg%C3%A5rdens%20IF.png",
  "הלמסטד":                FL_SWE + "Halmstads%20BK.png",
  "אלפסבורג":              FL_SWE + "IF%20Elfsborg.png",
  // ── efbet Liga (Bulgaria) ────────────────────────────────────────────────
  "לבסקי סופיה":           FL_BUL + "Levski%20Sofia.png",
  "לודוגורץ":              FL_BUL + "Ludogorets%20Razgrad.png",
  "צסק\"א סופיה":          FL_BUL + "CSKA-Sofia.png",
  "צסק\"א 1948 סופיה":     FL_BUL + "CSKA%201948.png",
  // ── Ekstraklasa (Poland) ─────────────────────────────────────────────────
  "ויצ'יסטה קרקוב":        FL_POL + "Cracovia.png",
  "שלאסק ורוצלאב":         FL_POL + "GKS%20Katowice.png",
  "פוגון גרודזיסק מזובייצ'קי": FL_POL + "Pogon%20Szczecin.png",
  "לגיה ורשה":             FL_POL + "Legia%20Warszawa.png",
  "לך פוזנן":              FL_POL + "Lech%20Poznan.png",
  "לכיה גדנסק":            FL_POL + "Lechia%20Gdansk.png",
  "ראקוב צ'נסטוחובה":      FL_POL + "Rak%C3%B3w%20Cz%C4%99stochowa.png",
  "ארקה גדיניה":           FL_POL + "Arka%20Gdynia.png",
  // ── SuperLiga (Romania) ──────────────────────────────────────────────────
  "Cs Rapid Bucuresti":     FL_ROM + "FC%20Rapid%201923.png",
  "FCSB":                   FL_ROM + "FCSB.png",
  "CFR קלוז'":             FL_ROM + "CFR%20Cluj.png",
  // ── Swiss Super League ───────────────────────────────────────────────────
  "סט. גאלן":              FL_SUI + "FC%20St.%20Gallen%201879.png",
  "סרוויט":                FL_SUI + "Servette%20FC.png",
  "יאנג בויז":             FL_SUI + "BSC%20Young%20Boys.png",
  "בזל":                   FL_SUI + "FC%20Basel%201893.png",
  "לוזאן":                 FL_SUI + "FC%20Lausanne-Sport.png",
  "סטאד לוזאן":            FL_SUI + "FC%20Lausanne-Sport.png",
  "לוגנו":                 FL_SUI + "FC%20Lugano.png",
  "לוצרן":                 FL_SUI + "FC%20Luzern.png",
  "ציריך":                 FL_SUI + "FC%20Z%C3%BCrich.png",
  "גרסהופר":               FL_SUI + "Grasshopper%20Club%20Zurich.png",
  "זרוויט":                FL_SUI + "Servette%20FC.png",
  // ── Ligat ha'Al (Israel) ─────────────────────────────────────────────────
  "מכבי חיפה":             FL_ISR + "Maccabi%20Haifa.png",
  "מכבי תל אביב":          FL_ISR + "Maccabi%20Tel%20Aviv.png",
  "מכבי נתניה":            FL_ISR + "Maccabi%20Netanya.png",
  "הפועל תל אביב":         FL_ISR + "Hapoel%20Tel%20Aviv.png",
  "הפועל חיפה":            FL_ISR + "Hapoel%20Haifa.png",
  "הפועל באר שבע":         FL_ISR + "Hapoel%20Beer%20Sheva.png",
  "הפועל פתח תקוה":        FL_ISR + "Hapoel%20Petah%20Tikva.png",
  "הפועל ירושלים":         FL_ISR + "Hapoel%20Jerusalem.png",
  "בית\"ר ירושלים":        FL_ISR + "Beitar%20Jerusalem.png",
  "FC אשדוד":              FL_ISR + "FC%20Ashdod.png",
  "מכבי בני ריינה":        FL_ISR + "Maccabi%20Bnei%20Reineh.png",
  "אחיד בני סח'נין":       FL_ISR + "Ihud%20Bnei%20Sakhnin.png",
  "עירוני קרית שמונה":     FL_ISR + "Ironi%20Kiryat%20Shmona.png",
};

/**
 * Returns a CDN logo row from the static football-logos map, or null.
 * Used as the first (fastest) step in resolveLogoRow().
 */
function footballLogosStaticLookup(name) {
  const clean = cleanText(name);
  if (!clean) return null;
  // Direct match
  if (FOOTBALL_LOGOS_MAP[clean]) {
    return { name: clean, logo_url: FOOTBALL_LOGOS_MAP[clean], source: "football-logos-cdn" };
  }
  // Partial / trimmed match — useful for names like "מנצ'סטר יונייטד אף.קיי"
  for (const [key, url] of Object.entries(FOOTBALL_LOGOS_MAP)) {
    const k = cleanText(key);
    if (k && clean.includes(k) || (k.length >= 4 && k.includes(clean))) {
      return { name: clean, logo_url: url, source: "football-logos-cdn" };
    }
  }
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────
// alexanderthebadatcoding/Sports-Logos — NBA + UEFA CL + Bundesliga extras
// CDN: cdn.jsdelivr.net/gh/alexanderthebadatcoding/Sports-Logos@main/{folder}/{code}.png
const SL = "https://cdn.jsdelivr.net/gh/alexanderthebadatcoding/Sports-Logos@main/";
const SL_NBA  = SL + "NBA/";
const SL_UEFA = SL + "UEFA/";
const SL_GER  = SL + "Bundesliga/";
const SL_NFL  = SL + "NFL/";

const SPORTS_LOGOS_MAP = {
  // ── NBA ──────────────────────────────────────────────────────────────────
  "בוסטון סלטיקס":            SL_NBA + "BOS.png",
  "סלטיקס":                   SL_NBA + "BOS.png",
  "לוס אנג'לס לייקרס":        SL_NBA + "LAL.png",
  "לייקרס":                   SL_NBA + "LAL.png",
  "גולדן סטייט ווריורס":      SL_NBA + "GS.png",
  "ווריורס":                  SL_NBA + "GS.png",
  "מיאמי היט":                SL_NBA + "MIAH.png",
  "היט":                      SL_NBA + "MIAH.png",
  "מילווקי באקס":             SL_NBA + "MIL.png",
  "באקס":                     SL_NBA + "MIL.png",
  "פילדלפיה סיקסרס":          SL_NBA + "PHI.png",
  "סיקסרס":                   SL_NBA + "PHI.png",
  "דנבר נאגטס":               SL_NBA + "DEN.png",
  "נאגטס":                    SL_NBA + "DEN.png",
  "פניקס סאנס":               SL_NBA + "PHX.png",
  "סאנס":                     SL_NBA + "PHX.png",
  "ניו יורק ניקס":            SL_NBA + "NY.png",
  "ניקס":                     SL_NBA + "NY.png",
  "ברוקלין נטס":              SL_NBA + "BKN.png",
  "נטס":                      SL_NBA + "BKN.png",
  "שיקגו בולס":               SL_NBA + "CHIH.png",
  "בולס":                     SL_NBA + "CHIH.png",
  "קליבלנד קאבלירס":          SL_NBA + "CLE.png",
  "קאבלירס":                  SL_NBA + "CLE.png",
  "אטלנטה הוקס":              SL_NBA + "ATL.png",
  "הוקס":                     SL_NBA + "ATL.png",
  "טורונטו רפטורס":           SL_NBA + "TOR.png",
  "רפטורס":                   SL_NBA + "TOR.png",
  "אוקלהומה סיטי תאנדר":      SL_NBA + "OKC.png",
  "תאנדר":                    SL_NBA + "OKC.png",
  "מינסוטה טימברוולבס":       SL_NBA + "MIN.png",
  "טימברוולבס":               SL_NBA + "MIN.png",
  "אינדיאנה פייסרס":          SL_NBA + "IND.png",
  "פייסרס":                   SL_NBA + "IND.png",
  "שרלוט הורנטס":             SL_NBA + "CHA.png",
  "הורנטס":                   SL_NBA + "CHA.png",
  "ניו אורלינס פליקנס":       SL_NBA + "NO.png",
  "פליקנס":                   SL_NBA + "NO.png",
  "פורטלנד טריל בלייזרס":     SL_NBA + "POR.png",
  "טריל בלייזרס":             SL_NBA + "POR.png",
  "סקרמנטו קינגס":            SL_NBA + "SAC.png",
  "קינגס":                    SL_NBA + "SAC.png",
  "יוטה ג'אז":                SL_NBA + "UTAH.png",
  "ג'אז":                     SL_NBA + "UTAH.png",
  "ממפיס גריזליז":            SL_NBA + "MEM.png",
  "גריזליז":                  SL_NBA + "MEM.png",
  "סן אנטוניו ספרס":          SL_NBA + "SA.png",
  "ספרס":                     SL_NBA + "SA.png",
  "אורלנדו מג'יק":            SL_NBA + "ORL.png",
  "מג'יק":                    SL_NBA + "ORL.png",
  "יוסטון רוקטס":             SL_NBA + "HOU.png",
  "רוקטס":                    SL_NBA + "HOU.png",
  "דטרויט פיסטונס":           SL_NBA + "DET.png",
  "פיסטונס":                  SL_NBA + "DET.png",
  "לוס אנג'לס קליפרס":        SL_NBA + "LAC.png",
  "קליפרס":                   SL_NBA + "LAC.png",
  "וושינגטון ויזרדס":         SL_NBA + "WSH.png",
  "ויזרדס":                   SL_NBA + "WSH.png",
  "דאלאס מאבריקס":            SL_NBA + "DAL.png",
  "מאבריקס":                  SL_NBA + "DAL.png",
  "אורלנדו":                  SL_NBA + "ORL.png",

  // ── UEFA Champions League extras (not in FCLOGO/luukhopman) ─────────────
  "פריז סן ז'רמן":            SL_UEFA + "PSG.png",
  "PSG":                      SL_UEFA + "PSG.png",
  "מונאקו":                   SL_UEFA + "MON.png",
  "AS מונאקו":                SL_UEFA + "MON.png",
  "יאנג בויס":                SL_UEFA + "YB.png",
  "סלטיק":                   SL_UEFA + "CEL.png",
  "PSV":                      SL_UEFA + "PSV.png",
  "PSV איינדהובן":            SL_UEFA + "PSV.png",
  "כוכב אדום":                SL_UEFA + "RSB.png",
  "שחטאר דונייצק":            SL_UEFA + "SHK.png",
  "שחטאר":                    SL_UEFA + "SHK.png",
  "זלצבורג":                  SL_UEFA + "SLZ.png",
  "RB זלצבורג":               SL_UEFA + "SLZ.png",
  "אסטון וילה":               SL_UEFA + "AVL.png",
  "בולוניה":                  SL_UEFA + "BOL.png",
  "ליל":                      SL_UEFA + "LILL.png",
  "שטוטגרט":                  SL_UEFA + "STG.png",
  "VFB שטוטגרט":              SL_UEFA + "STG.png",
  "ברסט":                     SL_UEFA + "BRE.png",
  "אינטר":                    SL_UEFA + "INT.png",
  "אינטר מילאן":              SL_UEFA + "INT.png",
  "יובנטוס":                  SL_UEFA + "JUV.png",
  "ברוז' ":                   SL_UEFA + "BRU.png",
  "ספורטינג ליסבון":          SL_UEFA + "SCP.png",
  "ספורטינג CP":              SL_UEFA + "SCP.png",
  "פנבנפיקה":                 SL_UEFA + "SLB.png",
  "בנפיקה":                   SL_UEFA + "SLB.png",
  "פייינורד":                 SL_UEFA + "FEY.png",
  "גירונה":                   SL_UEFA + "GIR.png",
  "ליברפול":                  SL_UEFA + "LIV.png",
  "מנצ'סטר סיטי":             SL_UEFA + "MNC.png",
  "ארסנל":                    SL_UEFA + "ARS.png",
  "אטלטה":                    SL_UEFA + "ATA.png",
  "אטלנטה":                   SL_UEFA + "ATA.png",

  // ── Bundesliga extras (not in FCLOGO/luukhopman) ─────────────────────────
  "בורוסיה מנכ'נגלדבאך":      SL_GER + "BMG.png",
  "גלדבאך":                   SL_GER + "BMG.png",
  "בוכום":                    SL_GER + "BOC.png",
  "אוגסבורג":                 SL_GER + "FCA.png",
  "יוניון ברלין":              SL_GER + "FCU.png",
  "FC יוניון ברלין":           SL_GER + "FCU.png",
  "היידנהיים":                SL_GER + "HDH.png",
  "קיל":                      SL_GER + "KIE.png",
  "הולשטיין קיל":             SL_GER + "KIE.png",
  "מיינץ":                    SL_GER + "M05.png",
  "FSV מיינץ":                SL_GER + "M05.png",
  "זנט פאולי":                SL_GER + "STP.png",
  "FC זנט פאולי":              SL_GER + "STP.png",
  "ורדר ברמן":                SL_GER + "SVW.png",
  "הופנהיים":                 SL_GER + "TSG.png",
  "TSG הופנהיים":             SL_GER + "TSG.png",
  "ולפסבורג":                 SL_GER + "WOB.png",
  "VfL ולפסבורג":             SL_GER + "WOB.png",
  "שטוטגרט":                  SL_GER + "VFB.png",
  "VfB שטוטגרט":              SL_GER + "VFB.png",
};

function sportsLogosLookup(name) {
  const clean = cleanText(name);
  if (!clean) return null;
  if (SPORTS_LOGOS_MAP[clean]) {
    return { name: clean, logo_url: SPORTS_LOGOS_MAP[clean], source: "sports-logos-cdn" };
  }
  // Partial match for short aliases (e.g. "לייקרס" inside "לוס אנג'לס לייקרס")
  for (const [key, url] of Object.entries(SPORTS_LOGOS_MAP)) {
    const k = cleanText(key);
    if (k && k.length >= 3 && (clean.includes(k) || k.includes(clean))) {
      return { name: clean, logo_url: url, source: "sports-logos-cdn" };
    }
  }
  return null;
}
// ─────────────────────────────────────────────────────────────────────────────

async function resolveLogoRow(table, kind, name) {
  const key = `${kind}:${cleanText(name)}`;
  if (globalLogoCache.has(key)) return globalLogoCache.get(key);
  if (globalLogoCache.has(`${key}:pending`)) {
    await globalLogoCache.get(`${key}:pending`);
    return globalLogoCache.get(key) || null;
  }
  let resolvePending;
  const pending = new Promise(r => { resolvePending = r; });
  globalLogoCache.set(`${key}:pending`, pending);
  let row = null;
  try {
    // ── Step 1a: FCLOGO SVG map (vector, highest quality, instant) ───────────
    if (kind === "team") {
      const svgRow = fclogoStaticLookup(name);
      if (svgRow) {
        globalLogoCache.set(key, svgRow);
        globalLogoCache.delete(`${key}:pending`);
        resolvePending();
        return svgRow;
      }
    }
    // ── Step 1b: luukhopman PNG map (wide league coverage, instant) ───────────
    if (kind === "team") {
      const staticRow = footballLogosStaticLookup(name);
      if (staticRow) {
        globalLogoCache.set(key, staticRow);
        globalLogoCache.delete(`${key}:pending`);
        resolvePending();
        return staticRow;
      }
    }
    // ── Step 1c: alexanderthebadatcoding/Sports-Logos (NBA + UEFA CL extras) ─
    if (kind === "team") {
      const slRow = sportsLogosLookup(name);
      if (slRow) {
        globalLogoCache.set(key, slRow);
        globalLogoCache.delete(`${key}:pending`);
        resolvePending();
        return slRow;
      }
    }
    // ── Step 2: Supabase + external APIs ─────────────────────────────────
    row = await Promise.race([
      (async () => {
        for (const term of logoSearchTerms(cleanText(name), kind)) {
          const supabaseRow = await supabaseSearch(table, term);
          if (supabaseRow?.logo_url) return supabaseRow;
          const results = await Promise.allSettled([
            sportsDbSearch(kind, term),
            wikipediaLogoSearch(term, kind),
            wikipediaSearchLogo(term, kind),
            wikidataLogoSearch(term, kind),
          ]);
          const found = results.find(r => r.status === "fulfilled" && r.value?.logo_url)?.value || null;
          if (found?.logo_url) return found;
        }
        return null;
      })(),
      new Promise(resolve => setTimeout(() => resolve(null), 2200)),
    ]);
  } catch (_) {
    row = null;
  }
  globalLogoCache.set(key, row);
  globalLogoCache.delete(`${key}:pending`);
  resolvePending();
  return row;
}

async function enrichLogos(rows) {
  async function teamAsset(name) {
    const key = cleanText(name);
    const row = await resolveLogoRow("teams", "team", key);
    return {
      name: key,
      logo: row?.logo_url || fallbackLogo(key, "team"),
      initials: initials(key),
      logoSource: row?.source || (row?.logo_url ? "win2go teams" : "generated team badge"),
    };
  }
  async function leagueAsset(name) {
    const key = cleanText(name);
    const row = await resolveLogoRow("leagues", "league", key);
    return {
      name: key,
      logo: row?.logo_url || fallbackLogo(key, "league"),
      initials: initials(key),
      logoSource: row?.source || (row?.logo_url ? "win2go leagues" : "generated league badge"),
    };
  }
  function withLeagueFallback(asset, leagueAssetValue, teamName) {
    if (hasVerifiedLogo(asset)) return { ...asset, logoTier: 1 };
    if (hasVerifiedLogo(leagueAssetValue)) {
      return {
        ...asset,
        logo: leagueAssetValue.logo,
        logoSource: `league fallback: ${leagueAssetValue.logoSource}`,
        logoTier: 3,
        fallbackFor: teamName,
      };
    }
    return { ...asset, logo: fallbackLogo(teamName, "team"), logoSource: "dynamic generated shield", logoTier: 4 };
  }
  return Promise.all(rows.map(async (row) => {
    // league + home + away all in parallel (was: league first, then home+away)
    const [leagueAssetValue, homeRaw, awayRaw] = await Promise.all([
      leagueAsset(row.league),
      teamAsset(row.home),
      teamAsset(row.away),
    ]);
    const homeAsset = withLeagueFallback(homeRaw, leagueAssetValue, row.home);
    const awayAsset = withLeagueFallback(awayRaw, leagueAssetValue, row.away);
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
  const market = markets.find((m) => /1X2|winner/i.test(cleanText(m.title)) || cleanText(m.title).includes("המנצח") || cleanText(m.title).includes("׳”׳׳ ׳¦׳—"));
  const raw = cleanText((market?.marketResults || [])[0]);
  if (raw) return raw.toLowerCase() === "x" ? "תיקו" : raw;
  return isFinalResultEvent(event) ? scoreBasedWinner(event) : "";
}

function scoreNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreBasedWinner(event) {
  const homeScore = scoreNumber(event?.scoreA);
  const awayScore = scoreNumber(event?.scoreB);
  if (homeScore === null || awayScore === null) return "";
  if (homeScore === awayScore) return "תיקו";
  return homeScore > awayScore ? cleanText(event?.teamA) : cleanText(event?.teamB);
}

function isFinalResultEvent(event) {
  const status = cleanText(event?.status || event?.statusText || event?.eventStatus || event?.matchStatus || event?.state);
  return event?.isFinal === true ||
    Number(event?.statusGroup) === 4 ||
    /final|ended|finished|full.?time|after extra time|הסתיים|סיום|נגמר/i.test(status);
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
  // Check FINAL first — a game with a winner is always over, regardless of status text
  if (resultWinner(event)) return "final";
  if (/cancel|cancelled|canceled|abandon|void|בוטל|מבוטל/i.test(status)) return "cancelled";
  if (/postpone|postponed|delayed|נדחה|דחוי/i.test(status)) return "postponed";
  if (/halftime|half.?time|half_time|הפסקה|מחצית/i.test(status)) return "ht";
  if (/final|ended|finished|over|הסתיים|נגמר/i.test(status)) return "final";
  if (isFinalResultEvent(event)) return "final";
  if (/live|in.?play|playing|חי|משוחק/i.test(status)) return "live";
  // hasScore alone is NOT enough to call live — many cached/stale feeds have scores but are finished
  // Only call live if statusGroup explicitly signals it (365Scores) or status says so
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
  if (Number(sportId) === WINNER_FOOTBALL_ID && text.includes("1X2") && text.includes("תוצאת סיום")) return 0.98;
  if (Number(sportId) === WINNER_BASKETBALL_ID && (text.includes("המנצח") || text.includes("מנצח") || text.includes("מנצחת"))) return 0.97;
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

function marketTier(title, sportId) {
  const clean = cleanText(title);
  if (Number(sportId) === WINNER_FOOTBALL_ID && clean.includes("1X2") && clean.includes("תוצאת סיום")) return "primary";
  if (Number(sportId) === WINNER_BASKETBALL_ID && (clean.includes("המנצח") || clean.includes("מנצח") || clean.includes("מנצחת"))) return "primary";
  if (Number(sportId) === WINNER_BASKETBALL_ID && clean.includes("הימור יתרון")) return "spread";
  if (clean.includes("סיכוי כפול")) return "alternative-double-chance";
  if (clean.includes("מעל/מתחת")) return "alternative-total";
  return "alternative";
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
  if (Number(market.sId) === WINNER_FOOTBALL_ID) {
    const primary = title.includes("1X2") && title.includes("תוצאת סיום");
    const doubleChance = title.includes("סיכוי כפול") || title.includes("Double Chance");
    const overUnder = title.includes("מעל/מתחת") && !title.includes("מחצית");
    return primary || doubleChance || overUnder;
  }
  if (Number(market.sId) === WINNER_BASKETBALL_ID) {
    // Accept any "winner / moneyline" style basketball market
    const isWinner = title.includes("המנצח") || title.includes("מנצח") || title.includes("מנצחת");
    const isFullGameSpread =
      title.includes("הימור יתרון") &&
      (title.includes("כולל הארכות") || title.includes("ללא הארכות"));
    const isMoneyline = title.includes("1X2") && !title.includes("מחצית");
    return isWinner || isFullGameSpread || isMoneyline;
  }
  return false;
}

function scoreOutcome(market, outcome) {
  const odds = decimal(outcome.price);
  if (!odds || odds <= ODDS_MIN || odds >= ODDS_MAX) return null;
  const oddsBook = marketOddsBook(market);
  const reliability = marketReliability(market.mp, market.sId);
  const implied = 1 / odds;
  const desc = cleanText(outcome.desc);
  const isOverUnder = cleanText(market.mp).includes("מעל/מתחת");
  const pickTeam = isOverUnder
    ? (desc.includes("מעל") ? "מעל" : desc.includes("מתחת") ? "מתחת" : outcomeTeam(desc))
    : outcomeTeam(desc);
  const spread = isOverUnder ? parseOverUnderLine(desc) : parseSpread(desc);
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

function describeOverUnderPick(market, scored) {
  const dir = scored.pickTeam || (cleanText(scored.pick).includes("מעל") ? "מעל" : "מתחת");
  const opposite = dir === "מעל" ? "מתחת" : "מעל";
  const line = scored.spread;
  const lineText = line != null ? `${line} גולים` : "גולים";
  const impliedPct = Math.round((scored.normalizedProbability || 0) * 100);
  const odds = scored.odds ? scored.odds.toFixed(2) : "?";
  const opponentOutcome = scored.oddsBook?.outcomes?.find((o) => {
    const d = cleanText(o.team || o.desc);
    return dir === "מעל" ? d.includes("מתחת") : d.includes("מעל");
  });
  const oppOdds = opponentOutcome?.odds;
  const oppPct = opponentOutcome?.noVigProbability ? Math.round(opponentOutcome.noVigProbability * 100) : null;
  let parts = [
    `שוק מעל/מתחת ${lineText}: Winner מתמחר "${dir}" ב-${odds} — הסתברות מנוכת מרווח של ${impliedPct}%.`,
  ];
  if (oppOdds && oppPct) {
    const gap = impliedPct - oppPct;
    parts.push(`"${opposite}" מתומחר ב-${oppOdds.toFixed(2)} (${oppPct}%) — האלגוריתם בחר "${dir}" בפער של ${gap} נקודות אחוז.`);
  }
  if (line != null) {
    if (line <= 2.5) {
      parts.push(`קו ${line} גולים הוא נפוץ בכדורגל אירופאי (ממוצע הלשכות ~2.6 גולים למשחק). ${dir === "מעל" ? "הבחירה מניחה שהמשחק יהיה פתוח." : "הבחירה מניחה שהמשחק יהיה כבד הגנתית."}`);
    } else {
      parts.push(`קו ${line} גולים — קו גבוה, מתאים למשחקים התקפיים. ${dir === "מעל" ? "הבחירה מניחה לפחות " + Math.ceil(line) + " גולים." : "הבחירה מניחה משחק צמוד ומועט גולים."}`);
    }
  }
  parts.push(`האלגוריתם מבוסס על סיגנל שוק Winner: כשהצד "${dir}" מתומחר בטווח 1.40–1.90 ומשקף הסתברות גבוהה לאחר ניכוי מרווח הבית, הוא נכנס להמלצה.`);
  return parts.join(" ");
}

function describeWinnerPick(market, scored, teams) {
  if (cleanText(market.mp).includes("מעל/מתחת")) return describeOverUnderPick(market, scored);
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

const BOARD_PICK_LIMIT = 60;
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
  return Boolean(asset?.logo);
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
    Number(row.marketGap || 0) >= 0.06 ||
    Number(info.oddsGap || 0) >= 0.25 ||
    Number(row.normalizedProbability || 0) >= 0.55
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
  const proximityBonus = Number(row.proximityBonus || 0);
  const extremeSpreadPenalty = Number(row.sportId) === WINNER_BASKETBALL_ID && Number.isFinite(spread) && Math.abs(spread) > 12
    ? 18
    : 0;
  const tooLowOddsPenalty = odds <= 1.42 && marketGap < 0.08 ? 10 : 0;
  const components = {
    hitProbability: Math.round(hit * 72),
    oddsValue: Math.round(oddsQuality * 18),
    marketGap: Math.round(marketGap * 34),
    reliability: Math.round(reliability * 10),
    niche: central ? 0 : -8,
    clearFavorite: clearFavorite ? 18 : -30,
    proximity: proximityBonus,
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
      proximity: "קרבה לפתיחה",
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
  if (!hasSingleClearFavorite(row)) reasons.push("אין פייבוריטית אחת מספיק ברורה");
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
        const bestDesc = cleanText(best.outcome.desc);
        const isOverUnderFallback = cleanText(market.mp).includes("מעל/מתחת");
        const pickTeam = isOverUnderFallback
          ? (bestDesc.includes("מעל") ? "מעל" : bestDesc.includes("מתחת") ? "מתחת" : outcomeTeam(bestDesc))
          : outcomeTeam(bestDesc);
        const spread = isOverUnderFallback ? parseOverUnderLine(bestDesc) : parseSpread(bestDesc);
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
    const kickMs = kickoffMs(dateKey, market.m_hour);
    const hoursToKickoff = Number.isFinite(kickMs) ? (kickMs - Date.now()) / 3600000 : 99;
    const proximityBonus = hoursToKickoff >= 0 && hoursToKickoff <= 2 ? 8 : hoursToKickoff >= 0 && hoursToKickoff <= 6 ? 4 : 0;
    const fairOdds = scored.normalizedProbability > 0 ? 1 / scored.normalizedProbability : null;
    const valueIndicator = fairOdds && scored.odds && scored.odds > fairOdds * 1.03 ? "winner_higher" : null;
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
      marketTier: marketTier(market.mp, market.sId),
      isAlternativeMarket: marketTier(market.mp, market.sId).startsWith("alternative"),
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
      globalAverageOdds: null,
      valueIndicator,
      fairOdds,
      proximityBonus,
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
      recommendationScore: Math.max(1, Math.min(100, recommendationRank(row))),
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
        score: Math.max(1, Math.min(100, sc)),
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
      const verifiedAt = new Date().toISOString();
      const markets = event.markets || [];
      const market = markets.find((m) => cleanText(m.title).includes("1X2")) ||
        markets.find((m) => cleanText(m.title).includes("המנצח") || cleanText(m.title).includes("מנצח") || cleanText(m.title).includes("מנצחת"));
      if (!market) return null;
      const actualWinnerRaw = cleanText((market.marketResults || [])[0]);
      const actualWinner = actualWinnerRaw.toLowerCase() === "x" ? "תיקו" : actualWinnerRaw;
      const finishedAt = event.closedAt || event.finishedAt || (actualWinner ? verifiedAt : null);
      const teams = { home: cleanText(event.teamA), away: cleanText(event.teamB) };
      const _resultScore = scoreText(event.scoreA, event.scoreB, event.noScoreLabel);
      return {
        id: `result-${event.eventid}`,
        eventId: String(event.eventid),
        source: "Winner Results",
        verifiedAt,
        finishedAt,
        bettingStatus: "closed",
        resultVerified: !!actualWinner,
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
        liveScore: _resultScore,
        matchPhase: actualWinner ? "final" : resultPhase(event),
        result: _resultScore,
        resultVerifiedAt: actualWinner ? verifiedAt : "",
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
        statusGroup: game.statusGroup,
        isFinal,
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
      const phase = resultPhase(event);
      const verifiedAt = new Date().toISOString();
      const finishedAt = event.closedAt || event.finishedAt || (phase === "final" ? verifiedAt : null);
      const teams = { home: cleanText(event.teamA), away: cleanText(event.teamB) };
      return {
        id: `result-${event.eventid}`,
        eventId: String(event.eventid),
        eventId365: event.eventid365 || String(event.eventid).replace(/^365-/, ""),
        source: "365Scores Results",
        verifiedAt,
        finishedAt,
        bettingStatus: "closed",
        resultVerified: !!actualWinner,
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
        status: phase === "final" ? "נסגר" : phase === "cancelled" ? "בוטל" : phase === "postponed" ? "לא אומת" : "ממתין",
        liveScore: scoreText(event.scoreA, event.scoreB, event.noScoreLabel),
        matchPhase: actualWinner ? "final" : resultPhase(event),
        result: scoreText(event.scoreA, event.scoreB, event.noScoreLabel),
        resultVerifiedAt: phase === "final" ? verifiedAt : "",
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
    football:   rows.filter((row) => Number(row.sportId) === WINNER_FOOTBALL_ID),
    basketball: rows.filter((row) => Number(row.sportId) === WINNER_BASKETBALL_ID),
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
  const sorted = (rows || [])
    .filter((row) => row.recommended && row.odds)
    .sort((a, b) => {
      return (b.recommendationScore || 0) - (a.recommendationScore || 0)
        || (b.probability || 0) - (a.probability || 0)
        || (b.odds || 0) - (a.odds || 0)
        || String(a.time).localeCompare(String(b.time));
    });
  const strict = sorted.filter((row) => rejectionReasons(row).length === 0);
  const strictIds = new Set(strict.map((row) => row.id));
  const logoFill = sorted
    .filter((row) => !strictIds.has(row.id))
    .filter((row) => {
      const hardReasons = rejectionReasons(row).filter((reason) => !reason.includes("לוגו"));
      return hardReasons.length === 0;
    });
  return [...strict, ...logoFill]
    .slice(0, TARGET_PICKS_PER_SPORT)
    .map((row) => ({
      ...row,
      logoVerified: hasVerifiedTeamLogos(row),
    }));
}

function finalOpenRowsByDay(rows) {
  // Build each sport independently, then keep the daily board capped at 20 total.
  // The frontend still renders football and basketball as separate sections.
  const football   = (rows || []).filter((r) => Number(r.sportId) === WINNER_FOOTBALL_ID);
  const basketball = (rows || []).filter((r) => Number(r.sportId) === WINNER_BASKETBALL_ID);
  return [
    ...finalOpenRows(football),
    ...finalOpenRows(basketball),
  ].sort((a, b) => {
    return (b.recommendationScore || 0) - (a.recommendationScore || 0)
      || (b.probability || 0) - (a.probability || 0)
      || (b.odds || 0) - (a.odds || 0)
      || String(a.time).localeCompare(String(b.time));
  }).slice(0, TARGET_PICKS_PER_SPORT);
}

function finalResultRowsByDay(rows) {
  // Process each sport separately so basketball gets its own quota
  function resultRowsForSport(sportRows) {
    const sorted = (sportRows || [])
      .sort((a, b) => {
        const sourceA = a.source === "Winner Results" ? 1 : 0;
        const sourceB = b.source === "Winner Results" ? 1 : 0;
        return sourceB - sourceA ||
          String(b.time || "").localeCompare(String(a.time || "")) ||
          String(a.match || "").localeCompare(String(b.match || ""));
      });
    const strict = sorted.filter((row) => hasVerifiedTeamLogos(row));
    const strictIds = new Set(strict.map((row) => row.id));
    return [...strict, ...sorted.filter((row) => !strictIds.has(row.id))]
      .slice(0, TARGET_PICKS_PER_SPORT)
      .map((row) => ({ ...row, logoVerified: hasVerifiedTeamLogos(row) }));
  }
  const football   = (rows || []).filter((r) => Number(r.sportId) === WINNER_FOOTBALL_ID);
  const basketball = (rows || []).filter((r) => Number(r.sportId) === WINNER_BASKETBALL_ID);
  return [
    ...resultRowsForSport(football),
    ...resultRowsForSport(basketball),
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
  const todayCurrentRows = [
    ...buildCurrentPicks(markets, today, BOARD_PICK_LIMIT, resultsByEvent, WINNER_FOOTBALL_ID),
    ...buildCurrentPicks(markets, today, BOARD_PICK_LIMIT, resultsByEvent, WINNER_BASKETBALL_ID),
  ];
  const tomorrowCurrentRows = [
    ...buildCurrentPicks(markets, tomorrow, BOARD_PICK_LIMIT, resultsByEvent, WINNER_FOOTBALL_ID),
    ...buildCurrentPicks(markets, tomorrow, BOARD_PICK_LIMIT, resultsByEvent, WINNER_BASKETBALL_ID),
  ];
  // Enrich all three days in parallel — was sequential (3x slower)
  const [yesterdayEnrichedRows, todayEnrichedRows, tomorrowEnrichedRows] = withLogos
    ? await Promise.all([
        enrichLogos(yesterdayMerged),
        enrichLogos(todayCurrentRows),
        enrichLogos(tomorrowCurrentRows),
      ])
    : [yesterdayMerged, todayCurrentRows, tomorrowCurrentRows];
  const yesterdayFinalRows = withLogos ? finalResultRowsByDay(yesterdayEnrichedRows) : yesterdayEnrichedRows.slice(0, TARGET_PICKS_PER_SPORT);
  const yesterdayRows = splitBySport(yesterdayFinalRows);
  const todayFinalRows = withLogos ? finalOpenRowsByDay(todayEnrichedRows) : todayEnrichedRows.slice(0, TARGET_PICKS_PER_SPORT);
  const todayRows = splitBySport(todayFinalRows);
  const tomorrowFinalRows = withLogos ? finalOpenRowsByDay(tomorrowEnrichedRows) : tomorrowEnrichedRows.slice(0, TARGET_PICKS_PER_SPORT);
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
    total: {
      yesterday: yesterdayFinalRows.length,
      today: todayFinalRows.length,
      tomorrow: tomorrowFinalRows.length,
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
        "שוקי בסיס: 1X2 בכדורגל, מנצחת/ליין יתרון בכדורסל מכל הליגות שמופיעות ב-Winner. בימים חלשים נכנסים שווקים חלופיים מסומנים בלבד.",
        `${TARGET_PICKS_PER_SPORT} המלצות ביום — יחס Winner אמיתי בטווח 1.40-1.90; אם יחס יוצא מהטווח או השוק לא זמין, המשחק לא נכנס לטופ.`,
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
      `אתמול/היום/מחר: עד ${TARGET_PICKS_PER_SPORT} המלצות ביום עם יחס Winner בטווח 1.40-1.90; כדורגל וכדורסל מופרדים בתצוגה.`,
      "אם בווינר יש פחות מ-20 משחקי בסיס בטווח, האלגוריתם מוסיף סיכוי כפול או מעל/מתחת רק כשהיחס עדיין בטווח ומסמן זאת כשוק חלופי.",
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

async function buildCachedWinnerFeedPayload({ force = false } = {}) {
  const key = cacheKeyForToday();
  const cached = await kvGet(key);
  // Fresh hit — serve immediately
  if (!force && isFreshCache(cached, CACHE_TTL_MS.full)) {
    return {
      ...cached.payload,
      cache: { status: "hit", key, cachedAt: cached.cachedAt, ttlMs: CACHE_TTL_MS.full },
    };
  }
  // Stale but recent (< 20 min): serve immediately, let CDN stale-while-revalidate
  // trigger the background rebuild on the next CDN revalidation cycle.
  const staleAgeMs = cached?.cachedAt ? Date.now() - Number(cached.cachedAt) : Infinity;
  if (!force && cached?.payload && staleAgeMs < 20 * 60 * 1000) {
    return {
      ...cached.payload,
      stale: true,
      cache: { status: "stale-recent", key, cachedAt: cached.cachedAt, staleAgeMs },
    };
  }
  // Cache missing or very stale: full rebuild
  let payload;
  try {
    payload = await buildWinnerFeedPayload({ withLogos: true });
  } catch (error) {
    payload = {
      ...normalizeFallbackRows(SNAPSHOT),
      ok: true,
      fallback: true,
      fallbackReason: "טעינת Winner נכשלה, לכן נשמר snapshot מאומת כ-cache שרת.",
      liveError: error.message,
    };
  }
  const entry = { cachedAt: Date.now(), payload };
  await kvSet(key, entry, 2 * 60 * 60);
  return {
    ...payload,
    cache: { status: "refresh", key, cachedAt: entry.cachedAt, ttlMs: CACHE_TTL_MS.full },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=86400");
  try {
    const force = String(req?.query?.force || "").toLowerCase() === "1";
    const payload = await buildCachedWinnerFeedPayload({ force });
    res.status(200).json(payload);
  } catch (error) {
    try {
      const cached = await kvGet(cacheKeyForToday());
      if (cached?.payload) {
        res.status(200).json({
          ...cached.payload,
          ok: true,
          fallback: true,
          fallbackReason: "טעינת Winner נכשלה, לכן נטען cache שרת אחרון.",
          liveError: error.message,
          cache: { status: "stale", key: cacheKeyForToday(), cachedAt: cached.cachedAt },
        });
        return;
      }
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
module.exports.buildCachedWinnerFeedPayload = buildCachedWinnerFeedPayload;
module.exports.TARGET_PICKS_PER_SPORT = TARGET_PICKS_PER_SPORT;
