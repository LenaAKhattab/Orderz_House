const { body, param, query } = require("express-validator");

const PLACEMENTS = ["home_right_panel", "home_after_hero", "services_page", "global_sidebar"];
const THEME_PRESETS = [
  "purple",
  "green",
  "orange",
  "blue",
  "banner_1",
  "banner_2",
  "banner_3",
  "banner_4",
  "banner_5",
  "classic_split",
  "product_focus",
  "luxury_center",
  "ribbon_strip",
  "business_partner",
  "minimal_clean",
];
const LAYOUT_TYPES = [
  "image_top",
  "image_background",
  "text_only",
  "split",
  "minimal_banner",
  "carousel",
];

const adIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الإعلان غير صالح.")];

const publicListAdsValidators = [
  query("placement").optional().isString().isIn(PLACEMENTS).withMessage("موضع العرض غير صالح."),
];

const publicAdEventValidators = [
  ...adIdParam,
  query("placement").optional().isString().isIn(PLACEMENTS).withMessage("موضع العرض غير صالح."),
];

const createAdValidators = [
  body("title").isString().trim().isLength({ min: 1, max: 500 }).withMessage("العنوان مطلوب."),
  body("subtitle").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body("description").optional({ nullable: true }).isString().isLength({ max: 8000 }),
  body("badgeText").optional({ nullable: true }).isString().isLength({ max: 200 }),
  body("badgeColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("texts").optional().isArray(),
  body("images").optional().isArray(),
  body("ctaText").optional({ nullable: true }).isString().isLength({ max: 200 }),
  body("ctaUrl").optional({ nullable: true }).isString().isLength({ max: 2048 }),
  body("secondaryCtaText").optional({ nullable: true }).isString().isLength({ max: 200 }),
  body("secondaryCtaUrl").optional({ nullable: true }).isString().isLength({ max: 2048 }),
  body("openInNewTab").optional().isBoolean(),
  body("backgroundColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("gradientFrom").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("gradientTo").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("titleColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("textColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("buttonColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("buttonTextColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("borderColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("layoutType").optional().isString().isIn(LAYOUT_TYPES),
  body("textAlign").optional().isString().isIn(["right", "center", "left"]),
  body("imagePosition").optional().isString().isIn(["top", "bottom", "left", "right", "background"]),
  body("buttonPosition").optional().isString().isIn(["bottom", "inline", "overlay"]),
  body("isActive").optional().isBoolean(),
  body("isSticky").optional().isBoolean(),
  body("isClickableCard").optional().isBoolean(),
  body("placement").optional().isString().isIn(PLACEMENTS),
  body("sortOrder").optional().isInt(),
  body("startDate").optional({ nullable: true }).isISO8601().toDate(),
  body("endDate").optional({ nullable: true }).isISO8601().toDate(),
  body("isFeatured").optional().isBoolean(),
  body("themePreset")
    .optional({ nullable: true })
    .custom((v) => v == null || v === "" || THEME_PRESETS.includes(String(v).toLowerCase()))
    .withMessage("قالب العرض أو نمط الألوان غير صالح."),
];

const updateAdValidators = [
  ...adIdParam,
  body("title").optional().isString().trim().isLength({ min: 1, max: 500 }),
  body("subtitle").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body("description").optional({ nullable: true }).isString().isLength({ max: 8000 }),
  body("badgeText").optional({ nullable: true }).isString().isLength({ max: 200 }),
  body("badgeColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("texts").optional().isArray(),
  body("images").optional().isArray(),
  body("ctaText").optional({ nullable: true }).isString().isLength({ max: 200 }),
  body("ctaUrl").optional({ nullable: true }).isString().isLength({ max: 2048 }),
  body("secondaryCtaText").optional({ nullable: true }).isString().isLength({ max: 200 }),
  body("secondaryCtaUrl").optional({ nullable: true }).isString().isLength({ max: 2048 }),
  body("openInNewTab").optional().isBoolean(),
  body("backgroundColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("gradientFrom").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("gradientTo").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("titleColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("textColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("buttonColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("buttonTextColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("borderColor").optional({ nullable: true }).isString().isLength({ max: 64 }),
  body("layoutType").optional().isString().isIn(LAYOUT_TYPES),
  body("textAlign").optional().isString().isIn(["right", "center", "left"]),
  body("imagePosition").optional().isString().isIn(["top", "bottom", "left", "right", "background"]),
  body("buttonPosition").optional().isString().isIn(["bottom", "inline", "overlay"]),
  body("isActive").optional().isBoolean(),
  body("isSticky").optional().isBoolean(),
  body("isClickableCard").optional().isBoolean(),
  body("placement").optional().isString().isIn(PLACEMENTS),
  body("sortOrder").optional().isInt(),
  body("startDate").optional({ nullable: true }).isISO8601().toDate(),
  body("endDate").optional({ nullable: true }).isISO8601().toDate(),
  body("isFeatured").optional().isBoolean(),
  body("themePreset")
    .optional({ nullable: true })
    .custom((v) => v == null || v === "" || THEME_PRESETS.includes(String(v).toLowerCase()))
    .withMessage("قالب العرض أو نمط الألوان غير صالح."),
];

const adminNoteBody = body("adminNote")
  .isString()
  .trim()
  .isLength({ min: 3, max: 500 })
  .withMessage("سبب الإجراء مطلوب (3–500 حرف).");

const reorderAdsValidators = [
  body("placement").optional().isString().isIn(PLACEMENTS),
  body("items").isArray({ min: 1 }).withMessage("قائمة الترتيب مطلوبة."),
  body("items.*.id").isInt({ min: 1 }),
  body("items.*.sortOrder").isInt(),
  adminNoteBody,
];

const deleteAdValidators = [...adIdParam, adminNoteBody];

const createAdValidatorsWithNote = [...createAdValidators, adminNoteBody];
const updateAdValidatorsWithNote = [...updateAdValidators, adminNoteBody];
const duplicateAdValidatorsWithNote = [...adIdParam, adminNoteBody];

module.exports = {
  adIdParam,
  publicListAdsValidators,
  publicAdEventValidators,
  createAdValidators,
  updateAdValidators,
  createAdValidatorsWithNote,
  updateAdValidatorsWithNote,
  reorderAdsValidators,
  deleteAdValidators,
  duplicateAdValidators: adIdParam,
  duplicateAdValidatorsWithNote,
};
