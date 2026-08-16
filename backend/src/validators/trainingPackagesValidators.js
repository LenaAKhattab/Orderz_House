const { body, param } = require("express-validator");

const packageCodeParam = [
  param("code")
    .isString()
    .trim()
    .matches(/^[a-z0-9][a-z0-9_-]{1,39}$/)
    .withMessage("رمز الباقة غير صالح."),
];

const createTrainingPackageValidators = [
  body("code")
    .exists()
    .withMessage("رمز الباقة مطلوب.")
    .bail()
    .isString()
    .trim()
    .matches(/^[a-z0-9][a-z0-9_-]{1,39}$/)
    .withMessage("رمز الباقة غير صالح."),
  body("nameAr").exists().withMessage("اسم الباقة مطلوب.").bail().isString().trim().isLength({ min: 1, max: 120 }),
  body("priceJod").exists().withMessage("السعر مطلوب.").bail().isFloat({ min: 0, max: 100000 }),
  body("nameEn").optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body("shortDescAr").optional({ nullable: true }).isString().trim().isLength({ max: 400 }),
  body("shortDescEn").optional({ nullable: true }).isString().trim().isLength({ max: 400 }),
  body("featuresAr").optional().isArray({ max: 40 }),
  body("featuresEn").optional().isArray({ max: 40 }),
  body("accent").optional().isIn(["basic", "professional", "premium"]),
  body("featured").optional().isBoolean(),
  body("isVisible").optional().isBoolean(),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }),
  body("durationMonths").optional({ nullable: true }).isInt({ min: 1, max: 36 }),
  body("badgeAr").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("badgeEn").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("whatsappMessageAr").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const updateTrainingPackageValidators = [
  ...packageCodeParam,
  body("code").optional().isString().trim().matches(/^[a-z0-9][a-z0-9_-]{1,39}$/),
  body("nameAr").optional().isString().trim().isLength({ min: 1, max: 120 }),
  body("priceJod").optional().isFloat({ min: 0, max: 100000 }),
  body("nameEn").optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
  body("shortDescAr").optional({ nullable: true }).isString().trim().isLength({ max: 400 }),
  body("shortDescEn").optional({ nullable: true }).isString().trim().isLength({ max: 400 }),
  body("featuresAr").optional().isArray({ max: 40 }),
  body("featuresEn").optional().isArray({ max: 40 }),
  body("accent").optional().isIn(["basic", "professional", "premium"]),
  body("featured").optional().isBoolean(),
  body("isVisible").optional().isBoolean(),
  body("sortOrder").optional().isInt({ min: -100000, max: 100000 }),
  body("durationMonths").optional({ nullable: true }).isInt({ min: 1, max: 36 }),
  body("badgeAr").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("badgeEn").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  body("whatsappMessageAr").optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
];

const reorderTrainingPackagesValidators = [
  body("orderedCodes")
    .isArray({ min: 1 })
    .withMessage("ترتيب الباقات مطلوب."),
  body("orderedCodes.*").isString().trim().matches(/^[a-z0-9][a-z0-9_-]{1,39}$/),
];

module.exports = {
  packageCodeParam,
  createTrainingPackageValidators,
  updateTrainingPackageValidators,
  reorderTrainingPackagesValidators,
};
