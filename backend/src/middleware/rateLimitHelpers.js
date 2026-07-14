/**
 * Shared helpers for express-rate-limit keying and 429 handlers.
 */

const { ipKeyGenerator } = require("express-rate-limit");
const { logRateLimitExceeded, resolveClientIp } = require("../utils/rateLimitLog");

const RATE_LIMITED_CODE = "RATE_LIMITED";

function clientIpKey(req) {
  const rawIp = resolveClientIp(req);
  try {
    return ipKeyGenerator(rawIp, 56);
  } catch {
    return String(rawIp || "unknown");
  }
}

/**
 * Prefer authenticated userId when present (limiters must run after requireAuth).
 * Guests / missing auth fall back to IP.
 */
function userOrIpKey(prefix, req) {
  const uid = req?.auth?.userId != null ? String(req.auth.userId).trim() : "";
  if (uid) return `${prefix}:user:${uid}`;
  return `${prefix}:ip:${clientIpKey(req)}`;
}

function setRetryAfterHeader(res, options, windowMsFallback) {
  const resetTime = options?.resetTime;
  const windowMs = options?.windowMs || windowMsFallback || 15 * 60 * 1000;
  const retryAfterSec = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(windowMs / 1000);
  res.set("Retry-After", String(retryAfterSec));
  return retryAfterSec;
}

/**
 * @param {string} limiterName stable name for logs (e.g. order_create)
 * @param {string} messageAr user-facing Arabic message
 * @param {{ windowMsFallback?: number }} [opts]
 */
function rateLimitJsonHandler(limiterName, messageAr, opts = {}) {
  const windowMsFallback = opts.windowMsFallback || 15 * 60 * 1000;
  return function rateLimitHandler(req, res, _next, options) {
    const retryAfterSec = setRetryAfterHeader(res, options, windowMsFallback);
    try {
      logRateLimitExceeded({ limiterName, req, retryAfterSec });
    } catch {
      /* never fail the response */
    }
    res.status(429).json({
      success: false,
      message: messageAr,
      code: RATE_LIMITED_CODE,
      limiter: limiterName,
    });
  };
}

module.exports = {
  RATE_LIMITED_CODE,
  clientIpKey,
  userOrIpKey,
  setRetryAfterHeader,
  rateLimitJsonHandler,
};
