const GROQ_API_KEY = process.env.AI_KEY;
const GROQ_VISION_MODEL = "llama-3.2-11b-vision-preview";
const { buildWinnerFeedPayload } = require("./winner-feed.js");
const { rateLimit, sanitizeInput } = require("./_rate-limit");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  return { mimeType: match[1].toLowerCase(), data: match[2] };
}

function compactWinnerContext(feed) {
  const rows = (feed?.reuvenSchedule || []).slice(0, 60);
  return rows.map((row) => {
    const markets = (row.markets || []).slice(0, 3).map((market) => {
      const outcomes = (market.outcomes || [])
        .filter((o) => o.odds)
        .slice(0, 4)
        .map((o) => `${o.label || o.desc}: ${Number(o.odds).toFixed(2)}`)
        .join(", ");
      return `${market.title}: ${outcomes}`;
    }).join(" | ");
    return `${row.day} ${row.time || ""} | ${row.league} | ${row.match} | ${markets}`;
  }).join("\n");
}

async function callGroqVision({ image, note, winnerContext }) {
  if (!GROQ_API_KEY) {
    return "ניתוח תמונה לא מופעל — מפתח AI_KEY חסר. יש להגדיר אותו ב-Vercel environment variables.";
  }

  const prompt = `אתה אנליסט ספורט וסטטיסטיקה.

משימה:
1. קרא את התמונה. חלץ את כל המשחקים, שווקים, יחסים, והמרה כוללת אם גלויים.
2. השווה כל משחק מזוהה מול נתוני Winner המצורפים אם אפשר.
3. נתח חוזקות, חולשות, ואי-וודאות. אם טקסט לא קריא — ציין זאת בדיוק.
4. דרג את יתרון הסטטיסטי/פרופיל הסיכון מ-1 עד 10.
5. תן שורה תחתונה על איכות סטטיסטית בלבד.

חוקים:
- אל תמציא קבוצות, יחסים, או שווקים שאינם גלויים.
- אל תתן הנחיות הימור — ללא "שים על", "הייתי מהמר", "כדאי להמר".
- אם רגל אחת חלשה — ציין אותה.
- ניתוח ספורטיבי בלבד, לא ייעוץ הימורים.

הערת המשתמש: ${cleanText(note) || "אין הערה."}

נתוני Winner נוכחיים:
${winnerContext || "לא זמין."}`;

  const body = {
    model: GROQ_VISION_MODEL,
    max_tokens: 1400,
    temperature: 0.55,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } },
        { type: "text", text: prompt },
      ],
    }],
  };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq Vision ${res.status}: ${text.slice(0, 220)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "לא התקבלה תשובה מהניתוח.";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  if (rateLimit(req, res, { max: 5, windowMs: 60_000 })) return;

  const image = parseDataUrl(req.body?.image);
  const note = sanitizeInput(req.body?.note, 500);
  if (!image) {
    res.status(400).json({ ok: false, answer: "לא הצלחתי לקרוא את קובץ התמונה. תעלה PNG/JPG/WebP ברור של הטופס." });
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
    const answer = await callGroqVision({ image, note, winnerContext });
    res.status(200).json({ ok: true, answer });
  } catch (error) {
    console.error("Reuven slip error:", error);
    res.status(200).json({
      ok: false,
      answer: `לא הצלחתי לנתח את התמונה כרגע: ${error.message}. תעתיק לי את המשחקים והנתונים בטקסט ואני אנתח אותם.`,
    });
  }
};
