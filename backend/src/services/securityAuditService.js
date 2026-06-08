const { collectResolvedRoleNames } = require("../utils/roleResolution");

/**
 * Structured security audit log for access denials (never log secrets/passwords).
 * @param {import("express").Request} req
 * @param {object} detail
 * @param {"unauthenticated"|"auth_context_missing"|"role"|"permission"|"account_disabled"} detail.type
 * @param {string} [detail.permissionKey]
 * @param {string[]} [detail.requiredRoles]
 * @param {string} [detail.message]
 */
function logAccessDenied(req, detail = {}) {
  const entry = {
    event: "access_denied",
    timestamp: new Date().toISOString(),
    denialType: detail.type || "unknown",
    userId: req.auth?.userId != null ? String(req.auth.userId) : req.user?.sub != null ? String(req.user.sub) : null,
    email: req.auth?.email || req.user?.email || null,
    role: req.auth?.primaryRole || req.user?.role || null,
    roles: collectResolvedRoleNames(req.auth, req.user?.role),
    permissionAttempted: detail.permissionKey || null,
    requiredRoles: detail.requiredRoles || null,
    method: req.method,
    endpoint: req.originalUrl || req.url || null,
    ip: req.ip || null,
    message: detail.message || null,
  };

  if (process.env.NODE_ENV !== "production" && (detail.type === "permission" || detail.type === "role")) {
    entry.actualPermissions = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
  }

  // eslint-disable-next-line no-console
  console.warn("[security][access_denied]", JSON.stringify(entry));
}

module.exports = {
  logAccessDenied,
};
