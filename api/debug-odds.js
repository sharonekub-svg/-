const ODDS_API_KEY  = process.env.ODDS_API_KEY || "";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (!ODDS_API_KEY) return res.status(400).json({ error: "no key" });

  function israelDate(offset = 0) {
    const d = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(d);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day}`;
  }

  const today    = israelDate(0);
  const dayPlus5 = israelDate(5);

  // Step 1: discover ALL active sports (1 request)
  const sportsResp = await fetch(`${ODDS_API_BASE}/sports/?apiKey=${ODDS_API_KEY}`);
  const allSports  = await sportsResp.json();
  const soccerKeys = Array.isArray(allSports)
    ? allSports.filter(s => s.key.startsWith("soccer_") && s.active).map(s => s.key)
    : [];

  // Step 2: query each soccer league for today only
  const results = [];
  for (const key of soccerKeys) {
    try {
      const url =
        `${ODDS_API_BASE}/sports/${key}/odds?apiKey=${ODDS_API_KEY}` +
        `&regions=uk,eu,us&markets=h2h&dateFormat=iso&oddsFormat=decimal` +
        `&commenceTimeFrom=${today}T00:00:00Z&commenceTimeTo=${today}T23:59:59Z`;
      const r    = await fetch(url);
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      const events = Array.isArray(data) ? data : [];
      const withOdds = events.filter(e => (e.bookmakers?.length || 0) > 0).length;
      const errMsg   = !Array.isArray(data) && data?.message ? data.message : "";
      if (events.length > 0 || errMsg) {
        const games = events.map(e => {
          const bm = e.bookmakers?.[0];
          const h2h = bm?.markets?.find(m => m.key === "h2h");
          const odds = (h2h?.outcomes || []).map(o => `${o.name}:${o.price}`).join(", ");
          return `${e.home_team} vs ${e.away_team} (${e.commence_time?.slice(11,16)} UTC) [${odds}]`;
        });
        results.push({ sport: key, total: events.length, withOdds, games, errMsg });
      }
    } catch (e) {
      results.push({ sport: key, error: e.message });
    }
    await new Promise(r => setTimeout(r, 100));
  }

  res.status(200).json({
    today,
    totalSoccerLeaguesChecked: soccerKeys.length,
    leaguesWithGamesToday: results.filter(r => r.total > 0).length,
    results,
  });
};
