const { body, param } = require("express-validator");

const faqIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف السؤال غير صالح.")];

const createFaqValidators = [
  body("question")
    .trim()
    .notEmpty()
    .withMessage("السؤال مطلوب.")
    .isLength({ max: 500 })
    .withMessage("السؤال طويل جداً."),
  body("answer")
    .trim()
    .notEmpty()
    .withMessage("الإجابة مطلوبة.")
    .isLength({ max: 5000 })
    .withMessage("الإجابة طويلة جداً."),
];

const updateFaqValidators = [
  ...faqIdParam,
  body("question")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("السؤال لا يمكن أن يكون فارغاً.")
    .isLength({ max: 500 })
    .withMessage("السؤال طويل جداً."),
  body("answer")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("الإجابة لا يمكن أن تكون فارغة.")
    .isLength({ max: 5000 })
    .withMessage("الإجابة طويلة جداً."),
];

const reorderFaqValidators = [
  body("orderedIds")
    .isArray({ min: 1 })
    .withMessage("ترتيب الأسئلة غير صالح."),
  body("orderedIds.*").isInt({ min: 1 }).withMessage("معرّف السؤال غير صالح."),
];

module.exports = {
  faqIdParam,
  createFaqValidators,
  updateFaqValidators,
  reorderFaqValidators,
};
