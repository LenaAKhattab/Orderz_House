const rateLimit = require("express-rate-limit");
const { rateLimitJsonHandler } = require("./rateLimiters");
const {
  getApiRateLimitWindowMs,
  getApiRateLimitMax,
  isApiRateLimitEnabled,
} = require("../config/apiRateLimit");

/** Paths under /api mount — do not throttle Stripe retries or health probes. */
function shouldSkipGeneralApiRateLimit(req) {
  const p = String(req.path || "");
  if (p === "/health" || p.startsWith("/health/")) return true;
  if (p.startsWith("/webhooks/stripe")) return true;
  return false;
}

function createApiGeneralLimiter() {
  if (!isApiRateLimitEnabled()) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: getApiRateLimitWindowMs(),
    max: getApiRateLimitMax(),
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkipGeneralApiRateLimit,
    handler: rateLimitJsonHandler("تم تجاوز حد الطلبات، حاول لاحقاً"),
  });
}

module.exports = {
  createApiGeneralLimiter,
  shouldSkipGeneralApiRateLimit,
};
