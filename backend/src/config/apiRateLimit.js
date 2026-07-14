/**
 * General /api rate limit — configurable via env. Does not replace auth-specific
 * or order-write limiters. Auth and dedicated write paths are skipped so one
 * user's create-order flood cannot block login/logout for the same IP.
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
/**
 * General read/browse budget per IP after auth + write endpoints are excluded.
 * SPA dashboards (notifications, ads, site-pages) share this bucket.
 */
const DEFAULT_MAX = 450;

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
  DEFAULT_MAX,
};
