/**
 * In-memory sliding-window rate limiter.
 *
 * NOTE: Vercel serverless functions may spin up multiple warm instances that
 * do not share memory, so this is a best-effort per-instance limit. It still
 * blocks the most common abuse patterns (burst from a single source).
 *
 * Usage:
 *   const { rateLimit } = require("./_rate-limit");
 *   const limited = rateLimit(req, res, { max: 10, windowMs: 60_000 });
 *   if (limited) return; // response already sent
 */

// ip → [timestamp, ...] (sorted ascending)
const store = new Map();

// Clean up stale entries every 5 minutes to avoid unbounded memory growth.
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [ip, hits] of store) {
    const fresh = hits.filter((t) => t > cutoff);
    if (fresh.length === 0) store.delete(ip);
    else store.set(ip, fresh);
  }
}, 5 * 60 * 1000).unref?.();

/**
 * @param {object} req  - Vercel/Node request
 * @param {object} res  - Vercel/Node response
 * @param {object} opts - { max, windowMs, message }
 * @returns {boolean}   - true if the request was rate-limited (caller must return)
 */
function rateLimit(req, res, { max = 20, windowMs = 60_000, message } = {}) {
  const ip =
    (req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();
  const cutoff = now - windowMs;

  const hits = (store.get(ip) || []).filter((t) => t > cutoff);
  hits.push(now);
  store.set(ip, hits);

  const remaining = Math.max(0, max - hits.length);
  const reset = Math.ceil((hits[0] + windowMs - now) / 1000);

  res.setHeader("X-RateLimit-Limit", max);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", reset);

  if (hits.length > max) {
    res.setHeader("Retry-After", reset);
    res.status(429).json({
      error: "rate_limited",
      message: message || `Too many requests. Retry in ${reset}s.`,
      retryAfter: reset,
    });
    return true;
  }
  return false;
}

/**
 * Sanitize free-text user input to reduce prompt-injection surface.
 * Strips control characters, trims, and caps length.
 */
function sanitizeInput(value, maxLength = 2000) {
  return String(value || "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // strip control chars
    .replace(/\n{4,}/g, "\n\n\n")                        // collapse excessive newlines
    .trim()
    .slice(0, maxLength);
}

module.exports = { rateLimit, sanitizeInput };
