const { body } = require("express-validator");
const {
  PUBLIC_PLANS_DEFAULT_SECTION_VALUES,
  PUBLIC_PLANS_CONTENT_MAX_LENGTHS,
} = require("../constants/publicPlansContent");

const updatePublicPlansContentValidators = [
  body("badgeText")
    .optional({ nullable: true })
    .isString()
    .withMessage("يجب إدخال نص عادي فقط.")
    .bail()
    .trim()
    .isLength({ max: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.badgeText })
    .withMessage("النص أطول من الحد المسموح."),
  body("title")
    .exists({ values: "falsy" })
    .withMessage("العنوان الرئيسي مطلوب.")
    .bail()
    .isString()
    .withMessage("يجب إدخال نص عادي فقط.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("العنوان الرئيسي مطلوب.")
    .bail()
    .isLength({ max: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.title })
    .withMessage("النص أطول من الحد المسموح."),
  body("description")
    .optional({ nullable: true })
    .isString()
    .withMessage("يجب إدخال نص عادي فقط.")
    .bail()
    .trim()
    .isLength({ max: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.description })
    .withMessage("النص أطول من الحد المسموح."),
  body("trainingTabLabel")
    .optional({ nullable: true })
    .isString()
    .withMessage("يجب إدخال نص عادي فقط.")
    .bail()
    .trim()
    .isLength({ max: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.trainingTabLabel })
    .withMessage("النص أطول من الحد المسموح."),
  body("workTabLabel")
    .optional({ nullable: true })
    .isString()
    .withMessage("يجب إدخال نص عادي فقط.")
    .bail()
    .trim()
    .isLength({ max: PUBLIC_PLANS_CONTENT_MAX_LENGTHS.workTabLabel })
    .withMessage("النص أطول من الحد المسموح."),
  body("defaultSection")
    .exists()
    .withMessage("القسم الافتراضي يجب أن يكون التدريب أو عضوية سوق أوردرز هاوس.")
    .bail()
    .isString()
    .trim()
    .isIn(PUBLIC_PLANS_DEFAULT_SECTION_VALUES)
    .withMessage("القسم الافتراضي يجب أن يكون التدريب أو عضوية سوق أوردرز هاوس."),
];

module.exports = {
  updatePublicPlansContentValidators,
};
