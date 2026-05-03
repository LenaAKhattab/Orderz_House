const { resolvedRoleNames } = require("./rbacMiddleware");

/**
 * Same role union as requireAnyRole: RBAC rows + primary + legacy DB + JWT fallback.
 */
const authorizeRoles = (...roles) => {
  const allowed = roles.filter(Boolean);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "يجب تسجيل الدخول.",
        code: "UNAUTHORIZED",
      });
    }

    const names = resolvedRoleNames(req);
    const hasAllowedRole = names.some((r) => allowed.includes(r));

    if (!hasAllowedRole) {
      return res.status(403).json({
        success: false,
        message: "ليس لديك صلاحية لهذا الإجراء.",
        code: "FORBIDDEN",
      });
    }

    return next();
  };
};

module.exports = {
  authorizeRoles,
};
