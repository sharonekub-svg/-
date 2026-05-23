const { buildCachedWinnerFeedPayload } = require("./winner-feed");

module.exports = async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers["x-cron-secret"] || req.query?.secret || "";
  if (expected && provided !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized cron request" });
    return;
  }

  try {
    const payload = await buildCachedWinnerFeedPayload({ force: true });
    res.status(200).json({
      ok: true,
      refreshedAt: new Date().toISOString(),
      generatedAt: payload.generatedAt,
      cache: payload.cache,
      lineStats: payload.lineStats,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Winner cron refresh failed",
      detail: error.message,
    });
  }
};
