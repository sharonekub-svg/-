/**
 * Pull live Winner line and refresh api/winner-snapshot.json for Vercel fallback.
 * Run from repo root: node scripts/refresh-winner-snapshot.js
 */
const fs = require("fs");
const path = require("path");

const { buildWinnerFeedPayload } = require("../api/winner-feed");

function countRecommendations(rows = []) {
  return rows.filter((row) => row.recommended || (row.odds && !row.outsideRange)).length;
}

function summarize(payload) {
  const lines = [`generatedAt=${payload.generatedAt}`, `serverVersion=${payload.serverVersion}`];
  for (const day of ["yesterday", "today", "tomorrow"]) {
    const tab = payload.tabs?.[day];
    for (const sport of ["football", "basketball"]) {
      const rows = tab?.sports?.[sport] || [];
      lines.push(`${day}.${sport}: rows=${rows.length}, recommended=${countRecommendations(rows)}`);
    }
  }
  return lines.join("\n");
}

async function main() {
  console.log("Fetching Winner line...");
  const payload = await buildWinnerFeedPayload({ withLogos: true });
  const outPath = path.join(__dirname, "..", "api", "winner-snapshot.json");
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log("Wrote", outPath);
  console.log(summarize(payload));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
