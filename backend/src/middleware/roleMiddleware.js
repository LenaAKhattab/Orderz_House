const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "يجب تسجيل الدخول.",
        code: "UNAUTHORIZED",
      });
    }

    const resolvedRoles = Array.isArray(req.auth?.roles) ? req.auth.roles.map((r) => r.name) : null;
    const hasAllowedRole = resolvedRoles
      ? resolvedRoles.some((r) => roles.includes(r))
      : roles.includes(req.user.role);

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
