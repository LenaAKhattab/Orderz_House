const { body } = require("express-validator");
const { ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION } = require("../constants/bildazoAuthorLink");

const submitBildazoAuthorLinkValidators = [
  body("linkFlow").isIn(["new_account", "existing_account"]).withMessage("linkFlow غير صالح."),
  body("acceptedTermsVersion")
    .equals(ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION)
    .withMessage("إصدار الشروط غير مطابق."),
  body("acceptedTermsAcknowledged")
    .custom((v) => v === true || v === "true" || v === 1)
    .withMessage("الموافقة على الشروط مطلوبة."),
  body("fullName").optional({ nullable: true }).isString().isLength({ max: 200 }),
  body("phoneE164").optional({ nullable: true }).isString().isLength({ max: 20 }),
  body("countryIso").optional({ nullable: true }).isString().isLength({ min: 2, max: 2 }),
  body("bio").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body("dateOfBirth")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("تاريخ الميلاد غير صالح."),
  body("existingBildazoEmail").optional({ nullable: true }).isString().isLength({ max: 255 }),
  body("existingBildazoPublicId").optional({ nullable: true }).isString().isLength({ max: 120 }),
  body("existingBildazoProfileUrl").optional({ nullable: true }).isString().isLength({ max: 500 }),
  body("password").optional({ nullable: true }).isString().isLength({ min: 8, max: 72 }),
  body("passwordConfirm").optional({ nullable: true }).isString().isLength({ max: 72 }),
  body("confirmPassword").optional({ nullable: true }).isString().isLength({ max: 72 }),
  body("passwordHash").not().exists().withMessage("لا يتم تخزين كلمة مرور Bildazo."),
  body("roleId").not().exists().withMessage("حقل غير مسموح."),
];

const changeBildazoAuthorLinkValidators = [
  ...submitBildazoAuthorLinkValidators,
  body("confirmChange")
    .custom((v) => v === true || v === "true" || v === 1)
    .withMessage("يجب تأكيد أن التغيير يؤثر على المقالات القادمة فقط."),
];

module.exports = { submitBildazoAuthorLinkValidators, changeBildazoAuthorLinkValidators };
