// /api/logo?q=<Hebrew or English team name>&type=team|league
// Returns a 302 redirect to the real badge image.
// Vercel CDN caches the redirect for 30 days — the Lambda runs once per unique name.

const TIMEOUT_MS = 5000;

function sig(ms) {
  return AbortSignal.timeout(ms);
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
      ...headers,
    },
    signal: sig(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Source 1: SofaScore ───────────────────────────────────────────────────────
// Accepts any language including Hebrew. Returns team IDs for CDN logo URLs.
async function trySofaScore(name, type) {
  const entityType = type === "league" ? "uniqueTournament" : "team";
  const data = await getJson(
    `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(name)}&page=0`,
    { Referer: "https://www.sofascore.com/", Origin: "https://www.sofascore.com" }
  ).catch(() => null);
  if (!data) return null;

  const hit = (data.results || []).find(r => r.type === entityType);
  const id = hit?.entity?.id;
  if (!id) return null;

  return type === "league"
    ? `https://api.sofascore.com/api/v1/unique-tournament/${id}/image`
    : `https://api.sofascore.com/api/v1/team/${id}/image`;
}

// ── Source 2: Wikidata P154 + TheSportsDB ─────────────────────────────────────
// Wikidata Hebrew search → entity → P154 (official logo property).
// If no P154, use the English label to query TheSportsDB strBadge.
async function tryWikidataThenSportsDB(name, type) {
  // Step 1 — Wikidata search in Hebrew
  const srData = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=he&format=json&limit=5&search=${encodeURIComponent(name)}`
  ).catch(() => null);
  if (!srData) return null;

  const candidates = srData.search || [];
  // Prefer candidates whose description mentions sport/club
  const id = (
    candidates.find(c => /club|football|soccer|basketball|sport|קבוצת/i.test(c.description || "")) ||
    candidates[0]
  )?.id;
  if (!id) return null;

  // Step 2 — Fetch entity data
  const entData = await getJson(
    `https://www.wikidata.org/wiki/Special:EntityData/${id}.json`
  ).catch(() => null);
  const entity = entData?.entities?.[id];
  if (!entity) return null;

  // P154 = "logo image" property — always an official badge, never a photo
  const logoFile = entity.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
  if (logoFile) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logoFile)}?width=200`;
  }

  // Step 3 — English label → TheSportsDB strBadge
  const englishName = entity.labels?.en?.value;
  if (!englishName) return null;

  const endpoint = type === "league" ? "search_all_leagues.php?l" : "searchteams.php?t";
  const sdbData = await getJson(
    `https://www.thesportsdb.com/api/v1/json/3/${endpoint}=${encodeURIComponent(englishName)}`
  ).catch(() => null);

  const items = sdbData?.teams || sdbData?.countries || sdbData?.leagues || [];
  if (!items.length) return null;
  const enLower = englishName.toLowerCase();
  const match = items.find(t => (t.strTeam || t.strLeague || "").toLowerCase() === enLower) || items[0];
  return match?.strBadge || match?.strLogo || null;
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = String(req.query?.q || "").trim();
  const type = req.query?.type === "league" ? "league" : "team";

  if (!q) {
    res.status(400).end();
    return;
  }

  // CDN: cache successful redirects for 30 days, serve stale for 90 days.
  // 404s are not cached so they'll retry.
  try {
    // Run SofaScore and Wikidata/SportsDB in parallel — return whichever finishes first with a result
    const [sofaResult, wdResult] = await Promise.allSettled([
      trySofaScore(q, type),
      tryWikidataThenSportsDB(q, type),
    ]);

    const logoUrl =
      (sofaResult.status === "fulfilled" && sofaResult.value) ||
      (wdResult.status === "fulfilled" && wdResult.value) ||
      null;

    if (logoUrl) {
      res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=7776000");
      res.redirect(302, logoUrl);
    } else {
      res.status(404).end();
    }
  } catch (err) {
    console.error("logo API error:", err.message);
    res.status(500).end();
  }
};
