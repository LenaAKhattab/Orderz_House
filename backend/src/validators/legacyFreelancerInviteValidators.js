const { body, param } = require("express-validator");

const campaignIdParam = [param("campaignId").isInt({ min: 1 }).withMessage("معرف الحملة غير صالح.")];
const userIdParam = [param("userId").isInt({ min: 1 }).withMessage("معرف المستخدم غير صالح.")];

const campaignSlugParam = [
  param("campaignSlug")
    .trim()
    .isLength({ min: 3, max: 120 })
    .matches(/^[a-z0-9-]+$/i)
    .withMessage("رابط الحملة غير صالح."),
];

const createCampaignValidators = [
  body("name").trim().isLength({ min: 2, max: 200 }).withMessage("اسم الحملة مطلوب."),
  body("slug").optional({ nullable: true }).trim().isLength({ min: 3, max: 120 }),
  body("maxRedemptions").isInt({ min: 1, max: 100000 }).withMessage("عدد المقاعد غير صالح."),
  body("expiresAt").isISO8601().withMessage("تاريخ الانتهاء غير صالح."),
  body("defaultPlanCode").optional({ nullable: true }).trim().isLength({ max: 80 }),
  body("defaultTrustLevel").optional({ nullable: true }).isIn(["APPROVED", "TRUSTED"]),
  body("defaultCategoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("notes").optional({ nullable: true }).isString().isLength({ max: 4000 }),
  body("isActive").optional().isBoolean(),
  body("institutionId").optional({ nullable: true }),
  body("institution_id").optional({ nullable: true }),
];

const updateCampaignValidators = [
  ...campaignIdParam,
  body("name").optional().trim().isLength({ min: 2, max: 200 }),
  body("slug").optional({ nullable: true }).trim().isLength({ min: 3, max: 120 }),
  body("maxRedemptions").optional().isInt({ min: 1, max: 100000 }),
  body("expiresAt").optional().isISO8601(),
  body("defaultPlanCode").optional({ nullable: true }).trim().isLength({ max: 80 }),
  body("defaultTrustLevel").optional({ nullable: true }).isIn(["APPROVED", "TRUSTED"]),
  body("defaultCategoryId").optional({ nullable: true }),
  body("notes").optional({ nullable: true }).isString().isLength({ max: 4000 }),
  body("isActive").optional().isBoolean(),
  body("requireIdFront").optional().isBoolean(),
  body("requireIdBack").optional().isBoolean(),
  body("require_id_front").optional().isBoolean(),
  body("require_id_back").optional().isBoolean(),
  body("institutionId").optional({ nullable: true }),
  body("institution_id").optional({ nullable: true }),
];

const registerLegacyValidators = [
  body("campaignSlug").trim().isLength({ min: 3, max: 120 }).withMessage("رابط الحملة مطلوب."),
  body("token").trim().isLength({ min: 16, max: 200 }).withMessage("رمز الدعوة مطلوب."),
  body("fullName").optional({ nullable: true }).trim().isLength({ min: 2, max: 200 }),
  body("firstName").optional({ nullable: true }).trim().isLength({ min: 1, max: 120 }),
  body("fatherName").optional({ nullable: true }).trim().isLength({ min: 1, max: 120 }),
  body("familyName").optional({ nullable: true }).trim().isLength({ min: 1, max: 120 }),
  body("email").trim().isEmail().withMessage("البريد الإلكتروني غير صالح."),
  body("password").isLength({ min: 8, max: 128 }).withMessage("كلمة المرور قصيرة جداً."),
  body("passwordConfirm").optional().isLength({ min: 8, max: 128 }),
  body("termsAccepted").custom((v) => v === true || v === "true" || v === 1 || v === "1"),
  body("privacyAccepted").custom((v) => v === true || v === "true" || v === 1 || v === "1"),
  body("answers")
    .optional({ nullable: true })
    .custom((v) => v == null || typeof v === "object" || typeof v === "string")
    .withMessage("حقول الإجابات غير صالحة."),
  body("signedDocumentTypeIds").optional({ nullable: true }),
  body("signed_document_type_ids").optional({ nullable: true }),
  body("identityLast4").optional({ nullable: true }).isString().isLength({ max: 8 }),
  body("internalReference").optional({ nullable: true }).isString().isLength({ max: 120 }),
  body("city").optional({ nullable: true }).isString().isLength({ max: 120 }),
  body("country").optional({ nullable: true }).isString().isLength({ min: 2, max: 2 }),
  body("gender").optional({ nullable: true }).isString().isLength({ max: 24 }),
  body("categoryId").optional({ nullable: true }).isInt({ min: 1 }),
  body("specialty").optional({ nullable: true }).isString().isLength({ max: 120 }),
];

module.exports = {
  campaignIdParam,
  userIdParam,
  campaignSlugParam,
  createCampaignValidators,
  updateCampaignValidators,
  registerLegacyValidators,
};
