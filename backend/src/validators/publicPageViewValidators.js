const { body } = require("express-validator");

const recordPublicPageViewValidators = [
  body("path")
    .isString()
    .trim()
    .isLength({ min: 1, max: 2048 })
    .withMessage("مسار الصفحة مطلوب."),
  body("title").optional({ nullable: true }).isString().isLength({ max: 512 }),
  body("referrer").optional({ nullable: true }).isString().isLength({ max: 2048 }),
  body("idempotencyKey")
    .isString()
    .trim()
    .isLength({ min: 8, max: 128 })
    .withMessage("مفتاح منع التكرار غير صالح."),
  body("clientSessionId").optional({ nullable: true }).isString().isLength({ max: 128 }),
];

module.exports = {
  recordPublicPageViewValidators,
};
