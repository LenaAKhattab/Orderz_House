const { body, param, query } = require("express-validator");

const FEEDBACK_TYPES = ["problem", "suggestion", "other"];
const FEEDBACK_STATUSES = ["new", "in_review", "resolved", "closed"];
const FEEDBACK_PRIORITIES = ["low", "normal", "high", "urgent"];
const FEEDBACK_ROLES = ["client", "freelancer"];

const feedbackIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الملاحظة غير صالح.")];

const createFeedbackValidators = [
  body("type")
    .trim()
    .isIn(FEEDBACK_TYPES)
    .withMessage("نوع الملاحظة غير صالح."),
  body("subject")
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage("العنوان مطلوب ويجب ألا يتجاوز 200 حرف."),
  body("description")
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage("الوصف مطلوب ويجب أن يكون بين 10 و 5000 حرف."),
  // Identity must never be accepted from the client.
  body("userId").not().exists().withMessage("لا يمكن تمرير معرّف المستخدم."),
  body("user_id").not().exists().withMessage("لا يمكن تمرير معرّف المستخدم."),
  body("email").not().exists().withMessage("لا يمكن تمرير البريد الإلكتروني."),
  body("role").not().exists().withMessage("لا يمكن تمرير الدور."),
  body("name").not().exists().withMessage("لا يمكن تمرير الاسم."),
  body("userName").not().exists().withMessage("لا يمكن تمرير الاسم."),
  body("userEmail").not().exists().withMessage("لا يمكن تمرير البريد."),
  body("userRole").not().exists().withMessage("لا يمكن تمرير الدور."),
];

const listMyFeedbackValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("رقم الصفحة غير صالح."),
  query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("حد الصفحة غير صالح."),
];

const adminListFeedbackValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("رقم الصفحة غير صالح."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("حد الصفحة غير صالح."),
  query("q").optional().isString().isLength({ max: 200 }).withMessage("نص البحث طويل جداً."),
  query("type").optional().isIn(FEEDBACK_TYPES).withMessage("نوع الملاحظة غير صالح."),
  query("status").optional().isIn(FEEDBACK_STATUSES).withMessage("الحالة غير صالحة."),
  query("userRole").optional().isIn(FEEDBACK_ROLES).withMessage("دور المستخدم غير صالح."),
  query("priority").optional().isIn(FEEDBACK_PRIORITIES).withMessage("الأولوية غير صالحة."),
  query("from").optional().isISO8601().withMessage("تاريخ البداية غير صالح."),
  query("to").optional().isISO8601().withMessage("تاريخ النهاية غير صالح."),
];

const adminUpdateFeedbackValidators = [
  ...feedbackIdParam,
  body("status").optional().isIn(FEEDBACK_STATUSES).withMessage("الحالة غير صالحة."),
  body("priority").optional().isIn(FEEDBACK_PRIORITIES).withMessage("الأولوية غير صالحة."),
  body("adminNote")
    .optional({ nullable: true })
    .custom((value) => value === null || value === undefined || typeof value === "string")
    .withMessage("الملاحظة الداخلية غير صالحة.")
    .customSanitizer((value) => (value == null ? value : String(value)))
    .custom((value) => value == null || String(value).length <= 5000)
    .withMessage("الملاحظة الداخلية طويلة جداً."),
  body("assignedAdminId")
    .optional({ nullable: true })
    .custom((value) => value === null || value === undefined || Number.isInteger(Number(value)))
    .withMessage("معرّف الأدمن المعيّن غير صالح."),
];

module.exports = {
  FEEDBACK_TYPES,
  FEEDBACK_STATUSES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_ROLES,
  feedbackIdParam,
  createFeedbackValidators,
  listMyFeedbackValidators,
  adminListFeedbackValidators,
  adminUpdateFeedbackValidators,
};
