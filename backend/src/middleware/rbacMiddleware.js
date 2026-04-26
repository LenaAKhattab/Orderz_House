const { authenticate, optionalAuthenticate } = require("./authMiddleware");
const authService = require("../services/authService");
const { resolveAuthzContext } = require("../services/rbacService");

/**
 * Hydrate req.auth with roles + permissions from DB.
 * Keeps req.user (JWT claims) intact for backward compatibility.
 */
async function attachAuthContext(req, res, next) {
  try {
    if (!req.user?.sub) {
      return next();
    }

    // Use legacy users.role as compatibility anchor (until Phase 3 removes it)
    const legacyUser = await authService.getUserRowByIdForAuthz(req.user.sub);
    if (!legacyUser) {
      return res.status(401).json({ success: false, message: "Invalid authentication token." });
    }
    if (!legacyUser.is_active) {
      return res.status(403).json({ success: false, message: "This account has been disabled." });
    }

    const authz = await resolveAuthzContext({ userId: legacyUser.id, legacyRole: legacyUser.role });

    req.auth = {
      userId: String(legacyUser.id),
      accountId: legacyUser.account_id,
      email: legacyUser.email,
      /** عمود users.role — يُحتفظ به صراحة لأن user_roles قد لا تعكس دور الإدارة بعد الدمج/الترحيل */
      legacyRole: legacyUser.role ? String(legacyUser.role).trim() : null,
      primaryRole: authz.primaryRole,
      roles: authz.roles,
      permissions: authz.permissions,
      isSuperAdmin: authz.isSuperAdmin,
      rbacReady: authz.rbacReady,
    };

    // Backward-compatible: keep req.user.role consistent
    req.user.role = req.auth.primaryRole || req.user.role;

    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAuth(req, res, next) {
  return authenticate(req, res, (err) => {
    if (err) return next(err);
    return attachAuthContext(req, res, next);
  });
}

function optionalAuth(req, res, next) {
  return optionalAuthenticate(req, res, (err) => {
    if (err) return next(err);
    return attachAuthContext(req, res, next);
  });
}

/**
 * Role names for authorization: union of RBAC `user_roles`, resolved primary, and legacy `users.role`.
 * Relying only on `user_roles` breaks when the row set is incomplete (e.g. client linked but admin on users.role).
 */
function resolvedRoleNames(req) {
  const rbac = Array.isArray(req.auth?.roles)
    ? req.auth.roles.map((r) => (r && r.name ? String(r.name).trim() : "")).filter(Boolean)
    : [];
  const primary = req.auth?.primaryRole && String(req.auth.primaryRole).trim();
  const legacyDb = req.auth?.legacyRole && String(req.auth.legacyRole).trim();
  const merged = [...new Set([...rbac, primary, legacyDb].filter(Boolean))];
  if (merged.length) return merged;
  const legacyJwt = req.user?.role && String(req.user.role).trim();
  return legacyJwt ? [legacyJwt] : [];
}

function requireRole(roleName) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Authentication is required." });
    const roles = resolvedRoleNames(req);
    if (!roles.includes(roleName)) {
      return res.status(403).json({ success: false, message: "You are not allowed to access this resource." });
    }
    return next();
  };
}

function requireAnyRole(roleNames) {
  const allowed = Array.isArray(roleNames) ? roleNames : [];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Authentication is required." });
    const roles = resolvedRoleNames(req);
    if (!roles.some((r) => allowed.includes(r))) {
      return res.status(403).json({ success: false, message: "You are not allowed to access this resource." });
    }
    return next();
  };
}

function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Authentication is required." });
    if (req.auth?.isSuperAdmin) return next();
    const keys = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
    if (!keys.includes(permissionKey)) {
      return res.status(403).json({ success: false, message: "You are not allowed to access this resource." });
    }
    return next();
  };
}

function requireAnyPermission(permissionKeys) {
  const allowed = Array.isArray(permissionKeys) ? permissionKeys : [];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Authentication is required." });
    if (req.auth?.isSuperAdmin) return next();
    const keys = Array.isArray(req.auth?.permissions) ? req.auth.permissions : [];
    if (!keys.some((k) => allowed.includes(k))) {
      return res.status(403).json({ success: false, message: "You are not allowed to access this resource." });
    }
    return next();
  };
}

module.exports = {
  attachAuthContext,
  requireAuth,
  optionalAuth,
  requireRole,
  requireAnyRole,
  requirePermission,
  requireAnyPermission,
};

