const { body } = require("express-validator");
const { SPECIAL_OFFER_PURCHASE_MODE } = require("../constants/specialOfferPackage");

const updateSpecialOfferValidators = [
  body("title").optional().isString().trim().isLength({ min: 1, max: 120 }),
  body("subtitle").optional({ nullable: true }).isString().trim().isLength({ max: 400 }),
  body("badgeText").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("ribbonText").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("priceJod").optional().isFloat({ min: 0, max: 100000 }),
  body("originalPriceJod").optional({ nullable: true }).isFloat({ min: 0, max: 100000 }),
  body("totalOffers").optional().isInt({ min: 1, max: 100000 }),
  body("dailyLimit").optional().isInt({ min: 1, max: 100000 }),
  body("durationDays").optional().isInt({ min: 1, max: 100000 }),
  body("maxProjectValueJod").optional({ nullable: true }).isFloat({ min: 0, max: 100000 }),
  body("articleAccessLevel").optional().isInt({ min: 1, max: 5 }),
  body("accessLevelKey")
    .optional({ nullable: true })
    .isString()
    .trim()
    .customSanitizer((v) => String(v || "").trim().toLowerCase())
    .isIn(["starter", "silver", "pro", "elite"]),
  body("ctaLabel").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("microcopy").optional({ nullable: true }).isString().trim().isLength({ max: 240 }),
  body("whatsappMessageAr").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  body("linkedMarketplacePlanId").optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
  body("linkedPlanCode").optional({ nullable: true }).isString().trim().isLength({ max: 40 }),
  body("purchaseMode")
    .optional()
    .isString()
    .trim()
    .customSanitizer((v) => String(v || "").trim().toLowerCase())
    .isIn([SPECIAL_OFFER_PURCHASE_MODE.CHECKOUT, SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP]),
  body("isVisible").optional().isBoolean(),
];

const visibilityValidators = [
  body("isVisible").isBoolean().withMessage("isVisible must be boolean."),
];

module.exports = {
  updateSpecialOfferValidators,
  visibilityValidators,
};
