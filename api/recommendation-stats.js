const { getRecommendationStats } = require("./recommendation-tracker");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=600");
  try {
    const stats = await getRecommendationStats();
    res.status(200).json(stats);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Daily recommendation stats unavailable",
      detail: error.message,
    });
  }
};
