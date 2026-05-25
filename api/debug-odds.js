const ODDS_API_KEY  = process.env.ODDS_API_KEY || "";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const ODDS_API_SPORTS = [
  "soccer_conmebol_copa_libertadores",
  "soccer_conmebol_copa_sudamericana",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_uefa_europa_conference_league",
  "soccer_usa_mls",
  "soccer_usa_usl_championship",
  "soccer_canada_premier_league",
  "soccer_brazil_campeonato",
  "soccer_brazil_serie_b",
  "soccer_argentina_primera_division",
  "soccer_chile_primera_division",
  "soccer_colombia_primera_a",
  "soccer_mexico_ligamx",
  "soccer_mexico_ligamx_expansion",
  "soccer_sweden_allsvenskan",
  "soccer_norway_eliteserien",
  "soccer_denmark_superliga",
  "soccer_finland_veikkausliiga",
  "soccer_australia_aleague",
  "soccer_japan_j_league",
  "soccer_south_korea_kleague1",
  "soccer_china_superleague",
  "soccer_israel_premier_league",
  "soccer_turkey_super_league",
  "soccer_greece_super_league",
  "soccer_england_league1",
  "soccer_england_league2",
  "soccer_spain_segunda_division",
  "soccer_italy_serie_b",
  "soccer_germany_bundesliga2",
  "soccer_france_ligue_deux",
  "soccer_netherlands_eerste_divisie",
  "soccer_austria_bundesliga",
  "soccer_poland_ekstraklasa",
  "soccer_portugal_primeira_liga",
  "basketball_nba",
  "basketball_nbl",
  "basketball_euroleague",
];

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

  const tomorrow = israelDate(1);
  const dayPlus4 = israelDate(4);
  const results = [];

  for (const key of ODDS_API_SPORTS) {
    try {
      const url = `${ODDS_API_BASE}/sports/${key}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&dateFormat=iso&oddsFormat=decimal&commenceTimeFrom=${tomorrow}T00:00:00Z&commenceTimeTo=${dayPlus4}T23:59:59Z`;
      const r = await fetch(url);
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      const events = Array.isArray(data) ? data : [];
      const byDate = {};
      for (const e of events) {
        const d = e.commence_time?.slice(0, 10) || "?";
        byDate[d] = (byDate[d] || 0) + 1;
      }
      const sample = events[0] ? `${events[0].home_team} vs ${events[0].away_team}` : "";
      const errMsg = !Array.isArray(data) && data?.message ? data.message : "";
      results.push({ sport: key, status: r.status, total: events.length, byDate, sample, errMsg });
    } catch (e) {
      results.push({ sport: key, error: e.message });
    }
    await new Promise(r => setTimeout(r, 150));
  }

  results.sort((a, b) => (b.total || 0) - (a.total || 0));
  res.status(200).json({ tomorrow, dayPlus4, results });
};
