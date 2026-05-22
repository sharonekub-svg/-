/**
 * Vercel Serverless Function — POST /api/update-odds
 * Called by Vercel Cron every 30 minutes (see vercel.json).
 * Also called manually by the admin "רענן יחסים" button via the browser.
 *
 * Accepts: { tips: TipObject[] }  (pending tips whose odds need refreshing)
 * Returns: { ok: true, updatedAt: timestamp, odds: { [tipId]: { currentOdds, o1, oX, o2 } }, log: LogObject }
 *
 * NOTE: Winner.co.il does not publish an official third-party API.
 * Odds are estimated via Claude AI based on its knowledge of current Winner markets.
 * Always verify actual odds at winner.co.il before placing a bet.
 */

export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  // Cron ping (GET) — just return current timestamp as health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({
      ok: true, ts: Date.now(),
      message: "Cron endpoint live. POST with { tips } to refresh odds.",
      disclaimer: "Odds sourced via AI — verify at winner.co.il before betting.",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const tips = (body.tips || []).filter(t => t.status === "pending");

  if (!tips.length) {
    return new Response(JSON.stringify({ ok: true, updatedAt: Date.now(), odds: {}, log: { status: "ok", count: 0 } }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "VITE_ANTHROPIC_API_KEY not set", log: { status: "fail", count: 0 } }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }

  const list = tips.map((t, i) =>
    `${i + 1}. ${t.home} vs ${t.away} | ${t.league} | Pick: ${t.pick} @ ${t.odds}`
  ).join("\n");

  try {
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `Check current Winner.co.il odds for these matches and return updated values.\nIf uncertain about a match, return its original odds unchanged.\nMatches:\n${list}\nReturn JSON only:\n{"odds":[{"index":1,"currentOdds":"1.72","o1":"1.72","oX":"3.50","o2":"4.20","available":true}]}`,
        }],
      }),
    });

    const aiData = await aiResp.json();
    const txt = (aiData.content || []).find(b => b.type === "text")?.text || "";
    const { odds } = JSON.parse(txt.replace(/```json|```/g, "").trim());

    const oddsMap = {};
    odds.forEach(o => {
      const tip = tips[o.index - 1];
      if (tip) oddsMap[tip.id] = { currentOdds: o.currentOdds, o1: o.o1, oX: o.oX, o2: o.o2 };
    });

    return new Response(JSON.stringify({
      ok: true,
      updatedAt: Date.now(),
      odds: oddsMap,
      source: "Claude AI / Winner.co.il",
      disclaimer: "Odds estimated via AI — verify at winner.co.il before betting.",
      log: { status: "ok", count: tips.length, ts: Date.now(), source: "Claude / Winner.co.il" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: err.message,
      log: { status: "fail", count: 0, ts: Date.now(), source: "Claude / Winner.co.il", err: err.message },
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
