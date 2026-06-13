const { body, param } = require("express-validator");

const BLOCK_TYPES = ["title", "text", "image", "text_image"];

const pageSlugParam = [param("slug").trim().notEmpty().withMessage("المعرّف مطلوب.")];

const blockIdParam = [
  param("blockId").isInt({ min: 1 }).withMessage("معرّف المحتوى غير صالح."),
];

const updatePageValidators = [
  ...pageSlugParam,
  body("title").optional().trim().isLength({ min: 1, max: 300 }).withMessage("العنوان مطلوب (حتى 300 حرف)."),
  body("isActive").optional().isBoolean().withMessage("حالة الظهور غير صالحة."),
];

const createBlockValidators = [
  ...pageSlugParam,
  body("blockType")
    .trim()
    .isIn(BLOCK_TYPES)
    .withMessage("نوع المحتوى غير صالح."),
  body("title").optional({ nullable: true }).trim().isLength({ max: 500 }),
  body("body").optional({ nullable: true }).trim().isLength({ max: 10000 }),
  body("imageUrl").optional({ nullable: true }).trim().isLength({ max: 2000 }),
];

const updateBlockValidators = [
  ...pageSlugParam,
  ...blockIdParam,
  body("blockType").optional().trim().isIn(BLOCK_TYPES).withMessage("نوع المحتوى غير صالح."),
  body("title").optional({ nullable: true }).trim().isLength({ max: 500 }),
  body("body").optional({ nullable: true }).trim().isLength({ max: 10000 }),
  body("imageUrl").optional({ nullable: true }).trim().isLength({ max: 2000 }),
  body("isActive").optional().isBoolean().withMessage("حالة الظهور غير صالحة."),
];

const reorderBlocksValidators = [
  ...pageSlugParam,
  body("orderedIds")
    .isArray({ min: 1 })
    .withMessage("قائمة الترتيب مطلوبة.")
    .custom((arr) => arr.every((id) => Number.isInteger(Number(id)) && Number(id) > 0))
    .withMessage("معرّفات الترتيب غير صالحة."),
];

module.exports = {
  pageSlugParam,
  blockIdParam,
  updatePageValidators,
  createBlockValidators,
  updateBlockValidators,
  reorderBlocksValidators,
};
