const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const { buildWinnerFeedPayload } = require("./winner-feed.js");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  return { mediaType: match[1].toLowerCase(), data: match[2] };
}

function compactWinnerContext(feed) {
  const rows = (feed?.reuvenSchedule || []).slice(0, 90);
  return rows.map((row) => {
    const markets = (row.markets || []).slice(0, 4).map((market) => {
      const outcomes = (market.outcomes || [])
        .filter((outcome) => outcome.odds)
        .slice(0, 5)
        .map((outcome) => `${outcome.label || outcome.desc}: ${Number(outcome.odds).toFixed(2)}`)
        .join(", ");
      return `${market.title}: ${outcomes}`;
    }).join(" | ");
    return `${row.day} ${row.time || ""} | ${row.sport} | ${row.league} | ${row.match} | ${markets}`;
  }).join("\n");
}

async function callVision({ image, note, winnerContext }) {
  const prompt = `You are ראובן AI, a sharp sports betting slip analyst.

Task:
1. Read the uploaded betting slip image. Extract all visible selections, games, markets, odds, stake, and total odds if visible.
2. Compare any recognizable games/markets against the provided Winner context when possible.
3. Decide if the slip is good or bad. Do not pretend certainty. If text is unreadable, say exactly what is unreadable.
4. Rate the whole slip from 1 to 10.
5. Give a clear bottom line: whether to place it, avoid it, or reduce/change it.
6. If the user wrote Hebrew, answer Hebrew. If English, answer English. Default Hebrew.

Important:
- Do not invent teams, odds, injuries, or markets that are not visible.
- Winner odds are the bookmaker source. If the image odds differ from current Winner context, mention it.
- For accumulators, be extra strict: one weak leg can make the whole form bad.
- Explain which leg is the weakest and what you would remove or replace.
- This is entertainment/education only, not financial advice.

User note:
${cleanText(note) || "No extra note."}

Current Winner context:
${winnerContext || "Winner context unavailable."}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1400,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: prompt },
        ],
      }],
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vision API ${response.status}: ${text.slice(0, 220)}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || "לא התקבלה תשובה מהניתוח.";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const image = parseDataUrl(req.body?.image);
  const note = cleanText(req.body?.note || "");
  if (!image) {
    res.status(400).json({ ok: false, answer: "לא הצלחתי לקרוא את קובץ התמונה. תעלה PNG/JPG/WebP ברור של הטופס." });
    return;
  }
  if (!ANTHROPIC_API_KEY) {
    res.status(200).json({
      ok: false,
      answer: "קיבלתי את תמונת הטופס, אבל ניתוח תמונה עדיין לא מופעל בשרת כי חסר ANTHROPIC_API_KEY. אני לא אנחש מה כתוב בתמונה. בינתיים תעתיק לי את המשחקים והיחסים מהטופס, ואני אנתח אותם מול Winner.",
    });
    return;
  }

  try {
    let winnerContext = "";
    try {
      const feed = await buildWinnerFeedPayload({ withLogos: false });
      winnerContext = compactWinnerContext(feed);
    } catch (error) {
      winnerContext = `Winner context failed: ${error.message}`;
    }
    const answer = await callVision({ image, note, winnerContext });
    res.status(200).json({ ok: true, answer });
  } catch (error) {
    console.error("Reuven slip error:", error);
    res.status(200).json({
      ok: false,
      answer: `לא הצלחתי לנתח את תמונת הטופס כרגע: ${error.message}. אם זה דחוף, תעתיק לי את המשחקים והיחסים בטקסט ואני אנתח אותם מיד.`,
    });
  }
};
