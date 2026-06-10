const { authenticate, optionalAuthenticate } = require("./authMiddleware");

const authService = require("../services/authService");

const { resolveAuthzContext } = require("../services/rbacService");

const { collectResolvedRoleNames } = require("../utils/roleResolution");

const { logAccessDenied } = require("../services/securityAuditService");



const FORBIDDEN_MESSAGE = "ليس لديك صلاحية لهذا الإجراء.";

const PERMISSION_FORBIDDEN_MESSAGE = "ليس لديك صلاحية الوصول إلى هذا المورد.";



function sendUnauthorized(res) {

  return res.status(401).json({ success: false, message: "يجب تسجيل الدخول.", code: "UNAUTHORIZED" });

}



function sendForbidden(res, message = FORBIDDEN_MESSAGE) {

  return res.status(403).json({ success: false, message, code: "FORBIDDEN" });

}



function isAdminDashboardPermission(permissionKey) {

  return String(permissionKey || "").startsWith("dashboard.admin.");

}



/**

 * Hydrate req.auth with roles + permissions from DB.

 * Keeps req.user (JWT claims) intact for backward compatibility.

 */

async function attachAuthContext(req, res, next) {

  try {

    if (!req.user?.sub) {

      return next();

    }



    const legacyUser = await authService.getUserRowByIdForAuthz(req.user.sub);

    if (!legacyUser) {

      logAccessDenied(req, { type: "unauthenticated", message: "user_not_found" });

      return res.status(401).json({ success: false, message: "رمز الدخول غير صالح.", code: "INVALID_TOKEN" });

    }

    if (!legacyUser.is_active) {

      logAccessDenied(req, {

        type: "account_disabled",

        message: "inactive_account",

        userId: String(legacyUser.id),

        email: legacyUser.email,

      });

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



function resolvedRoleNames(req) {

  const merged = collectResolvedRoleNames(req.auth, req.user?.role);

  return merged.length ? merged : [];

}



function ensureAuthContext(req, res) {

  if (!req.user) {

    logAccessDenied(req, { type: "unauthenticated" });

    sendUnauthorized(res);

    return false;

  }

  if (!req.auth) {

    logAccessDenied(req, { type: "auth_context_missing", message: "attachAuthContext_not_run" });

    res.status(401).json({

      success: false,

      message: "جلسة غير صالحة. أعد تسجيل الدخول.",

      code: "AUTH_CONTEXT_REQUIRED",

    });

    return false;

  }

  return true;

}



function requireRole(roleName) {

  return (req, res, next) => {

    if (!ensureAuthContext(req, res)) return;

    const roles = resolvedRoleNames(req);

    if (!roles.includes(roleName)) {

      logAccessDenied(req, { type: "role", requiredRoles: [roleName] });

      return sendForbidden(res);

    }

    return next();

  };

}



function requireAnyRole(roleNames) {

  const allowed = Array.isArray(roleNames) ? roleNames : [];

  return (req, res, next) => {

    if (!ensureAuthContext(req, res)) return;

    const roles = resolvedRoleNames(req);

    if (!roles.some((r) => allowed.includes(r))) {

      logAccessDenied(req, { type: "role", requiredRoles: allowed });

      return sendForbidden(res);

    }

    return next();

  };

}



function requirePermission(permissionKey) {

  const key = String(permissionKey || "").trim();

  return (req, res, next) => {

    if (!ensureAuthContext(req, res)) return;

    if (req.auth.isSuperAdmin) return next();



    if (isAdminDashboardPermission(key)) {

      const roles = resolvedRoleNames(req);

      if (!roles.includes("admin")) {

        logAccessDenied(req, { type: "role", permissionKey: key, requiredRoles: ["admin"] });

        return sendForbidden(res, PERMISSION_FORBIDDEN_MESSAGE);

      }

    }



    const keys = Array.isArray(req.auth.permissions) ? req.auth.permissions : [];

    if (!keys.includes(key)) {

      logAccessDenied(req, { type: "permission", permissionKey: key });

      return sendForbidden(res, PERMISSION_FORBIDDEN_MESSAGE);

    }

    return next();

  };

}



function requireAnyPermission(permissionKeys) {

  const allowed = Array.isArray(permissionKeys) ? permissionKeys.map((k) => String(k).trim()).filter(Boolean) : [];

  return (req, res, next) => {

    if (!ensureAuthContext(req, res)) return;

    if (req.auth.isSuperAdmin) return next();



    const needsAdminRole = allowed.some(isAdminDashboardPermission);

    if (needsAdminRole) {

      const roles = resolvedRoleNames(req);

      if (!roles.includes("admin")) {

        logAccessDenied(req, { type: "role", permissionKey: allowed.join("|"), requiredRoles: ["admin"] });

        return sendForbidden(res, PERMISSION_FORBIDDEN_MESSAGE);

      }

    }



    const keys = Array.isArray(req.auth.permissions) ? req.auth.permissions : [];

    if (!allowed.some((k) => keys.includes(k))) {

      logAccessDenied(req, { type: "permission", permissionKey: allowed.join("|") });

      return sendForbidden(res, PERMISSION_FORBIDDEN_MESSAGE);

    }

    return next();

  };

}



/**

 * Admin-panel pages: admin role + page permission. Super admin bypasses.

 * Use for dashboard.admin.* keys on admin-operator routes.

 */

function requireAdminPagePermission(permissionKey) {

  return requirePermission(permissionKey);

}



/**

 * Role-scoped permission: only listed roles must hold the permission; others pass with auth only.

 * Example: admin needs dashboard.admin.notifications; freelancer/client only need login.

 */

function requireRoleScopedPermission(permissionKey, rolesRequiringPermission = ["admin"]) {

  const key = String(permissionKey || "").trim();

  const scopedRoles = Array.isArray(rolesRequiringPermission) ? rolesRequiringPermission : ["admin"];

  return (req, res, next) => {

    if (!ensureAuthContext(req, res)) return;

    if (req.auth.isSuperAdmin) return next();



    const roles = resolvedRoleNames(req);

    const mustCheck = roles.some((r) => scopedRoles.includes(r));

    if (!mustCheck) return next();



    if (!keysIncludes(req.auth.permissions, key)) {

      logAccessDenied(req, { type: "permission", permissionKey: key, requiredRoles: scopedRoles });

      return sendForbidden(res, PERMISSION_FORBIDDEN_MESSAGE);

    }

    return next();

  };

}



function keysIncludes(permissions, key) {

  const keys = Array.isArray(permissions) ? permissions : [];

  return keys.includes(key);

}



function requireFreelancer(req, res, next) {

  return requireRole("freelancer")(req, res, next);

}



function requireSuperAdmin(req, res, next) {

  return requireRole("super_admin")(req, res, next);

}



function requireAdmin(req, res, next) {

  return requireAnyRole(["admin", "super_admin"])(req, res, next);

}



module.exports = {

  attachAuthContext,

  requireAuth,

  optionalAuth,

  resolvedRoleNames,

  requireRole,

  requireFreelancer,

  requireSuperAdmin,

  requireAdmin,

  requireAnyRole,

  requirePermission,

  requireAnyPermission,

  requireAdminPagePermission,

  requireRoleScopedPermission,

};


