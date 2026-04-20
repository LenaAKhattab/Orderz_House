const { validationResult } = require("express-validator");

/**
 * Runs after express-validator chains; returns 400 with structured errors.
 */
const validateRequest = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const first = result.array({ onlyFirstError: true })[0];
    return res.status(400).json({
      success: false,
      message: first.msg || "Validation failed.",
      field: first.path || first.param,
    });
  }
  return next();
};

module.exports = validateRequest;
