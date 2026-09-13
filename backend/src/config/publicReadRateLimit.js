/**
 * Relaxed rate limit for safe public GET reads (homepage chrome / pool preview).
 * Does not replace auth or write limiters. Tunable via env.
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
 * Homepage polls a few GETs while open; NAT may share an IP.
 * Keep a real ceiling, but far above a normal page load + light refresh.
 */
const DEFAULT_MAX = 1800;

function getPublicReadRateLimitWindowMs() {
  return parsePositiveInt("PUBLIC_READ_RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);
}

function getPublicReadRateLimitMax() {
  return parsePositiveInt("PUBLIC_READ_RATE_LIMIT_MAX", DEFAULT_MAX);
}

function isPublicReadRateLimitEnabled() {
  return getPublicReadRateLimitMax() > 0;
}

module.exports = {
  getPublicReadRateLimitWindowMs,
  getPublicReadRateLimitMax,
  isPublicReadRateLimitEnabled,
  DEFAULT_MAX,
  DEFAULT_WINDOW_MS,
};
