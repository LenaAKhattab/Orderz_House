const { body, param } = require("express-validator");

const sitePageIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الصفحة غير صالح.")];

const sitePageSlugParam = [
  param("slug")
    .trim()
    .notEmpty()
    .withMessage("الرابط غير صالح.")
    .isLength({ max: 120 })
    .withMessage("الرابط طويل جداً.")
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("الرابط غير صالح."),
];

const updateSitePageValidators = [
  ...sitePageIdParam,
  body("title")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("العنوان لا يمكن أن يكون فارغاً.")
    .isLength({ max: 200 })
    .withMessage("العنوان طويل جداً."),
  body("menuLabel")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("اسم الرابط لا يمكن أن يكون فارغاً.")
    .isLength({ max: 120 })
    .withMessage("اسم الرابط طويل جداً."),
  body("content")
    .optional()
    .isString()
    .withMessage("المحتوى غير صالح.")
    .isLength({ max: 50000 })
    .withMessage("المحتوى طويل جداً."),
  body("metaTitle")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage("عنوان SEO طويل جداً."),
  body("metaDescription")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 320 })
    .withMessage("وصف SEO طويل جداً."),
  body("isPublished").optional().isBoolean().withMessage("حالة النشر غير صالحة."),
  body("showInMobileMenu").optional().isBoolean().withMessage("إظهار الموبايل غير صالح."),
  body("showInFooter").optional().isBoolean().withMessage("إظهار الفوتر غير صالح."),
  body("sortOrder").optional().isInt({ min: 0, max: 9999 }).withMessage("الترتيب غير صالح."),
];

module.exports = {
  sitePageIdParam,
  sitePageSlugParam,
  updateSitePageValidators,
};
