/**
 * General /api rate limit — configurable via env. Does not replace auth-specific limiters.
 */

function parsePositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/** 15 minutes */
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
/** ~20 req/min average — enough for normal SPA use without choking dashboards */
const DEFAULT_MAX = 300;

function getApiRateLimitWindowMs() {
  return parsePositiveInt("API_RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);
}

function getApiRateLimitMax() {
  return parsePositiveInt("API_RATE_LIMIT_MAX", DEFAULT_MAX);
}

/** When max is 0, general API limiter is disabled (useful for local stress tests). */
function isApiRateLimitEnabled() {
  return getApiRateLimitMax() > 0;
}

module.exports = {
  getApiRateLimitWindowMs,
  getApiRateLimitMax,
  isApiRateLimitEnabled,
};
