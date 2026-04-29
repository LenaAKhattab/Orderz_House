const { body, param, query } = require("express-validator");

const planIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid plan id.")];

const listPlansValidators = [
  query("includeDeleted").optional().isBoolean().withMessage("includeDeleted must be boolean."),
];

const createPlanValidators = [
  body("name")
    .isString()
    .trim()
    .isLength({ min: 2, max: 80 })
    .withMessage("name must be between 2 and 80 characters.")
    .matches(/^[a-z][a-z0-9_]*$/)
    .withMessage("name must be snake_case (letters, numbers, underscore)."),
  body("title").isString().trim().isLength({ min: 2, max: 140 }).withMessage("title is required."),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("Invalid description."),
  body("durationDays").isInt({ min: 1, max: 3650 }).withMessage("durationDays must be 1..3650."),
  body("priceJod").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("priceJod must be >= 0."),
  body("requiresCompanyVisit").optional().isBoolean().withMessage("requiresCompanyVisit must be boolean."),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean."),
  body("isVisible").optional().isBoolean().withMessage("isVisible must be boolean."),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }).withMessage("sortOrder must be an integer."),
];

const updatePlanValidators = [
  ...planIdParam,
  body("title").optional().isString().trim().isLength({ min: 2, max: 140 }).withMessage("Invalid title."),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("Invalid description."),
  body("durationDays").optional().isInt({ min: 1, max: 3650 }).withMessage("durationDays must be 1..3650."),
  body("priceJod").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("priceJod must be >= 0."),
  body("requiresCompanyVisit").optional().isBoolean().withMessage("requiresCompanyVisit must be boolean."),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean."),
  body("isVisible").optional().isBoolean().withMessage("isVisible must be boolean."),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }).withMessage("sortOrder must be an integer."),
];

module.exports = {
  planIdParam,
  listPlansValidators,
  createPlanValidators,
  updatePlanValidators,
};

