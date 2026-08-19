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
  body("existingBildazoEmail").optional({ nullable: true }).isString().isLength({ max: 255 }),
  body("existingBildazoPublicId").optional({ nullable: true }).isString().isLength({ max: 120 }),
  body("existingBildazoProfileUrl").optional({ nullable: true }).isString().isLength({ max: 500 }),
  body("password").not().exists().withMessage("لا يتم جمع كلمة مرور Bildazo."),
  body("passwordHash").not().exists().withMessage("لا يتم جمع كلمة مرور Bildazo."),
];

module.exports = { submitBildazoAuthorLinkValidators };
