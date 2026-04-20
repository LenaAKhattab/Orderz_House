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
  "+966", // SA
  "+971", // AE
  "+965", // KW
  "+974", // QA
  "+973", // BH
  "+968", // OM
  "+962", // JO
  "+970", // PS
  "+961", // LB
  "+963", // SY
  "+964", // IQ
  "+20", // EG
  "+218", // LY
  "+216", // TN
  "+213", // DZ
  "+212", // MA
  "+249", // SD
  "+222", // MR
  "+967", // YE
  "+252", // SO
  "+253", // DJ
  "+269", // KM
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
    .withMessage("First name is required.")
    .matches(/^[\u0600-\u06FF\s]+$/)
    .withMessage("First name must be Arabic letters only.")
    .isLength({ max: 80 })
    .withMessage("First name is too long."),
  body("fatherName")
    .trim()
    .notEmpty()
    .withMessage("Father name is required.")
    .matches(/^[\u0600-\u06FF\s]+$/)
    .withMessage("Father name must be Arabic letters only.")
    .isLength({ max: 80 })
    .withMessage("Father name is too long."),
  body("familyName")
    .trim()
    .notEmpty()
    .withMessage("Family name is required.")
    .matches(/^[\u0600-\u06FF\s]+$/)
    .withMessage("Family name must be Arabic letters only.")
    .isLength({ max: 80 })
    .withMessage("Family name is too long."),
  body("email").trim().notEmpty().withMessage("Email is required.").isEmail().withMessage("Invalid email format."),
  body("password")
    .notEmpty()
    .withMessage("Password is required.")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters.")
    .matches(/[A-Za-z]/)
    .withMessage("Password must include at least one letter.")
    .matches(/[0-9]/)
    .withMessage("Password must include at least one number."),
  body("confirmPassword").custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error("Passwords do not match.");
    }
    return true;
  }),
  body("accountType")
    .isIn(["client", "freelancer"])
    .withMessage("Account type must be client or freelancer."),
  body("country")
    .trim()
    .notEmpty()
    .withMessage("Country is required.")
    .matches(/^[A-Z]{2}$/)
    .withMessage("Country must be a 2-letter code."),
  body("country").custom((value) => {
    const v = String(value || "").trim().toUpperCase();
    if (!ARAB_COUNTRY_CODES.has(v)) {
      throw new Error("Country must be an allowed Arab country.");
    }
    return true;
  }),
  body("phone.countryCode")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("Phone country code is required.")
    .matches(/^\+\d{1,4}$/)
    .withMessage("Invalid phone country code."),
  body("phone.countryCode").custom((value) => {
    const v = normalizePhonePart(value);
    if (!ARAB_DIAL_CODES.has(v)) {
      throw new Error("Phone country code must be an allowed Arab country code.");
    }
    return true;
  }),
  body("phone.number")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("Phone number is required.")
    .matches(/^\d{4,14}$/)
    .withMessage("Invalid phone number."),
  body("phone").custom((_, { req }) => {
    const cc = normalizePhonePart(req.body?.phone?.countryCode);
    const num = normalizePhonePart(req.body?.phone?.number);
    const e164 = `${cc}${num}`;
    if (!phonePattern.test(e164)) {
      throw new Error("Phone must include country code in international format (e.g. +9665xxxxxxxx).");
    }
    return true;
  }),
  body("whatsApp.countryCode")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("WhatsApp country code is required.")
    .matches(/^\+\d{1,4}$/)
    .withMessage("Invalid WhatsApp country code."),
  body("whatsApp.countryCode").custom((value) => {
    const v = normalizePhonePart(value);
    if (!ARAB_DIAL_CODES.has(v)) {
      throw new Error("WhatsApp country code must be an allowed Arab country code.");
    }
    return true;
  }),
  body("whatsApp.number")
    .customSanitizer(normalizePhonePart)
    .notEmpty()
    .withMessage("WhatsApp number is required.")
    .matches(/^\d{4,14}$/)
    .withMessage("Invalid WhatsApp number."),
  body("whatsApp").custom((_, { req }) => {
    const cc = normalizePhonePart(req.body?.whatsApp?.countryCode);
    const num = normalizePhonePart(req.body?.whatsApp?.number);
    const e164 = `${cc}${num}`;
    if (!phonePattern.test(e164)) {
      throw new Error("WhatsApp must include country code in international format (e.g. +9665xxxxxxxx).");
    }
    return true;
  }),
  body("gender")
    .isIn(["ذكر", "أنثى"])
    .withMessage("Invalid gender value."),
  body("termsAccepted")
    .custom((v) => v === true || v === "true")
    .withMessage("You must accept the terms and conditions."),
  body("categories").custom((value, { req }) => {
    const { accountType } = req.body;
    if (accountType === "client") {
      if (value != null && Array.isArray(value) && value.length > 0) {
        throw new Error("Categories are only allowed for freelancer accounts.");
      }
      return true;
    }
    if (accountType === "freelancer") {
      if (!Array.isArray(value) || value.length === 0) {
        throw new Error("Select at least one category.");
      }
      const unique = [...new Set(value)];
      for (const c of unique) {
        if (!slugSet.has(c)) {
          throw new Error("Invalid category selection.");
        }
      }
    }
    return true;
  }),
];

const loginValidators = [
  body("email").trim().notEmpty().withMessage("Email is required.").isEmail().withMessage("Invalid email format."),
  body("password").notEmpty().withMessage("Password is required."),
];

module.exports = {
  registerValidators,
  loginValidators,
};
