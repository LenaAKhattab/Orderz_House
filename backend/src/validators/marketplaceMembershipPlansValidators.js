const { body, param } = require("express-validator");
const { isValidMarketplaceTierCode } = require("../constants/marketplaceMembershipPlans");

const planIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid plan id.")];

const createMarketplaceMembershipPlanValidators = [
  body("tierCode")
    .exists()
    .withMessage("tierCode is required.")
    .bail()
    .isString()
    .trim()
    .custom((value) => {
      if (!isValidMarketplaceTierCode(value)) {
        throw new Error("tierCode must be lowercase snake_case (e.g. pay_as_you_work).");
      }
      return true;
    }),
  body("nameAr").exists().withMessage("nameAr is required.").bail().isString().trim().isLength({ min: 1, max: 200 }),
  body("nameEn").optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body("slug").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("descriptionAr").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("descriptionEn").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("isActive").optional().isBoolean().withMessage("isActive must be boolean."),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }).withMessage("sortOrder must be an integer."),
  body("monthlyPriceJod")
    .exists()
    .withMessage("monthlyPriceJod is required.")
    .bail()
    .isFloat({ min: 0 })
    .withMessage("monthlyPriceJod must be >= 0."),
  body("unlimitedRealOrderValue").optional().isBoolean(),
  body("maxRealOrderValueJod")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const unlimited = req.body?.unlimitedRealOrderValue === true;
      if (unlimited) {
        if (value != null && value !== "") {
          throw new Error("maxRealOrderValueJod must be null when unlimited.");
        }
        return true;
      }
      if (value == null || value === "") {
        throw new Error("maxRealOrderValueJod is required when not unlimited.");
      }
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error("maxRealOrderValueJod must be > 0.");
      }
      return true;
    }),
  body("includedTokensPerCycle")
    .optional()
    .isInt({ min: 0 })
    .withMessage("includedTokensPerCycle must be an integer >= 0."),
  body("cashAllowed").optional().isBoolean(),
  body("minimumCashMonths").optional().isInt({ min: 1 }).withMessage("minimumCashMonths must be >= 1."),
  body("maximumPrepaidMonths").optional().isInt({ min: 1 }).withMessage("maximumPrepaidMonths must be >= 1."),
  body("eliteDirectOrdersEnabled").optional().isBoolean(),
  body("saleEnabled").optional().isBoolean(),
  body("salePercentage")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      if (req.body?.saleEnabled !== true) return true;
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0 || n >= 100) {
        throw new Error("salePercentage must be > 0 and < 100 when sale is enabled.");
      }
      return true;
    }),
  body("saleReason").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body("saleReasonEn").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
];

const updateMarketplaceMembershipPlanValidators = [
  ...planIdParam,
  body("tierCode").not().exists().withMessage("tierCode cannot be changed."),
  body("nameAr").optional().isString().trim().isLength({ min: 1, max: 200 }),
  body("nameEn").optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body("slug").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("descriptionAr").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("descriptionEn").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("isActive").optional().isBoolean(),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }),
  body("monthlyPriceJod").optional().isFloat({ min: 0 }),
  body("unlimitedRealOrderValue").optional().isBoolean(),
  body("maxRealOrderValueJod").optional({ nullable: true }).isFloat({ min: 0 }),
  body("includedTokensPerCycle").optional().isInt({ min: 0 }),
  body("cashAllowed").optional().isBoolean(),
  body("minimumCashMonths").optional().isInt({ min: 1 }),
  body("maximumPrepaidMonths").optional().isInt({ min: 1 }),
  body("eliteDirectOrdersEnabled").optional().isBoolean(),
  body("saleEnabled").optional().isBoolean(),
  body("salePercentage").optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
  body("saleReason").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body("saleReasonEn").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
];

const reorderMarketplaceMembershipPlansValidators = [
  body("orderedIds")
    .isArray({ min: 1 })
    .withMessage("orderedIds must be a non-empty array.")
    .bail()
    .custom((arr) => {
      for (const id of arr) {
        const n = Number(id);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error("orderedIds must contain positive integers.");
        }
      }
      return true;
    }),
];

module.exports = {
  planIdParam,
  createMarketplaceMembershipPlanValidators,
  updateMarketplaceMembershipPlanValidators,
  reorderMarketplaceMembershipPlansValidators,
};
