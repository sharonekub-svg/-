/**
 * Pull live Winner line + refresh api/winner-snapshot.json for Vercel fallback.
 * Run from repo root: node scripts/refresh-winner-snapshot.js
 */
const fs = require("fs");
const path = require("path");

const { buildWinnerFeedPayload } = require("../api/winner-feed");

async function main() {
  console.log("Fetching Winner line (no per-request logos for speed)...");
  const payload = await buildWinnerFeedPayload({ withLogos: false });
  const outPath = path.join(__dirname, "..", "api", "winner-snapshot.json");
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const stats = payload.lineStats || {};
  console.log("Wrote", outPath);
  console.log("Today open picks — football:", stats.football?.today, "basketball:", stats.basketball?.today);
  console.log("Tomorrow open picks — football:", stats.football?.tomorrow, "basketball:", stats.basketball?.tomorrow);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
