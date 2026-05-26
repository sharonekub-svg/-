const { buildCachedWinnerFeedPayload } = require("./winner-feed");
const { getRecommendationStats, runRecommendationBot } = require("../lib/recommendation-tracker");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=600");
  try {
    let stats = await getRecommendationStats();
    const shouldSeed = String(req.query?.refresh || "").toLowerCase() === "1" || Number(stats.summary?.total || 0) === 0;
    if (shouldSeed) {
      const feed = await buildCachedWinnerFeedPayload({ force: false });
      await runRecommendationBot(feed);
      stats = await getRecommendationStats();
    }
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Daily recommendation stats unavailable",
      detail: error.message,
    });
  }
};
