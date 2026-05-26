const { buildCachedWinnerFeedPayload } = require("./winner-feed");

// Called by Vercel Cron every day at 06:00 Israel time (03:00 UTC).
// Forces a fresh rebuild so today + tomorrow games are always current.
module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET || "";
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  try {
    const payload = await buildCachedWinnerFeedPayload({ force: true });
    return res.status(200).json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      oddsSource: payload.oddsSource || "Winner",
      today:         payload.tabs?.today?.date,
      tomorrow:      payload.tabs?.tomorrow?.date,
      todayGames:    (payload.tabs?.today?.sports?.football?.length    || 0) + (payload.tabs?.today?.sports?.basketball?.length    || 0),
      tomorrowGames: (payload.tabs?.tomorrow?.sports?.football?.length || 0) + (payload.tabs?.tomorrow?.sports?.basketball?.length || 0),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
