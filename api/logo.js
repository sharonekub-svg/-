// /api/logo?q=<Hebrew or English team name>&type=team|league
// Returns a 302 redirect to the real badge image.
// Vercel CDN caches successful redirects for 30 days.

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "HapogeaLogoBot/2.0 (https://github.com/sharonekub-svg/hapogea)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Source A: Wikipedia Hebrew → Wikidata P154 → TheSportsDB ────────────────
// 1. Hebrew Wikipedia search returns: page title, wikibase_item ID, English langlink
// 2. wbgetentities (compact) checks P154 (official logo property)
// 3. If no P154, TheSportsDB strBadge via English name
async function tryWikipediaChain(name, type) {
  // Step 1 — Hebrew Wikipedia search (fast, reliable, returns English name in one call)
  const srUrl =
    `https://he.wikipedia.org/w/api.php?action=query` +
    `&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=5` +
    `&prop=pageprops|langlinks&ppprop=wikibase_item&lllang=en&format=json`;
  const srData = await getJson(srUrl).catch(() => null);
  if (!srData) return null;

  const pages = Object.values(srData.query?.pages || {});
  if (!pages.length) return null;

  // Prefer a page whose title contains a sport-related keyword
  const page =
    pages.find(p => /football|soccer|basketball|f\.c\.|b\.c\.|קבוצת|כדורסל/i.test(p.title || "")) ||
    pages[0];

  const wdId = page.pageprops?.wikibase_item;            // e.g. "Q1523607"
  const enTitle = page.langlinks?.[0]?.["*"] || null;   // e.g. "Liverpool F.C."

  // Step 2 — Wikidata P154 via wbgetentities (returns only claims, NOT the full EntityData blob)
  if (wdId) {
    const wdUrl =
      `https://www.wikidata.org/w/api.php?action=wbgetentities` +
      `&ids=${wdId}&props=claims&format=json`;
    const wdData = await getJson(wdUrl).catch(() => null);
    const claims = wdData?.entities?.[wdId]?.claims || {};
    const logoFile = claims.P154?.[0]?.mainsnak?.datavalue?.value;
    if (logoFile) {
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logoFile)}?width=200`;
    }
  }

  // Step 3 — TheSportsDB with English name (strBadge = official transparent crest)
  if (enTitle) {
    const param = type === "league" ? `l=${encodeURIComponent(enTitle)}` : `t=${encodeURIComponent(enTitle)}`;
    const endpoint = type === "league" ? "search_all_leagues.php" : "searchteams.php";
    const sdbData = await getJson(
      `https://www.thesportsdb.com/api/v1/json/3/${endpoint}?${param}`
    ).catch(() => null);
    const items = sdbData?.teams || sdbData?.leagues || [];
    if (items.length) {
      const badge = items[0]?.strBadge || items[0]?.strLogo;
      if (badge) return badge;
    }
  }

  return null;
}

// ── Source B: English Wikipedia search (fallback when Hebrew page not found) ──
// Transliterations like "Liverpool" or "Brentford" may come in as-is.
async function tryEnglishWikipediaChain(name, type) {
  const srUrl =
    `https://en.wikipedia.org/w/api.php?action=query` +
    `&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=3` +
    `&prop=pageprops&ppprop=wikibase_item&format=json`;
  const srData = await getJson(srUrl).catch(() => null);
  const pages = Object.values(srData?.query?.pages || {});
  if (!pages.length) return null;

  const page = pages.find(p => /football|soccer|basketball|f\.c\.|b\.c\.|sport/i.test(p.title || "")) || pages[0];
  const wdId = page?.pageprops?.wikibase_item;
  if (!wdId) return null;

  const wdUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wdId}&props=claims&format=json`;
  const wdData = await getJson(wdUrl).catch(() => null);
  const claims = wdData?.entities?.[wdId]?.claims || {};
  const logoFile = claims.P154?.[0]?.mainsnak?.datavalue?.value;
  if (logoFile) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logoFile)}?width=200`;
  }

  // TheSportsDB with the English page title
  const param = type === "league" ? `l=${encodeURIComponent(page.title)}` : `t=${encodeURIComponent(page.title)}`;
  const endpoint = type === "league" ? "search_all_leagues.php" : "searchteams.php";
  const sdbData = await getJson(
    `https://www.thesportsdb.com/api/v1/json/3/${endpoint}?${param}`
  ).catch(() => null);
  const items = sdbData?.teams || sdbData?.leagues || [];
  return items[0]?.strBadge || items[0]?.strLogo || null;
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const q = String(req.query?.q || "").trim();
  const type = req.query?.type === "league" ? "league" : "team";

  if (!q) { res.status(400).end(); return; }

  try {
    // Run Hebrew and English chains in parallel — first non-null result wins
    const logoUrl = await Promise.any([
      tryWikipediaChain(q, type).then(u => { if (!u) throw 0; return u; }),
      tryEnglishWikipediaChain(q, type).then(u => { if (!u) throw 0; return u; }),
    ]).catch(() => null);

    if (logoUrl) {
      // Cache 30 days on CDN, serve stale for 90 — Lambda runs once per unique name
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
