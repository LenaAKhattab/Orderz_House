const { body, param, query } = require("express-validator");

const idParam = [param("id").isInt({ min: 1 }).withMessage("معرّف غير صالح.")];
const allocationIdParam = [param("allocationId").isInt({ min: 1 }).withMessage("معرّف غير صالح.")];

const createPersonValidators = [
  body("fullName").trim().notEmpty().withMessage("الاسم الكامل مطلوب."),
  body("email").optional({ nullable: true }).isEmail().withMessage("بريد إلكتروني غير صالح."),
  body("status").optional().isIn(["active", "inactive"]),
  body("userId").optional({ nullable: true }).isInt({ min: 1 }),
  body("departmentId").optional({ nullable: true }).isInt({ min: 1 }),
  body("createLoginAccount").optional().isBoolean(),
  body("loginEmail").optional({ nullable: true }).isEmail().withMessage("بريد تسجيل الدخول غير صالح."),
  body("password").optional().isString(),
];

const createDepartmentValidators = [
  body("name").trim().notEmpty().withMessage("اسم القسم مطلوب.").isLength({ max: 120 }),
];

const createAccountValidators = [
  ...idParam,
  body("loginEmail").trim().isEmail().withMessage("بريد إلكتروني غير صالح."),
  body("password").isString().notEmpty().withMessage("كلمة المرور مطلوبة."),
];

const updatePersonValidators = [
  ...idParam,
  body("fullName").optional().trim().notEmpty(),
  body("email").optional({ nullable: true }).isEmail(),
  body("status").optional().isIn(["active", "inactive"]),
  body("userId").optional({ nullable: true }).isInt({ min: 1 }),
  body("departmentId").optional({ nullable: true }).isInt({ min: 1 }),
];

const allocationSchema = body("allocations").optional().isArray();
const bonusRowBodyValidators = [
  body("title").optional().trim().notEmpty(),
  body("monthKey").optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/),
  body("month").optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/),
  body("sourceType").optional().isIn(["manual", "subscription_payment", "order_payment"]),
  body("grossAmount").optional().isFloat({ gt: 0 }),
  body("bonusPercentage").optional().isFloat({ min: 0, max: 100 }),
  body("stripePercentage").optional().isFloat({ min: 0, max: 100 }),
  body("stripeFixedFee").optional().isFloat({ min: 0 }),
  body("stripeDeductionEnabled").optional().isBoolean(),
  body("receivedStatus").optional().isIn(["received", "not_received", "partially_received"]),
  body("status").optional().isIn(["draft", "approved", "paid", "unpaid", "cancelled"]),
  allocationSchema,
];

const createBonusRowValidators = [
  body("title").trim().notEmpty().withMessage("العنوان مطلوب."),
  body("monthKey").matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage("صيغة الشهر غير صالحة."),
  body("grossAmount").isFloat({ gt: 0 }).withMessage("المبلغ الأصلي مطلوب."),
  body("sourceType").isIn(["manual", "subscription_payment", "order_payment"]),
  body("bonusPercentage").optional().isFloat({ min: 0, max: 100 }),
  body("stripePercentage").optional().isFloat({ min: 0, max: 100 }),
  body("stripeFixedFee").optional().isFloat({ min: 0 }),
  body("stripeDeductionEnabled").optional().isBoolean(),
  body("receivedStatus").optional().isIn(["received", "not_received", "partially_received"]),
  body("status").optional().isIn(["draft", "approved", "paid", "unpaid", "cancelled"]),
  body("allocations").optional().isArray(),
];

const updateBonusRowValidators = [...idParam, ...bonusRowBodyValidators];

const markReceivedValidators = [
  ...idParam,
  body("receivedStatus").optional().isIn(["received", "not_received", "partially_received"]),
  body("receivedAmount").optional().isFloat({ min: 0 }),
  body("receivedAt").optional({ nullable: true }).isISO8601(),
  body("receivedNote").optional({ nullable: true }).isString(),
];

const listQueryValidators = [
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("offset").optional().isInt({ min: 0 }),
  query("month").optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/),
];

module.exports = {
  idParam,
  allocationIdParam,
  createPersonValidators,
  createAccountValidators,
  createDepartmentValidators,
  updatePersonValidators,
  createBonusRowValidators,
  updateBonusRowValidators,
  listQueryValidators,
  markReceivedValidators,
};
