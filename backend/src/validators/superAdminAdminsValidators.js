const { body, param } = require("express-validator");

const adminIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الأدمن غير صالح.")];

const createAdminValidators = [
  body("name").trim().isLength({ min: 2, max: 80 }).withMessage("الاسم يجب ألا يقل عن حرفين."),
  body("email").trim().isEmail().withMessage("البريد الإلكتروني غير صالح.").normalizeEmail(),
  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("كلمة المرور يجب ألا تقل عن 8 أحرف.")
    .matches(/(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage("كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل."),
  body("permissions").optional().isArray().withMessage("الصلاحيات يجب أن تكون مصفوفة."),
  body("permissions.*").optional().isString().withMessage("مفتاح الصلاحية غير صالح."),
];

const updateAdminValidators = [
  ...adminIdParam,
  body("name").optional().trim().isLength({ min: 2, max: 80 }).withMessage("الاسم يجب ألا يقل عن حرفين."),
  body("email").optional().trim().isEmail().withMessage("البريد الإلكتروني غير صالح.").normalizeEmail(),
  body("isActive").optional().isBoolean().withMessage("حالة الحساب غير صالحة."),
  body("permissions").optional().isArray().withMessage("الصلاحيات يجب أن تكون مصفوفة."),
  body("permissions.*").optional().isString().withMessage("مفتاح الصلاحية غير صالح."),
];

module.exports = {
  adminIdParam,
  createAdminValidators,
  updateAdminValidators,
};
