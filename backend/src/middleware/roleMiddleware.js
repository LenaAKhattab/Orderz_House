const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const resolvedRoles = Array.isArray(req.auth?.roles) ? req.auth.roles.map((r) => r.name) : null;
    const hasAllowedRole = resolvedRoles
      ? resolvedRoles.some((r) => roles.includes(r))
      : roles.includes(req.user.role);

    if (!hasAllowedRole) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this resource.",
      });
    }

    return next();
  };
};

module.exports = {
  authorizeRoles,
};
