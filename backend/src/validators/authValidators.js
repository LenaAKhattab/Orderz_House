const { body } = require("express-validator");
const { FREELANCER_CATEGORY_SLUGS } = require("../constants/roles");

const slugSet = new Set(FREELANCER_CATEGORY_SLUGS);

/** E.164-style: leading +, country code, subscriber number (8–15 digits after +). */
const phonePattern = /^\+[1-9]\d{7,14}$/;

const ARAB_COUNTRY_CODES = new Set([
  "SA",
  "AE",
  "KW",
  "QA",
  "BH",
  "OM",
  "JO",
  "PS",
  "LB",
  "SY",
  "IQ",
  "EG",
  "LY",
  "TN",
  "DZ",
  "MA",
  "SD",
  "MR",
  "YE",
  "SO",
  "DJ",
  "KM",
]);

const ARAB_DIAL_CODES = new Set([
  "+966",
  "+971",
  "+965",
  "+974",
  "+973",
  "+968",
  "+962",
  "+970",
  "+961",
  "+963",
  "+964",
  "+20",
  "+218",
  "+216",
  "+213",
  "+212",
  "+249",
  "+222",
  "+967",
  "+252",
  "+253",
  "+269",
]);

function normalizePhonePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

const registerValidators = [
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("الاسم الأول مطلوب.")
    .matches(/^[\u0600-\u06FF\s]+$/)
    .withMessage("الاسم الأول يجب أن يكون بالعربية فقط.")
    .isLength({ max: 80 })
    .withMessage("الاسم الأول طويل جداً."),
  body("fatherName")
    .trim()
    .notEmpty()
    .withMessage("اسم الأب مطلوب.")
    .matches(/^[\u0600-\u06FF\s]+$/)
    .withMessage("اسم الأب يجب أن يكون بالعربية فقط.")
    .isLength({ max: 80 })
    .withMessage("اسم الأب طويل جداً."),
  body("familyName")
    .trim()
    .notEmpty()
    .withMessage("اسم العائلة مطلوب.")
    .matches(/^[\u0600-\u06FF\s]+$/)
    .withMessage("اسم العائلة يجب أن يكون بالعربية فقط.")
    .isLength({ max: 80 })
    .withMessage("اسم العائلة طويل جداً."),
  body("email").trim().notEmpty().withMessage("البريد الإلكتروني مطلوب.").isEmail().withMessage("صيغة البريد الإلكتروني غير صالحة."),
  body("password")
    .notEmpty()
    .withMessage("كلمة المرور مطلوبة.")
    .isLength({ min: 8, max: 128 })
    .withMessage("كلمة المرور يجب أن تكون بين 8 و 128 حرفاً.")
    .matches(/[A-Za-z]/)
    .withMessage("كلمة المرور يجب أن تحتوي حرفاً إنجليزياً على الأقل.")
    .matches(/[0-9]/)
    .withMessage("كلمة المرور يجب أن تحتوي رقماً على الأقل."),
  body("confirmPassword").custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error("تأكيد كلمة المرور غير مطابق.");
    }
    return true;
  }),
  body("accountType")
    .isIn(["client", "freelancer"])
    .withMessage("نوع الحساب يجب أن يكون عميلاً أو مستقلاً."),
  body("country")
    .trim()
    .notEmpty()
    .withMessage("الدولة مطلوبة.")
    .matches(/^[A-Z]{2}$/)
    .withMessage("رمز الدولة يجب أن يكون حرفين."),
  body("country").custom((value) => {
    const v = String(value || "").trim().toUpperCase();
    if (!ARAB_COUNTRY_CODES.has(v)) {
      throw new Error("الدولة يجب أن تكون من الدول العربية المسموحة.");
    }
    return true;
  }),
  body("phone.countryCode")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("رمز الدولة للجوال مطلوب.")
    .matches(/^\+\d{1,4}$/)
    .withMessage("رمز الدولة للجوال غير صالح."),
  body("phone.countryCode").custom((value) => {
    const v = normalizePhonePart(value);
    if (!ARAB_DIAL_CODES.has(v)) {
      throw new Error("رمز الاتصال للجوال يجب أن يكون مسموحاً.");
    }
    return true;
  }),
  body("phone.number")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("رقم الجوال مطلوب.")
    .matches(/^\d{4,14}$/)
    .withMessage("رقم الجوال غير صالح."),
  body("phone").custom((_, { req }) => {
    const cc = normalizePhonePart(req.body?.phone?.countryCode);
    const num = normalizePhonePart(req.body?.phone?.number);
    const e164 = `${cc}${num}`;
    if (!phonePattern.test(e164)) {
      throw new Error("رقم الجوال يجب أن يكون بالصيغة الدولية (مثال: +9665xxxxxxxx).");
    }
    return true;
  }),
  body("whatsApp.countryCode")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("رمز الدولة لواتساب مطلوب.")
    .matches(/^\+\d{1,4}$/)
    .withMessage("رمز الدولة لواتساب غير صالح."),
  body("whatsApp.countryCode").custom((value) => {
    const v = normalizePhonePart(value);
    if (!ARAB_DIAL_CODES.has(v)) {
      throw new Error("رمز الاتصال لواتساب يجب أن يكون مسموحاً.");
    }
    return true;
  }),
  body("whatsApp.number")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("رقم واتساب مطلوب.")
    .matches(/^\d{4,14}$/)
    .withMessage("رقم واتساب غير صالح."),
  body("whatsApp").custom((_, { req }) => {
    const cc = normalizePhonePart(req.body?.whatsApp?.countryCode);
    const num = normalizePhonePart(req.body?.whatsApp?.number);
    const e164 = `${cc}${num}`;
    if (!phonePattern.test(e164)) {
      throw new Error("رقم واتساب يجب أن يكون بالصيغة الدولية (مثال: +9665xxxxxxxx).");
    }
    return true;
  }),
  body("gender")
    .isIn(["ذكر", "أنثى"])
    .withMessage("قيمة الجنس غير صالحة."),
  body("termsAccepted")
    .custom((v) => v === true || v === "true")
    .withMessage("يجب الموافقة على الشروط والأحكام."),
  body("categories").custom((value, { req }) => {
    const { accountType } = req.body;
    if (accountType === "client") {
      if (value != null && Array.isArray(value) && value.length > 0) {
        throw new Error("التصنيفات مسموحة لمستقلين فقط.");
      }
      return true;
    }
    if (accountType === "freelancer") {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error("اختر تصنيفاً واحداً على الأقل.");
      }
      const unique = [...new Set(value)];
      for (const c of unique) {
        if (!slugSet.has(c)) {
          throw new Error("اختيار التصنيف غير صالح.");
        }
      }
    }
    return true;
  }),
];

const loginValidators = [
  body("email").trim().notEmpty().withMessage("البريد الإلكتروني مطلوب.").isEmail().withMessage("صيغة البريد الإلكتروني غير صالحة."),
  body("password").notEmpty().withMessage("كلمة المرور مطلوبة."),
];

const verifyRegisterOtpValidators = [
  body("email").trim().notEmpty().withMessage("البريد الإلكتروني مطلوب.").isEmail().withMessage("صيغة البريد الإلكتروني غير صالحة."),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("رمز التحقق مطلوب.")
    .matches(/^\d{6}$/)
    .withMessage("رمز التحقق يجب أن يكون 6 أرقام."),
];

const resendRegisterOtpValidators = [
  body("email").trim().notEmpty().withMessage("البريد الإلكتروني مطلوب.").isEmail().withMessage("صيغة البريد الإلكتروني غير صالحة."),
];

const forgotPasswordValidators = [
  body("email").trim().notEmpty().withMessage("البريد الإلكتروني مطلوب.").isEmail().withMessage("صيغة البريد الإلكتروني غير صالحة."),
];

const verifyForgotPasswordOtpValidators = [
  body("email").trim().notEmpty().withMessage("البريد الإلكتروني مطلوب.").isEmail().withMessage("صيغة البريد الإلكتروني غير صالحة."),
  body("otp")
    .trim()
    .notEmpty()
    .withMessage("رمز التحقق مطلوب.")
    .matches(/^\d{6}$/)
    .withMessage("رمز التحقق يجب أن يكون 6 أرقام."),
];

const resetPasswordValidators = [
  body("email").trim().notEmpty().withMessage("البريد الإلكتروني مطلوب.").isEmail().withMessage("صيغة البريد الإلكتروني غير صالحة."),
  body("resetToken").trim().notEmpty().withMessage("رمز إعادة التعيين مطلوب."),
  body("newPassword")
    .notEmpty()
    .withMessage("كلمة المرور الجديدة مطلوبة.")
    .isLength({ min: 8, max: 128 })
    .withMessage("كلمة المرور يجب أن تكون بين 8 و 128 حرفاً.")
    .matches(/[A-Za-z]/)
    .withMessage("كلمة المرور يجب أن تحتوي حرفاً إنجليزياً على الأقل.")
    .matches(/[0-9]/)
    .withMessage("كلمة المرور يجب أن تحتوي رقماً على الأقل."),
];

module.exports = {
  registerValidators,
  loginValidators,
  verifyRegisterOtpValidators,
  resendRegisterOtpValidators,
  forgotPasswordValidators,
  verifyForgotPasswordOtpValidators,
  resetPasswordValidators,
};
