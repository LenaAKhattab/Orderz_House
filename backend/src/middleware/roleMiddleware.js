const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const role = req.user.role;
    if (!role || !roles.includes(role)) {
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
