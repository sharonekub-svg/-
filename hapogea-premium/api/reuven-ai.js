const https = require('https');

const WINNER_FEED_URL = 'https://hit-alpha.vercel.app/api/winner-feed';
const DISCLAIMER = 'ההמלצה מבוססת על ניתוח סטטיסטי בלבד ואינה מבטיחה זכייה.';

// ── Body parser ──
function readBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined) {
      resolve(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => resolve(raw));
    req.on('error', () => resolve('{}'));
  });
}

// ── HTTP fetch ──
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('JSON parse error: ' + e.message)); }
        });
      })
      .on('error', reject)
      .on('timeout', () => reject(new Error('Request timeout')));
  });
}

// ── Odds helpers ──
function parseOdds(val) {
  if (val == null) return null;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) || n <= 0 ? null : n;
}

function oddsInRange(odds) {
  return odds >= 1.4 && odds <= 1.9;
}

// ── Feed flattener ──
// Handles both { tabs: { today: { sports: { id: [rows] } } } }
// and           { tabs: { today: { sports: { id: { rows: [] } } } } }
function flattenFeed(feed, targetTab) {
  const rows = [];
  const tabs = targetTab ? [targetTab] : ['today', 'tomorrow', 'yesterday'];
  for (const tab of tabs) {
    const tabObj = feed.tabs?.[tab] || feed[tab] || {};
    const sports = tabObj.sports || tabObj;
    if (!sports || typeof sports !== 'object') continue;
    for (const [sportKey, sportVal] of Object.entries(sports)) {
      const sportRows = Array.isArray(sportVal)
        ? sportVal
        : Array.isArray(sportVal?.rows)
          ? sportVal.rows
          : [];
      for (const row of sportRows) {
        if (!row || typeof row !== 'object') continue;
        rows.push({
          ...row,
          _tab: tab,
          _sportId: row.sportId || row.sport_id || sportKey,
        });
      }
    }
  }
  return rows;
}

// ── Match scoring (1–10) ──
function scoreMatch(row) {
  let score = 5.0;

  // Pick odds for scoring (prefer algorithm pick odds over 1X2 min)
  const mainOdds = parseOdds(row.odds);
  const odds1 = parseOdds(row.odds1);
  const oddsX = parseOdds(row.oddsX);
  const odds2 = parseOdds(row.odds2);
  const allOdds = [mainOdds, odds1, oddsX, odds2].filter(Boolean);
  const bestOdds = mainOdds || (allOdds.length ? Math.min(...allOdds) : null);

  if (bestOdds !== null) {
    if (bestOdds >= 1.4 && bestOdds <= 1.6) score += 3.0;
    else if (bestOdds > 1.6 && bestOdds <= 1.9) score += 2.0;
    else if (bestOdds > 1.9 && bestOdds <= 2.3) score += 0.5;
    else if (bestOdds >= 1.2 && bestOdds < 1.4) score += 1.0;
    else if (bestOdds < 1.2) score -= 2.0;
    else score -= 1.5; // > 2.3
  }

  // Algorithm recommendation
  if (row.rec || row.recommended) score += 1.5;

  // Model/confidence score (0–100 → 0–1.5 bonus)
  const modelScore = parseFloat(row.score || row.confidence || row.modelScore || 0);
  if (modelScore > 0) score += Math.min(modelScore / 100, 1.5);

  // Probability bonus
  const prob = parseFloat(row.prob1 || row.prob || row.probability || 0);
  if (prob > 65) score += 0.5;
  else if (prob > 55) score += 0.2;

  // Market gap bonus
  if (parseFloat(row.marketGap || 0) > 5) score += 0.5;

  // Penalties
  if (row.outsideRange) score -= 2.0;

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

// ── Recommend outcome for a row ──
function recommendedOutcome(row) {
  // Prefer the algorithm's own pick
  const pick = row.winnerPick || row.pick || row.pickTeam;
  if (pick && row.odds) {
    const spread = row.spread != null ? ` ${Number(row.spread) > 0 ? '+' : ''}${row.spread}` : '';
    return { label: `${pick}${spread}`, odds: parseOdds(row.odds) };
  }

  // Fall back to 1X2 odds – prefer range 1.40-1.90
  const outcomes = [];
  if (row.odds1) outcomes.push({ label: row.home || '1', odds: parseOdds(row.odds1) });
  if (row.oddsX) outcomes.push({ label: 'תיקו', odds: parseOdds(row.oddsX) });
  if (row.odds2) outcomes.push({ label: row.away || '2', odds: parseOdds(row.odds2) });
  if (!outcomes.length) return null;

  const ideal = outcomes.find((o) => o.odds && oddsInRange(o.odds));
  if (ideal) return ideal;
  return outcomes.sort((a, b) => (a.odds || 99) - (b.odds || 99))[0];
}

// ── Build reason text ──
function buildReason(row, score, rec) {
  const parts = [];
  if (rec?.odds) {
    const o = rec.odds;
    if (o >= 1.4 && o <= 1.9) parts.push(`יחס ${o.toFixed(2)} – טווח אידיאלי`);
    else if (o < 1.4) parts.push(`יחס ${o.toFixed(2)} – מועדף חזק`);
    else if (o <= 2.3) parts.push(`יחס ${o.toFixed(2)} – טווח סביר`);
    else parts.push(`יחס ${o.toFixed(2)} – מחוץ לטווח המועדף`);
  }
  if (row.rec || row.recommended) parts.push('מומלץ על ידי האלגוריתם');
  const prob = parseFloat(row.prob1 || row.prob || 0);
  if (prob > 50) parts.push(`הסתברות ${Math.round(prob)}%`);
  if (score >= 8) parts.push('ציון גבוה מאוד');
  else if (score >= 7) parts.push('ציון גבוה');
  return parts.join(' · ') || 'ניתוח סטטיסטי';
}

// ── Build a card object from a row ──
function buildCard(row, score) {
  const rec = recommendedOutcome(row);
  return {
    home: row.home || '?',
    away: row.away || '?',
    league: row.league || row.competition || '',
    time: row.time || row.kickoff || '',
    sport: row._sportId,
    tab: row._tab,
    recommendation: rec?.label || null,
    recommendedOdds: rec?.odds ? Number(rec.odds.toFixed(2)) : null,
    rating: score,
    reason: buildReason(row, score, rec),
    status: row.status || '',
    isPremium: Boolean(row.isPremium || row.premium),
  };
}

// ── Text normaliser ──
function norm(str) {
  return String(str || '')
    .replace(/["״']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(text) {
  return norm(text).split(/[\s,./;:!?]+/).filter((t) => t.length >= 2);
}

// ── Intent detection ──

const SPORT_MAP = {
  football: [
    'כדורגל', 'פרמייר', 'champions', 'liga', 'laliga', 'בונדסליגה', 'סריה',
    'ליגת העל', 'ברזיל', 'copa', 'uefa', 'euro', 'premier', 'soccer',
    'ligue', 'eredivisie', 'mundial', 'מונדיאל',
  ],
  basketball: [
    'כדורסל', 'nba', 'ncaa', 'euroleague', 'יורוליג', 'אירוליג', 'euroliga',
    'nbl', 'basketball', 'לייקרס', 'lakers', 'celtics', 'warriors', 'bulls',
    'מכבי', 'maccabi', 'hapoel', 'הפועל',
  ],
};

function detectSport(tokens) {
  const joined = tokens.join(' ');
  if (SPORT_MAP.basketball.some((k) => joined.includes(k))) return 'basketball';
  if (SPORT_MAP.football.some((k) => joined.includes(k))) return 'football';
  return null;
}

function detectDate(tokens) {
  const joined = tokens.join(' ');
  if (/אתמול|yesterday/.test(joined)) return 'yesterday';
  if (/מחר|tomorrow/.test(joined)) return 'tomorrow';
  return 'today'; // default (covers היום, הלילה, today, tonight)
}

function detectLimit(tokens) {
  for (const t of tokens) {
    const n = parseInt(t, 10);
    if (!isNaN(n) && n >= 1 && n <= 20) return n;
  }
  return 5;
}

function detectIntent(tokens) {
  const joined = tokens.join(' ');

  const isTopRequest =
    tokens.some((t) =>
      ['טיפים', 'טיפ', 'tips', 'tip', 'המלצות', 'המלצה', 'best', 'top'].includes(t)
    ) ||
    /תן לי|give me|show me|הכי טובים|הכי חזקים/.test(joined);

  const isGeneralQuestion =
    /יש משהו|יש.*היום|יש.*מחר|מה יש|what.*today|what.*tomorrow/.test(joined);

  if (isTopRequest || isGeneralQuestion) return 'top_tips';
  if (tokens.length >= 2) return 'match_query';
  return 'general';
}

// ── Match search ──
function matchScore(row, tokens) {
  const hay = norm(`${row.match || ''} ${row.home || ''} ${row.away || ''} ${row.league || ''}`);
  let hits = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (hay.includes(t)) hits++;
  }
  return hits;
}

// ── Sport filter ──
const SPORT_IDS_BASKETBALL = new Set([3, 227, '3', '227', 'basketball']);
const SPORT_IDS_FOOTBALL = new Set([1, 240, '1', '240', 'football', 'soccer']);

function matchesSport(row, sport) {
  if (!sport) return true;
  const sid = row._sportId;
  const sportStr = norm(row.sport || '');
  if (sport === 'basketball') {
    return (
      SPORT_IDS_BASKETBALL.has(sid) ||
      SPORT_IDS_BASKETBALL.has(String(sid)) ||
      sportStr.includes('כדורסל') ||
      sportStr.includes('basketball')
    );
  }
  if (sport === 'football') {
    return (
      SPORT_IDS_FOOTBALL.has(sid) ||
      SPORT_IDS_FOOTBALL.has(String(sid)) ||
      sportStr.includes('כדורגל') ||
      sportStr.includes('football') ||
      sportStr.includes('soccer')
    );
  }
  return true;
}

// ── Response builder ──
function buildResponse(intent, type, matched, allRows, userType, message, date) {
  const isPremium = userType === 'premium';
  const limit = isPremium ? (intent.limit || 5) : Math.min(intent.limit || 3, 3);
  const sport = intent.sport;
  const sportLabel =
    sport === 'basketball' ? 'כדורסל' :
    sport === 'football'   ? 'כדורגל' : 'ספורט';

  // ── TOP TIPS ──
  if (type === 'top_tips') {
    const pool = allRows
      .filter((r) => matchesSport(r, sport))
      .filter((r) => r.odds || r.odds1 || r.oddsX || r.odds2)
      .map((r) => ({ row: r, score: scoreMatch(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (!pool.length) {
      return {
        answer: `ראובן AI לא מצא משחקים מתאימים ב${sportLabel} ל${date === 'tomorrow' ? 'מחר' : 'היום'}. נסה שוב מאוחר יותר.`,
        matches: [],
        disclaimer: DISCLAIMER,
      };
    }

    const cards = pool.map(({ row, score }) => buildCard(row, score));
    const whenLabel = date === 'tomorrow' ? 'למחר' : date === 'yesterday' ? 'לאתמול' : 'להיום';
    const freeNote = !isPremium && cards.length < limit + 1 ? '' : !isPremium ? ' (פרימיום מציג ניתוח מלא)' : '';
    return {
      answer: `ראובן AI בחר ${cards.length} טיפים מובילים${sport ? ` ב${sportLabel}` : ''} ${whenLabel}${freeNote}:`,
      matches: cards,
      disclaimer: DISCLAIMER,
    };
  }

  // ── MATCH QUERY – matches found ──
  if (type === 'match_query' && matched.length) {
    const top = matched.slice(0, limit);
    const cards = top.map(({ row, score }) => buildCard(row, score));
    const best = cards[0];

    let answer;
    if (best.rating >= 7.5) {
      answer =
        `ראובן AI מצא את המשחק ומנתח אותו.\n\n` +
        `משחק: ${best.home} נגד ${best.away}\n` +
        (best.league ? `ליגה: ${best.league}\n` : '') +
        (best.recommendation ? `המלצה: ${best.recommendation}\n` : '') +
        (best.recommendedOdds ? `יחס: ${best.recommendedOdds}\n` : '') +
        `דירוג ראובן AI: ${best.rating}/10\n\n` +
        `למה?\n${best.reason}`;
    } else if (best.rating >= 5) {
      answer =
        `ראובן AI מצא את המשחק, אבל הוא לא נכנס כהמלצה חזקה.\n\n` +
        `משחק: ${best.home} נגד ${best.away}\n` +
        `דירוג ראובן AI: ${best.rating}/10\n\n` +
        `הסיבה:\n${best.reason}`;
    } else {
      answer =
        `ראובן AI מצא את המשחק, אבל הדירוג נמוך – לא מתאים לאלגוריתם.\n\n` +
        `משחק: ${best.home} נגד ${best.away}\n` +
        `דירוג ראובן AI: ${best.rating}/10\n\n` +
        `הסיבה:\n${best.reason}`;
    }

    // Suggest alternatives if match is weak
    let alternatives = [];
    if (best.rating < 6.5) {
      alternatives = allRows
        .filter((r) => r !== best && (r.odds || r.odds1 || r.oddsX || r.odds2))
        .map((r) => ({ row: r, score: scoreMatch(r) }))
        .filter(({ score }) => score >= 7)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ row, score }) => buildCard(row, score));

      if (alternatives.length) {
        answer += `\n\nבמקום זה, ראובן AI היה שוקל משחק אחר:`;
      }
    }

    if (!isPremium && matched.length > limit) {
      answer += '\n\n(גרסת פרמיום מציגה ניתוח מלא + יותר משחקים)';
    }

    return { answer, matches: cards, alternatives, disclaimer: DISCLAIMER };
  }

  // ── MATCH QUERY – no match found ──
  if (type === 'match_query' && !matched.length) {
    const suggestions = allRows
      .filter((r) => r.odds || r.odds1 || r.oddsX || r.odds2)
      .map((r) => ({ row: r, score: scoreMatch(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, isPremium ? 5 : 3)
      .map(({ row, score }) => buildCard(row, score));

    return {
      answer:
        `ראובן AI לא מצא כרגע את המשחק הזה במקורות הזמינים.\n\n` +
        `ייתכן שהמשחק לא נמצא בפיד Winner כרגע, או שאין יחסים רשמיים.\n` +
        `לכן לא נמצא יחס רשמי, והמשחק לא נכנס כהמלצה חזקה.\n\n` +
        (suggestions.length ? `אבל מצאתי ${suggestions.length} משחקים דומים שיכולים להיות רלוונטיים:` : ''),
      matches: [],
      alternatives: suggestions,
      disclaimer: DISCLAIMER,
    };
  }

  // ── GENERAL – show top tips ──
  const topGeneral = allRows
    .filter((r) => matchesSport(r, sport))
    .filter((r) => r.odds || r.odds1 || r.oddsX || r.odds2)
    .map((r) => ({ row: r, score: scoreMatch(r) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, isPremium ? 5 : 3)
    .map(({ row, score }) => buildCard(row, score));

  return {
    answer: `ראובן AI חושב שאלה הטיפים הכי מעניינים${sport ? ` ב${sportLabel}` : ''} כרגע:`,
    matches: topGeneral,
    disclaimer: DISCLAIMER,
  };
}

// ── Main handler ──
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Parse body
  let body;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw || '{}');
  } catch {
    body = {};
  }

  const message = String(body.message || '').trim();
  const userType = String(body.userType || 'free');

  if (!message) {
    return res.status(400).json({ error: 'message required' });
  }

  // Premium guard for premium-only intents
  const tokens = tokenize(message);
  const intentType = detectIntent(tokens);
  const sport = detectSport(tokens);
  const date = detectDate(tokens);
  const limit = detectLimit(tokens);

  // Fetch Winner feed
  let feed;
  try {
    feed = await fetchJson(WINNER_FEED_URL);
  } catch (err) {
    return res.status(200).json({
      answer: 'ראובן AI לא הצליח לטעון נתוני Winner כרגע. נסה שוב בעוד כמה שניות.',
      matches: [],
      disclaimer: DISCLAIMER,
    });
  }

  const allRows = flattenFeed(feed, date !== 'today' ? date : null);
  // For today, include all tabs but weight today higher (just use all)
  const fullPool = flattenFeed(feed);

  const intent = { type: intentType, sport, date, limit };

  // Match search for match_query
  let matched = [];
  if (intentType === 'match_query') {
    const queryTokens = tokens.filter(
      (t) => !['היום', 'מחר', 'אתמול', 'today', 'tomorrow', 'yesterday', 'הלילה', 'tonight'].includes(t)
    );
    matched = fullPool
      .filter((r) => r.odds || r.odds1 || r.oddsX || r.odds2)
      .map((r) => ({ row: r, score: scoreMatch(r), hits: matchScore(r, queryTokens) }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits || b.score - a.score);
  }

  const response = buildResponse(intent, intentType, matched, allRows, userType, message, date);
  return res.status(200).json(response);
};
