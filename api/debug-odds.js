const { ODDS_API_KEY, ODDS_API_BASE, ODDS_API_SPORTS } = (() => {
  const KEY  = process.env.ODDS_API_KEY || "";
  const BASE = "https://api.the-odds-api.com/v4";
  const SPORTS = [
    { key: "soccer_usa_mls",                    label: "MLS" },
    { key: "soccer_brazil_campeonato",           label: "ברזיל" },
    { key: "soccer_argentina_primera_division",  label: "ארגנטינה" },
    { key: "soccer_chile_primera_division",      label: "צ'ילה" },
    { key: "soccer_colombia_primera_a",          label: "קולומביה" },
    { key: "soccer_mexico_ligamx",               label: "מקסיקו" },
    { key: "soccer_sweden_allsvenskan",          label: "שבדיה" },
    { key: "soccer_norway_eliteserien",          label: "נורבגיה" },
    { key: "soccer_denmark_superliga",           label: "דנמרק" },
    { key: "soccer_finland_veikkausliiga",       label: "פינלנד" },
    { key: "soccer_japan_j_league",             label: "יפן" },
    { key: "soccer_south_korea_kleague1",        label: "קוריאה" },
    { key: "soccer_australia_aleague",           label: "אוסטרליה" },
    { key: "soccer_israel_premier_league",       label: "ישראל" },
    { key: "soccer_turkey_super_league",         label: "טורקיה" },
    { key: "soccer_greece_super_league",         label: "יוון" },
    { key: "soccer_england_league1",             label: "אנגליה ליג 1" },
    { key: "soccer_england_league2",             label: "אנגליה ליג 2" },
    { key: "soccer_spain_segunda_division",      label: "ספרד סגונדה" },
    { key: "soccer_italy_serie_b",               label: "איטליה ב'" },
    { key: "basketball_nba",                     label: "NBA" },
    { key: "basketball_nbl",                     label: "NBL" },
  ];
  return { ODDS_API_KEY: KEY, ODDS_API_BASE: BASE, ODDS_API_SPORTS: SPORTS };
})();

module.exports = async function handler(req, res) {
  if (!ODDS_API_KEY) return res.status(400).json({ error: "no key" });

  function israelDate(offset = 0) {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + offset);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day}`;
  }

  const tomorrow = israelDate(1);
  const results = [];

  await Promise.allSettled(
    ODDS_API_SPORTS.map(async (sport) => {
      try {
        const url = `${ODDS_API_BASE}/sports/${sport.key}/odds?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&dateFormat=iso&oddsFormat=decimal&commenceTimeFrom=${tomorrow}T00:00:00Z&commenceTimeTo=${tomorrow}T23:59:59Z`;
        const r = await fetch(url);
        const data = await r.json();
        const count = Array.isArray(data) ? data.length : 0;
        const sample = Array.isArray(data) && data[0] ? `${data[0].home_team} vs ${data[0].away_team}` : "";
        results.push({ sport: sport.key, label: sport.label, status: r.status, count, sample });
      } catch (e) {
        results.push({ sport: sport.key, label: sport.label, error: e.message });
      }
    })
  );

  results.sort((a, b) => (b.count || 0) - (a.count || 0));
  res.status(200).json({ tomorrow, results });
};
