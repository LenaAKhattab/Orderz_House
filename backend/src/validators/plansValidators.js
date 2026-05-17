const { body, param, query } = require("express-validator");
const { parseJsonArray, parseInstallmentPlan } = require("../utils/planFields");

const planIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid plan id.")];

const listPlansValidators = [
  query("includeDeleted").optional().isBoolean().withMessage("includeDeleted must be boolean."),
];

function optionalStringArray(fieldName) {
  return body(fieldName)
    .optional()
    .custom((value) => {
      if (value === null) return true;
      const arr = parseJsonArray(value);
      if (arr.length > 50) throw new Error(`${fieldName} must have at most 50 items.`);
      for (const item of arr) {
        if (item.length > 500) throw new Error(`${fieldName} items must be at most 500 characters.`);
      }
      return true;
    });
}

function optionalInstallmentPlan() {
  return body("installmentPlan")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null) return true;
      const plan = parseInstallmentPlan(value);
      if (!plan) throw new Error("installmentPlan must be an object with upfrontJod, monthlyJod, and/or months.");
      if (plan.upfrontJod != null && (plan.upfrontJod < 0 || plan.upfrontJod > 1_000_000)) {
        throw new Error("installmentPlan.upfrontJod out of range.");
      }
      if (plan.monthlyJod != null && (plan.monthlyJod < 0 || plan.monthlyJod > 1_000_000)) {
        throw new Error("installmentPlan.monthlyJod out of range.");
      }
      if (plan.months != null && (plan.months < 1 || plan.months > 120)) {
        throw new Error("installmentPlan.months must be 1..120.");
      }
      return true;
    });
}

const extendedPlanFields = [
  optionalStringArray("features"),
  optionalStringArray("trainings"),
  body("paymentNotes").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  optionalInstallmentPlan(),
  body("offerExpiresAt")
    .optional({ nullable: true })
    .isISO8601({ strict: false })
    .withMessage("offerExpiresAt must be a valid date."),
  body("offerLabel").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body("orderValueMinJod").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("orderValueMinJod must be >= 0."),
  body("orderValueMaxJod").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("orderValueMaxJod must be >= 0."),
  body("activationRequirements").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("refundPolicy").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("adminNotes").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("isPopular").optional().isBoolean().withMessage("isPopular must be boolean."),
  body("isFeatured").optional().isBoolean().withMessage("isFeatured must be boolean."),
  body("stripeCheckoutAmountJod")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("stripeCheckoutAmountJod must be >= 0."),
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
  body("selfSubscribeAllowed").optional().isBoolean().withMessage("selfSubscribeAllowed must be boolean."),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean."),
  body("isVisible").optional().isBoolean().withMessage("isVisible must be boolean."),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }).withMessage("sortOrder must be an integer."),
  ...extendedPlanFields,
];

const updatePlanValidators = [
  ...planIdParam,
  body("title").optional().isString().trim().isLength({ min: 2, max: 140 }).withMessage("Invalid title."),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("Invalid description."),
  body("durationDays").optional().isInt({ min: 1, max: 3650 }).withMessage("durationDays must be 1..3650."),
  body("priceJod").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("priceJod must be >= 0."),
  body("requiresCompanyVisit").optional().isBoolean().withMessage("requiresCompanyVisit must be boolean."),
  body("selfSubscribeAllowed").optional().isBoolean().withMessage("selfSubscribeAllowed must be boolean."),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean."),
  body("isVisible").optional().isBoolean().withMessage("isVisible must be boolean."),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }).withMessage("sortOrder must be an integer."),
  ...extendedPlanFields,
];

module.exports = {
  planIdParam,
  listPlansValidators,
  createPlanValidators,
  updatePlanValidators,
};
