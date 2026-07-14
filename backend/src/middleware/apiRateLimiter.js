const rateLimit = require("express-rate-limit");
const { rateLimitJsonHandler } = require("./rateLimitHelpers");
const {
  getApiRateLimitWindowMs,
  getApiRateLimitMax,
  isApiRateLimitEnabled,
} = require("../config/apiRateLimit");

/**
 * Paths under /api mount that must NOT share the global IP bucket:
 * - health / Stripe webhooks
 * - entire /auth/* (dedicated auth limiters; login/logout must stay available)
 * - dedicated order-create / bid-take / training bulk writes (own userId limiters)
 *
 * @param {{ path?: string, method?: string, originalUrl?: string, baseUrl?: string }} req
 */
function shouldSkipGeneralApiRateLimit(req) {
  const method = String(req.method || "GET").toUpperCase();
  let p = String(req.path || "");
  // Defend against callers that pass full /api/... paths in tests or odd mounts.
  if (p.startsWith("/api/")) p = p.slice(4);
  if (p === "/health" || p.startsWith("/health/")) return true;
  if (p.startsWith("/webhooks/stripe")) return true;
  if (p === "/auth" || p.startsWith("/auth/")) return true;

  if (method === "POST") {
    // Client create order (exact). Pay/claim/bid routes under /client/orders/:id stay on global.
    if (p === "/client/orders") return true;
    // Admin internal create (exact).
    if (p === "/admin/orders") return true;
    // Training fake order create + bulk generators.
    if (p === "/admin/training-orders/fake-orders") return true;
    if (p === "/admin/training-orders/force-generate") return true;
    if (p === "/admin/training-orders/rounds/start") return true;
    // Pool bid / take (freelancer).
    if (/^\/orders\/pool\/fake\/[^/]+\/(bids|take)$/.test(p)) return true;
    if (/^\/orders\/pool\/[^/]+\/(bids|take)$/.test(p)) return true;
    if (/^\/orders\/[^/]+\/take$/.test(p)) return true;
  }

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
    handler: rateLimitJsonHandler("global_api", "تم تجاوز حد الطلبات، حاول لاحقاً"),
  });
}

module.exports = {
  createApiGeneralLimiter,
  shouldSkipGeneralApiRateLimit,
};
