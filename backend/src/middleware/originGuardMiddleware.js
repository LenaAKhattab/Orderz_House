const { isProduction } = require("../config/env");
const { parseAllowedClientOrigins } = require("../config/clientUrl");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Production-only: block state-changing API calls from disallowed browser origins.
 * Complements CORS + SameSite cookies (not a full CSRF token).
 * Skips Stripe webhooks, internal cron (secret header), and health.
 */
function shouldSkipOriginGuard(req) {
  const p = String(req.path || "");
  if (p.startsWith("/webhooks/")) return true;
  if (p.startsWith("/internal/")) return true;
  if (p === "/health" || p.startsWith("/health/")) return true;
  return false;
}

function normalizeOriginUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function originGuardMiddleware(req, res, next) {
  if (!isProduction()) return next();
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (shouldSkipOriginGuard(req)) return next();

  const allowed = parseAllowedClientOrigins();
  const origin = normalizeOriginUrl(req.headers.origin);
  const referer = normalizeOriginUrl(req.headers.referer);

  if (origin && allowed.includes(origin)) return next();
  if (referer && allowed.includes(referer)) return next();

  return res.status(403).json({
    success: false,
    message: "طلب غير مصرح من هذا المصدر.",
    code: "FORBIDDEN_ORIGIN",
  });
}

module.exports = {
  originGuardMiddleware,
  shouldSkipOriginGuard,
  normalizeOriginUrl,
};
