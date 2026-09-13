const rateLimit = require("express-rate-limit");
const { rateLimitJsonHandler } = require("./rateLimitHelpers");
const {
  getPublicReadRateLimitWindowMs,
  getPublicReadRateLimitMax,
  isPublicReadRateLimitEnabled,
} = require("../config/publicReadRateLimit");

/**
 * True for safe public GET paths that should use the relaxed public-read bucket
 * (and be skipped from global_api).
 *
 * @param {{ path?: string, method?: string }} req
 */
function isPublicReadRateLimitedPath(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET") return false;

  let p = String(req.path || "");
  if (p.startsWith("/api/")) p = p.slice(4);

  if (p === "/public" || p.startsWith("/public/")) return true;
  // Homepage / public pool preview list only — not take/bid/detail writes.
  if (p === "/orders/pool") return true;
  return false;
}

function createPublicReadLimiter() {
  if (!isPublicReadRateLimitEnabled()) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: getPublicReadRateLimitWindowMs(),
    max: getPublicReadRateLimitMax(),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => !isPublicReadRateLimitedPath(req),
    handler: rateLimitJsonHandler(
      "public_read",
      "تم تجاوز حد طلبات الصفحات العامة، حاول لاحقاً",
      { windowMsFallback: getPublicReadRateLimitWindowMs() },
    ),
  });
}

module.exports = {
  createPublicReadLimiter,
  isPublicReadRateLimitedPath,
};
