const { body, param } = require("express-validator");
const { CONDITION_KEYS, EVENT_TYPES, ITEM_TYPES, PLACEMENTS } = require("../constants/onboarding");

const itemIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف العنصر غير صالح.")];

const postEventValidators = [
  body("eventType")
    .isString()
    .trim()
    .isIn(EVENT_TYPES)
    .withMessage("نوع الحدث غير صالح."),
  body("itemId")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      return Number.isInteger(Number(value)) && Number(value) > 0;
    })
    .withMessage("معرّف العنصر غير صالح."),
];

const upsertItemValidators = [
  body("title").isString().trim().isLength({ min: 1, max: 300 }).withMessage("العنوان مطلوب."),
  body("body").isString().trim().isLength({ min: 1, max: 8000 }).withMessage("النص مطلوب."),
  body("conditionKey").isString().trim().isIn(CONDITION_KEYS).withMessage("مفتاح الشرط غير مدعوم."),
  body("itemType").optional().isString().trim().isIn(ITEM_TYPES),
  body("placement").optional().isString().trim().isIn(PLACEMENTS),
  body("ctaUrl")
    .optional({ nullable: true })
    .custom((value) => {
      if (!value) return true;
      const url = String(value).trim();
      return url.startsWith("/") && !url.startsWith("//") && !url.includes("://");
    })
    .withMessage("رابط الإجراء يجب أن يكون مسارًا داخليًا."),
];

const createItemValidators = [
  body("key")
    .isString()
    .trim()
    .matches(/^[a-z0-9_]{2,80}$/)
    .withMessage("المفتاح غير صالح."),
  ...upsertItemValidators,
];

module.exports = {
  itemIdParam,
  postEventValidators,
  createItemValidators,
  upsertItemValidators,
};
