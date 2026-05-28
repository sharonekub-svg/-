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
      .get(url, { timeout: 10000 }, (res) => {
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
  return odds != null && odds >= 1.4 && odds <= 1.9;
}

// ── Extract best odds from a reuvenSchedule row (has nested markets[].outcomes[]) ──
function extractScheduleOdds(row) {
  if (!row.markets || !row.markets.length) return null;
  const market = row.markets.find((m) => m.tier === 'primary') || row.markets[0];
  const outcomes = (market.outcomes || []).filter((o) => o.odds > 0);
  if (!outcomes.length) return null;

  const inRange = outcomes.filter((o) => oddsInRange(o.odds));
  const pool = inRange.length ? inRange : outcomes;
  const best = pool.sort((a, b) => Math.abs(a.odds - 1.65) - Math.abs(b.odds - 1.65))[0];

  // Also extract 1X2-style odds
  const nonDraw = outcomes.filter((o) => String(o.desc).toLowerCase() !== 'x');
  const draw = outcomes.find((o) => String(o.desc).toLowerCase() === 'x');
  return {
    pick: best.label || best.team || best.desc,
    odds: inRange.length ? best.odds : null,   // null = outside range, no recommendation
    oddsRaw: best.odds,
    odds1: nonDraw[0]?.odds || null,
    oddsX: draw?.odds || null,
    odds2: nonDraw[1]?.odds || null,
    outsideRange: inRange.length === 0,
  };
}

// Normalise a schedule row to look like a tabs row
function normalizeScheduleRow(row) {
  if (row._normalised) return row;
  const extracted = extractScheduleOdds(row);
  return {
    ...row,
    _normalised: true,
    _fromSchedule: true,
    odds: extracted?.odds ?? null,
    oddsRaw: extracted?.oddsRaw ?? null,
    winnerPick: extracted?.pick || null,
    pick: extracted?.pick || null,
    odds1: extracted?.odds1 ?? null,
    oddsX: extracted?.oddsX ?? null,
    odds2: extracted?.odds2 ?? null,
    outsideRange: extracted?.outsideRange ?? true,
    _sportId: row.sportId || row._sportId,
  };
}

// ── Feed flattener – handles the actual feed structure:
// feed.tabs.{today|tomorrow|yesterday}.sports.{football|basketball} → arrays of rows
// Also handles older { id: [rows] } formats
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

// ── Check if a row has any meaningful odds ──
function hasAnyOdds(row) {
  return (
    (row.odds != null && row.odds > 0) ||
    (row.oddsRaw != null && row.oddsRaw > 0) ||
    (row.odds1 != null && row.odds1 > 0) ||
    (row.oddsX != null && row.oddsX > 0) ||
    (row.odds2 != null && row.odds2 > 0)
  );
}

// ── Match scoring (1–10) ──
function scoreMatch(row) {
  let score = 5.0;

  // Prefer recommended odds; fall back to oddsRaw, then 1X2 min
  const mainOdds = parseOdds(row.odds) || parseOdds(row.oddsRaw);
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
  if (modelScore > 0 && modelScore <= 100) score += Math.min(modelScore / 100, 1.5);

  // Probability bonus
  const prob = parseFloat(row.prob1 || row.prob || row.probability || row.normalizedProbability || 0);
  const probPct = prob <= 1 ? prob * 100 : prob;
  if (probPct > 65) score += 0.5;
  else if (probPct > 55) score += 0.2;

  // Market gap bonus
  if (parseFloat(row.marketGap || 0) > 0.05) score += 0.5;

  // Penalties
  if (row.outsideRange) score -= 2.0;

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

// ── Recommend outcome for a row ──
function recommendedOutcome(row) {
  // Prefer the algorithm's own pick
  const pick = row.winnerPick || row.pick || row.pickTeam;
  const pickOdds = parseOdds(row.odds) || parseOdds(row.oddsRaw);
  if (pick && pickOdds) {
    const spread = row.spread != null ? ` ${Number(row.spread) > 0 ? '+' : ''}${row.spread}` : '';
    return { label: `${pick}${spread}`, odds: pickOdds };
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
  const prob = parseFloat(row.prob1 || row.prob || row.probability || row.normalizedProbability || 0);
  const probPct = prob <= 1 ? Math.round(prob * 100) : Math.round(prob);
  if (probPct > 50) parts.push(`הסתברות ${probPct}%`);
  if (score >= 8) parts.push('ציון גבוה מאוד');
  else if (score >= 7) parts.push('ציון גבוה');
  if (row._fromSchedule) parts.push('נמצא בלוח Winner');
  if (row.outsideRange) parts.push('יחס מחוץ לטווח המועדף');
  return parts.join(' · ') || 'ניתוח סטטיסטי';
}

// ── Compute result status from feed row ──
// The main feed's applyResult() already sets row.status to "hit"/"miss"/"ממתין"/"בוטל"/"לא אומת"/"נסגר"
// We normalise to the Hebrew labels used in the UI.
function computeResultStatus(row) {
  const s = String(row.status || '').trim();
  if (s === 'hit')   return 'תפס';
  if (s === 'miss')  return 'נפל';
  if (s === 'בוטל')  return 'בוטל';
  if (s === 'לא אומת') return 'לא אומת';

  // Feed may say "נסגר" but not have computed hit/miss — do it ourselves
  if (s === 'נסגר' || row.matchPhase === 'final' || row.bettingStatus === 'closed') {
    const actual = norm(row.actualWinner || '');
    const pick   = norm(row.winnerPick  || row.pick || row.pickTeam || '');
    if (actual && pick) {
      return (actual === pick || actual.includes(pick) || pick.includes(actual))
        ? 'תפס' : 'נפל';
    }
    return 'נסגר';
  }

  if (row.matchPhase === 'live' || row.matchPhase === 'ht') return 'חי 🔴';
  return 'ממתין';
}

// ── Build a card object from a row ──
function buildCard(row, score) {
  const rec = recommendedOutcome(row);
  const resultStatus = computeResultStatus(row);
  return {
    home: row.home || '?',
    away: row.away || '?',
    league: row.league || row.competition || '',
    time: row.time || row.kickoff || '',
    day: row.day || '',
    sport: row._sportId || row.sportId || row.sport || '',
    tab: row._tab || '',
    recommendation: rec?.label || null,
    recommendedOdds: rec?.odds ? Number(rec.odds.toFixed(2)) : null,
    rating: score,
    reason: buildReason(row, score, rec),
    resultStatus,
    actualWinner: row.actualWinner || '',
    liveScore: row.liveScore || row.result || '',
    isPremium: Boolean(row.isPremium || row.premium),
    outsideRange: Boolean(row.outsideRange),
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
  return norm(text).split(/[\s,./;:!?()-]+/).filter((t) => t.length >= 2);
}

// ── Intent detection ──

const SPORT_MAP = {
  football: [
    'כדורגל', 'פרמייר', 'champions', 'liga', 'laliga', 'בונדסליגה', 'סריה',
    'ליגת העל', 'ברזיל', 'copa', 'uefa', 'euro', 'premier', 'soccer',
    'ligue', 'eredivisie', 'mundial', 'מונדיאל', 'כדורג',
  ],
  basketball: [
    'כדורסל', 'nba', 'ncaa', 'euroleague', 'יורוליג', 'אירוליג', 'euroliga',
    'nbl', 'basketball', 'לייקרס', 'lakers', 'celtics', 'warriors', 'bulls',
    'מכבי', 'maccabi', 'hapoel', 'הפועל', 'ניקס', 'knicks', 'nets', 'bucks',
    'heat', 'suns', 'nuggets', 'cavaliers', 'thunder', 'clippers',
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
  return 'today';
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
    /תן לי|give me|show me|הכי טובים|הכי חזקים|הצג/.test(joined);

  const isGeneralQuestion =
    /יש משהו|יש.*היום|יש.*מחר|מה יש|what.*today|what.*tomorrow/.test(joined);

  if (isTopRequest || isGeneralQuestion) return 'top_tips';
  if (tokens.length >= 2) return 'match_query';
  return 'general';
}

// ── Match text search with fuzzy scoring ──

// Score how well a row matches the user's query tokens
function textMatchScore(row, tokens) {
  const fields = [
    row.match || '',
    row.home || '',
    row.away || '',
    row.league || '',
    row.sport || '',
    row.country || '',
  ];
  const hay = norm(fields.join(' '));
  const hayTokens = hay.split(/\s+/);

  let hits = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (hay.includes(t)) {
      // Exact substring – strong signal
      hits += 2;
    } else {
      // Partial: token is prefix/suffix of a hay word, or hay word is prefix of token
      const partial = hayTokens.some(
        (w) => w.length >= 3 && (w.startsWith(t) || t.startsWith(w))
      );
      if (partial) hits += 1;
    }
  }
  return hits;
}

// ── Sport filter ──
const SPORT_IDS_BASKETBALL = new Set([3, 227, '3', '227', 'basketball']);
const SPORT_IDS_FOOTBALL = new Set([1, 240, '1', '240', 'football', 'soccer']);

function matchesSport(row, sport) {
  if (!sport) return true;
  const sid = row._sportId || row.sportId;
  const sportStr = norm(row.sport || '');
  if (sport === 'basketball') {
    return (
      SPORT_IDS_BASKETBALL.has(sid) ||
      SPORT_IDS_BASKETBALL.has(String(sid)) ||
      SPORT_IDS_BASKETBALL.has(Number(sid)) ||
      sportStr.includes('כדורסל') ||
      sportStr.includes('basketball')
    );
  }
  if (sport === 'football') {
    return (
      SPORT_IDS_FOOTBALL.has(sid) ||
      SPORT_IDS_FOOTBALL.has(String(sid)) ||
      SPORT_IDS_FOOTBALL.has(Number(sid)) ||
      sportStr.includes('כדורגל') ||
      sportStr.includes('football') ||
      sportStr.includes('soccer')
    );
  }
  return true;
}

// ── Build reuvenSchedule into a flat searchable pool ──
function flattenSchedule(feed) {
  const schedule = feed.reuvenSchedule;
  if (!Array.isArray(schedule)) return [];
  return schedule.map((row) => normalizeScheduleRow({ ...row, _tab: 'schedule' }));
}

// ── Response builder ──
function buildResponse(intent, type, matched, allRows, scheduleRows, userType, message, date) {
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
      .filter(hasAnyOdds)
      .map((r) => ({ row: r, score: scoreMatch(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (!pool.length) {
      return {
        answer: `ראובן AI לא מצא משחקים מתאימים${sport ? ` ב${sportLabel}` : ''} ל${date === 'tomorrow' ? 'מחר' : 'היום'}. נסה שוב מאוחר יותר.`,
        matches: [],
        disclaimer: DISCLAIMER,
      };
    }

    const cards = pool.map(({ row, score }) => buildCard(row, score));
    const whenLabel = date === 'tomorrow' ? 'למחר' : date === 'yesterday' ? 'לאתמול' : 'להיום';
    const freeNote = !isPremium ? ' (פרימיום מציג ניתוח מלא + יותר משחקים)' : '';
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
        (best.day ? `תאריך: ${best.day}\n` : '') +
        (best.time ? `שעה: ${best.time}\n` : '') +
        (best.recommendation ? `המלצה: ${best.recommendation}\n` : '') +
        (best.recommendedOdds ? `יחס: ${best.recommendedOdds}\n` : '') +
        `דירוג ראובן AI: ${best.rating}/10\n\n` +
        `למה?\n${best.reason}`;
    } else if (best.rating >= 5) {
      answer =
        `ראובן AI מצא את המשחק, אבל הוא לא נכנס כהמלצה חזקה.\n\n` +
        `משחק: ${best.home} נגד ${best.away}\n` +
        (best.league ? `ליגה: ${best.league}\n` : '') +
        (best.day ? `תאריך: ${best.day}\n` : '') +
        (best.time ? `שעה: ${best.time}\n` : '') +
        (best.recommendation ? `יחס זמין: ${best.recommendation} @ ${best.recommendedOdds || '?'}\n` : '') +
        `דירוג ראובן AI: ${best.rating}/10\n\n` +
        `הסיבה:\n${best.reason}`;
    } else {
      answer =
        `ראובן AI מצא את המשחק, אבל הדירוג נמוך – לא מתאים לאלגוריתם.\n\n` +
        `משחק: ${best.home} נגד ${best.away}\n` +
        (best.league ? `ליגה: ${best.league}\n` : '') +
        (best.day ? `תאריך: ${best.day}\n` : '') +
        (best.recommendation ? `יחס זמין: ${best.recommendation} @ ${best.recommendedOdds || '?'}\n` : '') +
        `דירוג ראובן AI: ${best.rating}/10\n\n` +
        `הסיבה:\n${best.reason}`;
    }

    // Suggest alternatives if match is weak
    let alternatives = [];
    if (best.rating < 6.5) {
      alternatives = allRows
        .filter((r) => {
          const isSame = norm(r.home) === norm(best.home) && norm(r.away) === norm(best.away);
          return !isSame && hasAnyOdds(r);
        })
        .map((r) => ({ row: r, score: scoreMatch(r) }))
        .filter(({ score }) => score >= 6)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(({ row, score }) => buildCard(row, score));

      if (alternatives.length) {
        answer += `\n\nבמקום זה, ראובן AI היה שוקל:`;
      }
    }

    if (!isPremium && matched.length > limit) {
      answer += '\n\n(גרסת פרמיום מציגה ניתוח מלא + יותר משחקים)';
    }

    return { answer, matches: cards, alternatives, disclaimer: DISCLAIMER };
  }

  // ── MATCH QUERY – not found in feed, search schedule ──
  if (type === 'match_query' && !matched.length) {
    // Try the schedule pool (all 31 days from Winner)
    const queryTokens = intent._queryTokens || [];
    const scheduleMatches = scheduleRows
      .filter(hasAnyOdds)
      .map((r) => ({ row: r, hits: textMatchScore(r, queryTokens), score: scoreMatch(r) }))
      .filter(({ hits }) => hits >= 1)
      .sort((a, b) => b.hits - a.hits || b.score - a.score)
      .slice(0, isPremium ? 5 : 3);

    if (scheduleMatches.length) {
      const cards = scheduleMatches.map(({ row, score }) => buildCard(row, score));
      const best = cards[0];
      return {
        answer:
          `ראובן AI מצא את המשחק בלוח Winner!\n\n` +
          `משחק: ${best.home} נגד ${best.away}\n` +
          (best.league ? `ליגה: ${best.league}\n` : '') +
          (best.day ? `תאריך: ${best.day}\n` : '') +
          (best.time ? `שעה: ${best.time}\n` : '') +
          (best.recommendation ? `המלצה: ${best.recommendation} @ ${best.recommendedOdds || '?'}\n` : '') +
          (best.outsideRange ? `⚠️ יחס מחוץ לטווח המועדף (1.40–1.90)\n` : '') +
          `דירוג ראובן AI: ${best.rating}/10\n\n` +
          `${best.reason}`,
        matches: cards,
        alternatives: [],
        disclaimer: DISCLAIMER,
      };
    }

    // Nothing found anywhere – suggest top available matches
    const suggestions = allRows
      .filter(hasAnyOdds)
      .filter((r) => matchesSport(r, sport))
      .map((r) => ({ row: r, score: scoreMatch(r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, isPremium ? 5 : 3)
      .map(({ row, score }) => buildCard(row, score));

    const searchedName = tokenize(message).filter(
      (t) => !['היום', 'מחר', 'אתמול', 'today', 'tomorrow', 'yesterday', 'הלילה', 'tonight'].includes(t)
    ).join(' ');

    return {
      answer:
        `ראובן AI חיפש את "${searchedName}" בפיד Winner הנוכחי ובלוח המשחקים לחודש הקרוב – לא נמצאה התאמה.\n\n` +
        `ייתכן שהמשחק אינו בלוח Winner כרגע, או שהשם נרשם אחרת בפיד.\n` +
        `נסה לכתוב את שם הקבוצה בדיוק כפי שמופיע ב-winner.co.il, למשל: "ריאל מדריד ברצלונה".\n\n` +
        (suggestions.length ? `אלה המשחקים הזמינים${sport ? ` ב${sportLabel}` : ''} כרגע:` : ''),
      matches: [],
      alternatives: suggestions,
      disclaimer: DISCLAIMER,
    };
  }

  // ── GENERAL – show top tips ──
  const topGeneral = allRows
    .filter((r) => matchesSport(r, sport))
    .filter(hasAnyOdds)
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

  // allRows: today/tomorrow/yesterday tabs (pre-processed recommendations)
  const allRows = flattenFeed(feed, date !== 'today' ? date : null);
  const fullPool = flattenFeed(feed); // all tabs

  // scheduleRows: ALL Winner matches for next 31 days (raw market data)
  const scheduleRows = flattenSchedule(feed);

  const intent = { type: intentType, sport, date, limit };

  // Match search for match_query
  let matched = [];
  let queryTokens = [];
  if (intentType === 'match_query') {
    queryTokens = tokens.filter(
      (t) => !['היום', 'מחר', 'אתמול', 'today', 'tomorrow', 'yesterday', 'הלילה', 'tonight', 'מה', 'יש', 'על', 'את', 'של'].includes(t)
    );
    intent._queryTokens = queryTokens;

    // Search across all tabs + schedule rows combined
    const searchPool = [
      ...fullPool,
      // include schedule rows that aren't duplicates of fullPool dates
      ...scheduleRows.filter((r) => {
        const poolDates = new Set(fullPool.map((p) => p.day));
        return !poolDates.has(r.day) || r.day > (feed.tabs?.today?.date || '');
      }),
    ];

    matched = searchPool
      .filter(hasAnyOdds)
      .map((r) => ({
        row: r,
        score: scoreMatch(r),
        hits: textMatchScore(r, queryTokens),
      }))
      .filter(({ hits }) => hits >= 2)   // require at least 2 token hits
      .sort((a, b) => b.hits - a.hits || b.score - a.score);

    // If strict search (≥2 hits) found nothing, try looser (≥1 hit)
    if (!matched.length) {
      matched = searchPool
        .filter(hasAnyOdds)
        .map((r) => ({
          row: r,
          score: scoreMatch(r),
          hits: textMatchScore(r, queryTokens),
        }))
        .filter(({ hits }) => hits >= 1)
        .sort((a, b) => b.hits - a.hits || b.score - a.score);
    }
  }

  const response = buildResponse(intent, intentType, matched, allRows, scheduleRows, userType, message, date);
  return res.status(200).json(response);
};
