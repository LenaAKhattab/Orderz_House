const { body, param, query } = require("express-validator");

/** Legacy type values still accepted from older clients. */
const FEEDBACK_TYPES = ["problem", "suggestion", "other"];
const FEEDBACK_STATUSES = ["new", "in_review", "resolved", "closed"];
const FEEDBACK_PRIORITIES = ["low", "normal", "high", "urgent"];
const FEEDBACK_ROLES = ["client", "freelancer"];

const feedbackIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الملاحظة غير صالح.")];
const categoryIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف التصنيف غير صالح.")];
const topicIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الموضوع غير صالح.")];

const optionalPositiveInt = (field, message) =>
  body(field)
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const n = Number(value);
      return Number.isInteger(n) && n > 0;
    })
    .withMessage(message);

const createFeedbackValidators = [
  // Prefer categoryId; legacy clients may still send type=problem|suggestion|other.
  optionalPositiveInt("categoryId", "تصنيف الملاحظة غير صالح."),
  body("type")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const t = String(value).trim();
      return t.length >= 1 && t.length <= 64;
    })
    .withMessage("نوع الملاحظة غير صالح."),
  body().custom((_, { req }) => {
    const hasCategory =
      req.body?.categoryId != null &&
      req.body.categoryId !== "" &&
      Number.isInteger(Number(req.body.categoryId)) &&
      Number(req.body.categoryId) > 0;
    const hasType = Boolean(String(req.body?.type || "").trim());
    if (!hasCategory && !hasType) {
      throw new Error("تصنيف الملاحظة غير صالح.");
    }
    return true;
  }),
  body("subject")
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage("العنوان مطلوب ويجب ألا يتجاوز 200 حرف."),
  body("description")
    .trim()
    .isLength({ min: 10, max: 5000 })
    .withMessage("الوصف مطلوب ويجب أن يكون بين 10 و 5000 حرف."),
  optionalPositiveInt("topicId", "موضوع الملاحظة غير صالح."),
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

const listActiveTopicsValidators = [
  query("categoryId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("تصنيف الملاحظة غير صالح."),
  query("type")
    .optional()
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const t = String(value).trim();
      return t.length >= 1 && t.length <= 64;
    })
    .withMessage("نوع الملاحظة غير صالح."),
  query().custom((_, { req }) => {
    const hasCategory = Boolean(req.query?.categoryId);
    const hasType = Boolean(String(req.query?.type || "").trim());
    if (!hasCategory && !hasType) {
      throw new Error("تصنيف الملاحظة غير صالح.");
    }
    return true;
  }),
];

const adminListTopicsValidators = [
  query("categoryId").optional().isInt({ min: 1 }).withMessage("تصنيف الملاحظة غير صالح."),
  query("type")
    .optional()
    .custom((value) => {
      if (!value) return true;
      const t = String(value).trim();
      return t.length >= 1 && t.length <= 64;
    })
    .withMessage("نوع الملاحظة غير صالح."),
];

const adminCreateTopicValidators = [
  optionalPositiveInt("categoryId", "تصنيف الملاحظة غير صالح."),
  body("type")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const t = String(value).trim();
      return t.length >= 1 && t.length <= 64;
    })
    .withMessage("نوع الملاحظة غير صالح."),
  body().custom((_, { req }) => {
    const hasCategory =
      req.body?.categoryId != null &&
      req.body.categoryId !== "" &&
      Number.isInteger(Number(req.body.categoryId)) &&
      Number(req.body.categoryId) > 0;
    const hasType = Boolean(String(req.body?.type || "").trim());
    if (!hasCategory && !hasType) {
      throw new Error("تصنيف الملاحظة غير صالح.");
    }
    return true;
  }),
  body("label")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("نص الموضوع مطلوب ويجب ألا يتجاوز 200 حرف."),
  body("isActive").optional().isBoolean().withMessage("حالة التفعيل غير صالحة."),
];

const adminUpdateTopicValidators = [
  ...topicIdParam,
  body("label")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("نص الموضوع مطلوب ويجب ألا يتجاوز 200 حرف."),
  body("isActive").optional().isBoolean().withMessage("حالة التفعيل غير صالحة."),
];

const adminReorderTopicsValidators = [
  optionalPositiveInt("categoryId", "تصنيف الملاحظة غير صالح."),
  body("type")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const t = String(value).trim();
      return t.length >= 1 && t.length <= 64;
    })
    .withMessage("نوع الملاحظة غير صالح."),
  body().custom((_, { req }) => {
    const hasCategory =
      req.body?.categoryId != null &&
      req.body.categoryId !== "" &&
      Number.isInteger(Number(req.body.categoryId)) &&
      Number(req.body.categoryId) > 0;
    const hasType = Boolean(String(req.body?.type || "").trim());
    if (!hasCategory && !hasType) {
      throw new Error("تصنيف الملاحظة غير صالح.");
    }
    return true;
  }),
  body("orderedIds").isArray({ min: 1 }).withMessage("ترتيب المواضيع غير صالح."),
  body("orderedIds.*").isInt({ min: 1 }).withMessage("معرّف الموضوع غير صالح."),
];

const adminCreateCategoryValidators = [
  body("label")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("اسم التصنيف مطلوب ويجب ألا يتجاوز 200 حرف."),
  body("isActive").optional().isBoolean().withMessage("حالة التفعيل غير صالحة."),
];

const adminUpdateCategoryValidators = [
  ...categoryIdParam,
  body("label")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("اسم التصنيف مطلوب ويجب ألا يتجاوز 200 حرف."),
  body("isActive").optional().isBoolean().withMessage("حالة التفعيل غير صالحة."),
];

const adminReorderCategoriesValidators = [
  body("orderedIds").isArray({ min: 1 }).withMessage("ترتيب التصنيفات غير صالح."),
  body("orderedIds.*").isInt({ min: 1 }).withMessage("معرّف التصنيف غير صالح."),
];

const listMyFeedbackValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("رقم الصفحة غير صالح."),
  query("limit").optional().isInt({ min: 1, max: 50 }).withMessage("حد الصفحة غير صالح."),
];

const adminListFeedbackValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("رقم الصفحة غير صالح."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("حد الصفحة غير صالح."),
  query("q").optional().isString().isLength({ max: 200 }).withMessage("نص البحث طويل جداً."),
  query("categoryId").optional().isInt({ min: 1 }).withMessage("تصنيف الملاحظة غير صالح."),
  // Legacy type=problem|suggestion|other and custom keys (cat_N) — resolved against categories table in service.
  query("type")
    .optional()
    .custom((value) => {
      if (!value) return true;
      const t = String(value).trim();
      return t.length >= 1 && t.length <= 64;
    })
    .withMessage("نوع الملاحظة غير صالح."),
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
  categoryIdParam,
  topicIdParam,
  createFeedbackValidators,
  listMyFeedbackValidators,
  listActiveTopicsValidators,
  adminListTopicsValidators,
  adminCreateTopicValidators,
  adminUpdateTopicValidators,
  adminReorderTopicsValidators,
  adminCreateCategoryValidators,
  adminUpdateCategoryValidators,
  adminReorderCategoriesValidators,
  adminListFeedbackValidators,
  adminUpdateFeedbackValidators,
};
