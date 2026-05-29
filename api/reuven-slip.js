const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";
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

async function callGeminiVision({ image, note, winnerContext }) {
  if (!GEMINI_API_KEY) {
    return "ניתוח תמונה לא מופעל — מפתח GEMINI_API_KEY חסר. יש להגדיר אותו ב-Vercel environment variables.";
  }

  const prompt = `אתה אנליסט ספורט וסטטיסטיקה.

משימה:
1. קרא את התמונה שהועלתה. חלץ את כל המשחקים, שווקים, יחסים, והמרה כוללת אם גלויים.
2. השווה כל משחק מזוהה מול נתוני Winner המצורפים אם אפשר.
3. נתח את החוזקות, החולשות, אי-הוודאות והקשר השוק. אם טקסט לא קריא — אמור זאת בדיוק.
4. דרג את יתרון הסטטיסטי/פרופיל הסיכון מ-1 עד 10.
5. תן שורה תחתונה ברורה על איכות סטטיסטית בלבד.

חוקים:
- אל תמציא קבוצות, יחסים, נגרים, או שווקים שאינם גלויים בתמונה.
- אל תתן הנחיות להמר — אל תשתמש בביטויים "שים על", "הייתי מהמר", "כדאי להמר".
- אם ליגה/רגל אחת חלשה סטטיסטית — ציין אותה.
- זהו ניתוח ספורטיבי בלבד, לא ייעוץ הימורים.

הערת המשתמש: ${cleanText(note) || "אין הערה."}

נתוני Winner נוכחיים:
${winnerContext || "לא זמין."}`;

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: image.mimeType, data: image.data } },
        { text: prompt },
      ],
    }],
    generationConfig: { maxOutputTokens: 1400, temperature: 0.55 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini Vision ${res.status}: ${text.slice(0, 220)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "לא התקבלה תשובה מהניתוח.";
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  // 5 requests per IP per minute — vision call is heavier
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
    const answer = await callGeminiVision({ image, note, winnerContext });
    res.status(200).json({ ok: true, answer });
  } catch (error) {
    console.error("Reuven slip error:", error);
    res.status(200).json({
      ok: false,
      answer: `לא הצלחתי לנתח את התמונה כרגע: ${error.message}. תעתיק לי את המשחקים והנתונים בטקסט ואני אנתח אותם.`,
    });
  }
};
