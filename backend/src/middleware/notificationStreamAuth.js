const jwt = require("jsonwebtoken");
const { AUTH_COOKIE_NAME } = require("../utils/authCookie");
const authService = require("../services/authService");
const { resolveAuthzContext } = require("../services/rbacService");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) return null;
  return secret;
}

function getTokenFromRequest(req) {
  const q = req.query?.token;
  if (q && typeof q === "string" && q.trim()) return q.trim();
  const fromCookie = req.cookies?.[AUTH_COOKIE_NAME];
  if (fromCookie && typeof fromCookie === "string" && fromCookie.trim()) return fromCookie.trim();
  const [scheme, bearer] = String(req.headers.authorization || "").split(" ");
  if (scheme === "Bearer" && bearer) return bearer;
  return null;
}

/** SSE auth — supports HttpOnly cookie or `?token=` for EventSource clients. */
async function requireNotificationStreamAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, message: "يجب تسجيل الدخول.", code: "UNAUTHORIZED" });
  }
  const secret = getJwtSecret();
  if (!secret) {
    return res.status(500).json({ success: false, message: "حدث خطأ غير متوقع.", code: "INTERNAL_ERROR" });
  }
  try {
    req.user = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ success: false, message: "رمز الدخول غير صالح.", code: "INVALID_TOKEN" });
  }

  try {
    const legacyUser = await authService.getUserRowByIdForAuthz(req.user.sub);
    if (!legacyUser) {
      return res.status(401).json({ success: false, message: "رمز الدخول غير صالح.", code: "INVALID_TOKEN" });
    }
    if (!legacyUser.is_active) {
      return res.status(403).json({ success: false, message: "تم تعطيل هذا الحساب.", code: "ACCOUNT_DISABLED" });
    }
    const authz = await resolveAuthzContext({ userId: legacyUser.id, legacyRole: legacyUser.role });
    req.auth = {
      userId: String(legacyUser.id),
      accountId: legacyUser.account_id,
      email: legacyUser.email,
      legacyRole: legacyUser.role ? String(legacyUser.role).trim() : null,
      primaryRole: authz.primaryRole,
      roles: authz.roles,
      permissions: authz.permissions,
      isSuperAdmin: authz.isSuperAdmin,
      rbacReady: authz.rbacReady,
    };
    req.user.role = req.auth.primaryRole || req.user.role;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireNotificationStreamAuth,
};
