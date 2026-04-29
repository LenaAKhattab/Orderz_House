const { body, param, query } = require("express-validator");

const roundIdParam = [param("id").isInt({ min: 1 }).withMessage("معرف الجولة غير صالح.")];
const templateIdParam = [param("id").isInt({ min: 1 }).withMessage("معرف القالب غير صالح.")];

const createTemplateValidators = [
  body("title").isString().trim().isLength({ min: 2, max: 255 }),
  body("description").isString().trim().isLength({ min: 10, max: 5000 }),
  body("categoryId").isInt({ min: 1 }),
  body("subcategoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("subSubcategoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("skills").optional({ nullable: true }).isArray(),
  body("minBudget").isFloat({ min: 0.01 }),
  body("maxBudget").isFloat({ min: 0.01 }),
  body("minDuration").isInt({ min: 1 }),
  body("maxDuration").isInt({ min: 1 }),
  body("durationUnit").optional().isIn(["days", "hours", "minutes"]),
];

const updateTemplateValidators = [
  ...templateIdParam,
  body("title").optional().isString().trim().isLength({ min: 2, max: 255 }),
  body("description").optional().isString().trim().isLength({ min: 10, max: 5000 }),
  body("categoryId").optional().isInt({ min: 1 }),
  body("subcategoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("subSubcategoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("skills").optional({ nullable: true }).isArray(),
  body("minBudget").optional().isFloat({ min: 0.01 }),
  body("maxBudget").optional().isFloat({ min: 0.01 }),
  body("minDuration").optional().isInt({ min: 1 }),
  body("maxDuration").optional().isInt({ min: 1 }),
  body("durationUnit").optional().isIn(["days", "hours", "minutes"]),
  body("isActive").optional().isBoolean(),
];

const createRoundValidators = [
  body("title").optional().isString().trim().isLength({ min: 2, max: 200 }),
  body("templateIds").optional().isArray(),
  body("templateIds.*").optional().isInt({ min: 1 }),
];

const listRoundsValidators = [query("status").optional().isIn(["scheduled", "active", "expired", "stopped"])];
const listTemplatesValidators = [
  query("includeInactive").optional().isIn(["true", "false"]),
  query("page").optional().isInt({ min: 1 }),
  query("pageSize").optional().isInt({ min: 1, max: 100 }),
];

const updateSettingsValidators = [
  body("minOrders").optional().isInt({ min: 1, max: 1000 }),
  body("maxOrders").optional().isInt({ min: 1, max: 1000 }),
  body("durationValue").optional().isInt({ min: 1, max: 10000 }),
  body("durationUnit").optional().isIn(["minutes", "hours", "days"]),
  body("planIds").optional().isArray(),
  body("planIds.*").optional().isInt({ min: 1 }),
  body("showToAllFreelancers").optional().isBoolean(),
  body("categoryDistribution").optional().isObject(),
  body("categoryDistribution.content").optional().isInt({ min: 0, max: 100 }),
  body("categoryDistribution.programming").optional().isInt({ min: 0, max: 100 }),
  body("categoryDistribution.design").optional().isInt({ min: 0, max: 100 }),
];

module.exports = {
  roundIdParam,
  templateIdParam,
  createTemplateValidators,
  updateTemplateValidators,
  createRoundValidators,
  listRoundsValidators,
  listTemplatesValidators,
  updateSettingsValidators,
};
