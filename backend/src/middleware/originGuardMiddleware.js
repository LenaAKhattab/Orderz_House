const { isProduction } = require("../config/env");
const { parseAllowedClientOrigins } = require("../config/clientUrl");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Production-only: block state-changing API calls from disallowed browser origins.
 * Complements CORS + SameSite cookies (not a full CSRF token).
 * Skips Stripe webhooks, internal cron (secret header), health, and partner FAZAT.
 *
 * Native mobile (Flutter) typically sends no Origin/Referer. Those requests must
 * not be treated like unknown browser origins. If a browser Origin/Referer is
 * present, it must be allowlisted — X-Client-Type alone cannot bypass that.
 */
function shouldSkipOriginGuard(req) {
  const p = String(req.path || "");
  if (p.startsWith("/webhooks/")) return true;
  if (p.startsWith("/internal/")) return true;
  if (p.startsWith("/integrations/fazat")) return true;
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

function forbiddenOrigin(res) {
  return res.status(403).json({
    success: false,
    message: "طلب غير مصرح من هذا المصدر.",
    code: "FORBIDDEN_ORIGIN",
  });
}

function originGuardMiddleware(req, res, next) {
  if (!isProduction()) return next();
  if (!MUTATING_METHODS.has(req.method)) return next();
  if (shouldSkipOriginGuard(req)) return next();

  const allowed = parseAllowedClientOrigins();
  const origin = normalizeOriginUrl(req.headers.origin);
  const referer = normalizeOriginUrl(req.headers.referer);

  // Cross-site browser requests always send Origin — enforce allowlist.
  if (origin) {
    if (allowed.includes(origin)) return next();
    return forbiddenOrigin(res);
  }

  // Referer without Origin (some browsers / older clients): still enforce allowlist.
  if (referer) {
    if (allowed.includes(referer)) return next();
    return forbiddenOrigin(res);
  }

  // No Origin and no Referer: native mobile apps, curl, non-browser API clients.
  // Flutter sends X-Client-Type: mobile and typically omits Origin — allow those.
  // A spoofed X-Client-Type cannot bypass a present disallowed Origin (checked above).
  return next();
}

module.exports = {
  originGuardMiddleware,
  shouldSkipOriginGuard,
  normalizeOriginUrl,
};
