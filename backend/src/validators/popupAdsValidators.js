const { body, param, query } = require("express-validator");

const popupAdBodyValidators = [
  body("enabled").optional().isBoolean().withMessage("enabled must be a boolean"),
  body("titleAr").optional().isString().withMessage("titleAr must be a string"),
  body("titleEn").optional().isString().withMessage("titleEn must be a string"),
  body("bodyAr").optional().isString().withMessage("bodyAr must be a string"),
  body("bodyEn").optional().isString().withMessage("bodyEn must be a string"),
  body("imageUrl").optional({ nullable: true }).isString().withMessage("imageUrl must be a string"),
  body("ctaText").optional({ nullable: true }).isString().withMessage("ctaText must be a string"),
  body("ctaTextEn").optional({ nullable: true }).isString().withMessage("ctaTextEn must be a string"),
  body("ctaUrl").optional({ nullable: true }).isString().withMessage("ctaUrl must be a string"),
  body("openInNewTab").optional().isBoolean().withMessage("openInNewTab must be a boolean"),
  body("audience")
    .optional()
    .isIn(["all", "guests", "freelancer", "client", "staff"])
    .withMessage("invalid audience"),
  body("pageScope")
    .optional()
    .isIn(["all", "home", "public", "dashboard"])
    .withMessage("invalid pageScope"),
  body("frequency")
    .optional()
    .isIn(["every_visit", "session", "day", "first_login_only", "every_login"])
    .withMessage("invalid frequency"),
  body("sortOrder").optional().isInt({ min: 0 }).withMessage("invalid sortOrder"),
  body("startDate").optional({ nullable: true }).isISO8601().withMessage("invalid startDate"),
  body("endDate").optional({ nullable: true }).isISO8601().withMessage("invalid endDate"),
];

const popupAdIdParam = [param("id").isInt({ min: 1 }).withMessage("invalid ad id")];

const publicListPopupAdsValidators = [
  query("pathname").optional().isString().withMessage("pathname must be a string"),
];

const publicPopupAdEventValidators = [param("id").isInt({ min: 1 }).withMessage("invalid ad id")];

module.exports = {
  popupAdBodyValidators,
  popupAdIdParam,
  publicListPopupAdsValidators,
  publicPopupAdEventValidators,
};
