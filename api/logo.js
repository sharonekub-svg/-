// /api/logo?q=<team or league name>&type=team|league
// Main resilient logo resolver. It never returns a broken image:
// 1. 365Scores search
// 2. SofaScore search
// 3. Wikidata official logo (P154/P18)
// 4. Wikipedia/TheSportsDB via English label
// 5. Dynamic SVG badge fallback

const logoCache = globalThis.__HAPOGEA_LOGO_API_CACHE__ || (globalThis.__HAPOGEA_LOGO_API_CACHE__ = new Map());

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(מכבי|הפועל|בני|עירוני|ביתר|אל|fc|f\.c|cf|bc|bk|club|women|woman|basketball|basket|sc|ac|cd|de|la|the)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return normalizeName(value).split(" ").filter((token) => token.length >= 2);
}

function similarity(a, b) {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function bestNamedCandidate(query, rows, getName, minScore = 0.55) {
  return (rows || [])
    .map((row) => ({ row, score: similarity(query, getName(row)) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)[0]?.row || null;
}

function initials(value) {
  const parts = cleanText(value).split(/\s+/).filter(Boolean);
  const first = parts.slice(0, 2).map((part) => [...part][0]).join("");
  return (first || "?").toUpperCase();
}

function fallbackSvg(name, type) {
  const text = cleanText(name) || "Team";
  const abbr = initials(text);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const hue2 = (hue + 42) % 360;
  const bg = `hsl(${hue}, 66%, 30%)`;
  const bg2 = `hsl(${hue2}, 76%, 46%)`;
  const accent = type === "league" ? "#55d6ff" : "#31d187";
  const shape = type === "league"
    ? `<circle cx="48" cy="48" r="42" fill="url(#g)"/><circle cx="48" cy="48" r="32" fill="none" stroke="${accent}" stroke-width="4"/>`
    : `<path d="M48 6 82 20v30c0 22-14 34-34 40-20-6-34-18-34-40V20z" fill="url(#g)"/><path d="M48 13 75 24v25c0 17-10 27-27 33-17-6-27-16-27-33V24z" fill="none" stroke="${accent}" stroke-width="4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs><linearGradient id="g" x1="12" y1="8" x2="84" y2="90"><stop stop-color="${bg2}"/><stop offset="1" stop-color="${bg}"/></linearGradient></defs>
    <rect width="96" height="96" rx="22" fill="#0f1519"/>
    ${shape}
    <text x="48" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="27" font-weight="900" fill="#fff">${abbr}</text>
  </svg>`;
}

async function getJson(url, extraHeaders = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HapogeaLogoBot/2.0",
        Accept: "application/json",
        ...extraHeaders,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function try365Scores(name, type) {
  const data = await getJson(
    `https://webws.365scores.com/web/search/?query=${encodeURIComponent(name)}&langId=2`,
    { Origin: "https://www.365scores.com", Referer: "https://www.365scores.com/he/" }
  );
  if (!data) return null;
  const rows = type === "league" ? (data.competitions || []) : (data.competitors || []);
  const row = bestNamedCandidate(name, rows, (item) => item.name || item.nameForURL || "", 0.48);
  if (!row?.id) return null;
  const folder = type === "league" ? "Competitions" : "Competitors";
  return {
    url: `https://imagecache.365scores.com/image/upload/f_png,w_200,h_200,c_limit/${folder}/${row.id}`,
    source: "365Scores",
  };
}

async function trySofaScore(name, type) {
  const data = await getJson(
    `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(name)}&page=0`,
    { Referer: "https://www.sofascore.com/" }
  );
  const target = type === "league" ? "uniqueTournament" : "team";
  const rows = (data?.results || []).filter((item) => item.type === target);
  const row = bestNamedCandidate(name, rows, (item) => item.entity?.name || "", 0.5);
  const id = row?.entity?.id;
  if (!id) return null;
  return {
    url: type === "league"
      ? `https://api.sofascore.com/api/v1/unique-tournament/${id}/image`
      : `https://api.sofascore.com/api/v1/team/${id}/image`,
    source: "SofaScore",
  };
}

async function wikidataEntity(name, lang = "he") {
  const search = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=${lang}&format=json&limit=5&search=${encodeURIComponent(name)}&origin=*`
  );
  const hit = (search?.search || []).find((item) =>
    similarity(name, item.label) >= 0.5 &&
    /club|football|soccer|basketball|sport|team|league|tournament|קבוצ|כדורגל|כדורסל|ליגה/i.test(`${item.description || ""} ${item.label || ""}`)
  ) || bestNamedCandidate(name, search?.search || [], (item) => item.label || "", 0.62);
  if (!hit?.id) return null;
  const entity = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&props=claims|labels&languages=en|he&format=json&origin=*`
  );
  return entity?.entities?.[hit.id] || null;
}

async function tryWikidata(name, type) {
  const entity = await wikidataEntity(name, "he") || await wikidataEntity(name, "en");
  if (!entity) return null;
  const claims = entity.claims || {};
  const image = claims.P154?.[0]?.mainsnak?.datavalue?.value || claims.P18?.[0]?.mainsnak?.datavalue?.value;
  if (image) {
    return {
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=220`,
      source: "Wikidata",
    };
  }
  const englishName = entity.labels?.en?.value;
  if (!englishName) return null;
  return trySportsDb(englishName, type, name);
}

async function trySportsDb(name, type, originalName = name) {
  const endpoint = type === "league" ? "search_all_leagues.php" : "searchteams.php";
  const param = type === "league" ? "l" : "t";
  const data = await getJson(`https://www.thesportsdb.com/api/v1/json/3/${endpoint}?${param}=${encodeURIComponent(name)}`);
  const rows = data?.teams || data?.leagues || [];
  const row = bestNamedCandidate(originalName, rows, (item) => item.strTeam || item.strLeague || "", 0.45) ||
    bestNamedCandidate(name, rows, (item) => item.strTeam || item.strLeague || "", 0.62);
  const logo = row?.strBadge || row?.strLogo;
  return logo ? { url: logo, source: "TheSportsDB" } : null;
}

async function resolveLogo(name, type) {
  const key = `${type}:${normalizeName(name)}`;
  if (logoCache.has(key)) return logoCache.get(key);
  const pending = (async () => {
    const resolvers = [
      () => try365Scores(name, type),
      () => trySofaScore(name, type),
      () => tryWikidata(name, type),
      () => trySportsDb(name, type),
    ];
    for (const resolver of resolvers) {
      const result = await resolver().catch(() => null);
      if (result?.url) return result;
    }
    return null;
  })();
  logoCache.set(key, pending);
  const value = await pending;
  logoCache.set(key, value);
  return value;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const q = cleanText(req.query?.q || "");
  const type = req.query?.type === "league" ? "league" : "team";
  if (!q) {
    res.status(400).send("Missing q");
    return;
  }

  const logo = await resolveLogo(q, type).catch(() => null);
  if (logo?.url) {
    res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=7776000");
    res.setHeader("X-Logo-Source", logo.source || "unknown");
    res.redirect(302, logo.url);
    return;
  }

  const svg = fallbackSvg(q, type);
  res.status(200);
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=7776000");
  res.setHeader("X-Logo-Source", "generated");
  res.send(svg);
};
