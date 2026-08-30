const { body, param, query } = require("express-validator");

const articleIdParam = [
  param("id").isInt({ min: 1 }).withMessage("id must be a positive integer."),
];

const createMarketplaceArticleValidators = [
  body("title").isString().trim().isLength({ min: 1, max: 240 }),
  body("description").optional({ nullable: true }).isString(),
  body("brief").optional({ nullable: true }).isString(),
  body("targetPlanCode")
    .optional({ nullable: true })
    .isString()
    .custom((value) => {
      if (value == null || value === "") return true;
      const s = String(value).trim().toUpperCase();
      return ["STARTER", "SILVER", "PRO", "ELITE"].includes(s);
    })
    .withMessage("targetPlanCode must be STARTER|SILVER|PRO|ELITE."),
  body("planCode")
    .optional({ nullable: true })
    .isString(),
  body("articleLevel")
    .optional({ nullable: true })
    .isInt({ min: 1, max: 5 })
    .withMessage("articleLevel must be 1..5."),
  body("articleValueJod")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      if (value === undefined || value === null || value === "") return true;
      const level = Number(req.body?.articleLevel);
      if (!Number.isInteger(level)) return true;
      const expected = level;
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n - expected) > 0.0005) {
        throw new Error("articleValueJod must match articleLevel (1→1 … 5→5 JOD).");
      }
      return true;
    }),
  body("requiredWordCount")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("requiredWordCount must be a positive integer."),
  body("requiredReferencesCount")
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage("requiredReferencesCount must be >= 0."),
  body().custom((_, { req }) => {
    const plan =
      req.body?.targetPlanCode ||
      req.body?.target_plan_code ||
      req.body?.planCode ||
      req.body?.plan_code;
    const level = req.body?.articleLevel ?? req.body?.article_level;
    if (!plan && (level === undefined || level === null || level === "")) {
      throw new Error("targetPlanCode or articleLevel is required.");
    }
    if (!plan && (req.body?.requiredWordCount === undefined || req.body?.requiredWordCount === null)) {
      throw new Error("requiredWordCount is required when targetPlanCode is omitted.");
    }
    return true;
  }),
  body("status")
    .optional()
    .isIn(["draft", "published", "closed", "cancelled"]),
  body("categoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("subcategoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("isFakeOrTraining").optional().isBoolean(),
  body("requiredBidCount").isInt({ min: 1, max: 100 }).withMessage("requiredBidCount is required."),
  body("minRequiredBidsAcknowledged")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === undefined || value === null || value === "") return true;
      return value === true || value === "true" || value === 1 || value === "1";
    })
    .withMessage("يجب الإقرار بحد المناقصات الأدنى."),
  body("bidCollectionDurationHours")
    .optional({ nullable: true })
    .isInt({ min: 1, max: 168 })
    .withMessage("bidCollectionDurationHours must be 1–168."),
  body("visibilityDurationHours")
    .optional({ nullable: true })
    .isInt({ min: 1, max: 168 }),
  body("applicationDeadlineAt")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      return !Number.isNaN(new Date(value).getTime());
    })
    .withMessage("applicationDeadlineAt is invalid."),
  body("activationCampaignId").optional({ nullable: true }).isInt({ min: 1 }),
  body("activationWaveId").optional({ nullable: true }).isInt({ min: 1 }),
];

const updateMarketplaceArticleValidators = [
  ...articleIdParam,
  body("title").optional().isString().trim().isLength({ min: 1, max: 240 }),
  body("description").optional({ nullable: true }).isString(),
  body("brief").optional({ nullable: true }).isString(),
  body("targetPlanCode")
    .optional({ nullable: true })
    .isString()
    .custom((value) => {
      if (value == null || value === "") return true;
      const s = String(value).trim().toUpperCase();
      return ["STARTER", "SILVER", "PRO", "ELITE"].includes(s);
    }),
  body("planCode").optional({ nullable: true }).isString(),
  body("articleLevel").optional().isInt({ min: 1, max: 5 }),
  body("articleValueJod")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      if (value === undefined || value === null || value === "") return true;
      const level = Number(req.body?.articleLevel);
      if (!Number.isInteger(level)) return true;
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n - level) > 0.0005) {
        throw new Error("articleValueJod must match articleLevel (1→1 … 5→5 JOD).");
      }
      return true;
    }),
  body("requiredWordCount").optional().isInt({ min: 1 }),
  body("requiredReferencesCount").optional({ nullable: true }).isInt({ min: 0 }),
  body("status").optional().isIn(["draft", "published", "closed", "cancelled"]),
  body("categoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("subcategoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("isFakeOrTraining").optional().isBoolean(),
  body("requiredBidCount").optional().isInt({ min: 1, max: 100 }),
  body("minRequiredBidsAcknowledged").optional(),
  body("bidCollectionDurationHours").optional({ nullable: true }).isInt({ min: 1, max: 168 }),
  body("visibilityDurationHours").optional({ nullable: true }).isInt({ min: 1, max: 168 }),
  body("activationCampaignId").optional({ nullable: true }).isInt({ min: 1 }),
  body("activationWaveId").optional({ nullable: true }).isInt({ min: 1 }),
];

const listMarketplaceArticlesValidators = [
  query("status").optional().isIn(["draft", "published", "closed", "cancelled"]),
  query("articleLevel").optional().isInt({ min: 1, max: 5 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("offset").optional().isInt({ min: 0 }),
];

module.exports = {
  articleIdParam,
  createMarketplaceArticleValidators,
  updateMarketplaceArticleValidators,
  listMarketplaceArticlesValidators,
};
