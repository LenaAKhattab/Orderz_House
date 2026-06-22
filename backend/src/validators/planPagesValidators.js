const { body, param, query } = require("express-validator");

const planPageIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid plan page id.")];
const planFeaturesPlanIdParam = [param("planId").isInt({ min: 1 }).withMessage("Invalid plan id.")];

const listPlanPagesValidators = [];

const createPlanPageValidators = [
  body("title").isString().trim().isLength({ min: 2, max: 200 }).withMessage("title is required."),
  body("subtitle").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("slug")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 2, max: 80 })
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("slug must be lowercase letters, numbers, and hyphens."),
  body("pageType").optional().isIn(["default", "special"]).withMessage("pageType must be default or special."),
  body("isPublic").optional().isBoolean(),
  body("isActive").optional().isBoolean(),
  body("startsAt").optional({ nullable: true }).isISO8601({ strict: false }),
  body("endsAt").optional({ nullable: true }).isISO8601({ strict: false }),
];

const updatePlanPageValidators = [
  ...planPageIdParam,
  body("title").optional().isString().trim().isLength({ min: 2, max: 200 }),
  body("subtitle").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("slug")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 2, max: 80 })
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("slug must be lowercase letters, numbers, and hyphens."),
  body("pageType").optional().isIn(["default", "special"]),
  body("isPublic").optional().isBoolean(),
  body("isActive").optional().isBoolean(),
  body("startsAt").optional({ nullable: true }).isISO8601({ strict: false }),
  body("endsAt").optional({ nullable: true }).isISO8601({ strict: false }),
];

const replacePlanFeaturesValidators = [
  ...planFeaturesPlanIdParam,
  body("features").isArray({ max: 50 }).withMessage("features must be an array."),
  body("features.*.featureText")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 }),
  body("features.*.sortOrder").optional().isInt({ min: 0, max: 1000 }),
  body("features.*.isIncluded").optional().isBoolean(),
];

module.exports = {
  listPlanPagesValidators,
  createPlanPageValidators,
  updatePlanPageValidators,
  planPageIdParam,
  replacePlanFeaturesValidators,
  planFeaturesPlanIdParam,
};
