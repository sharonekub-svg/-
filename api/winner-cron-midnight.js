const { buildCachedWinnerFeedPayload } = require("./winner-feed");

function israelTimeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

module.exports = async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers["x-cron-secret"] || req.query?.secret || "";
  if (expected && provided !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized cron request" });
    return;
  }

  const now = israelTimeParts();
  if (now.hour !== "00") {
    res.status(200).json({ ok: true, skipped: true, reason: "Not midnight in Asia/Jerusalem", now });
    return;
  }

  try {
    const payload = await buildCachedWinnerFeedPayload({ force: true });
    res.status(200).json({
      ok: true,
      mode: "midnight-rotation",
      refreshedAt: new Date().toISOString(),
      generatedAt: payload.generatedAt,
      lineStats: payload.lineStats,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "Midnight Winner refresh failed", detail: error.message });
  }
};
