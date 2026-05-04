const { body, param, query } = require("express-validator");

const orderIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid order id.")];

const freelancerUserIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف المستخدم غير صالح.")];

const clientOrderFileDownloadParams = [
  param("id").isInt({ min: 1 }).withMessage("معرّف الطلب غير صالح."),
  param("fileId").isInt({ min: 1 }).withMessage("معرّف الملف غير صالح."),
];

const listOrdersValidators = [
  query("page").optional().isInt({ min: 1, max: 100000 }).withMessage("page must be >= 1."),
  query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit must be 1..200."),
  query("offset").optional().isInt({ min: 0, max: 100000 }).withMessage("offset must be >= 0."),
  query("status")
    .optional()
    .isIn([
      "all",
      "pending_claim",
      "revision_required",
      "assigned",
      "in_progress",
      "pending_client_review",
      "completed",
      "cancelled",
      "published",
      "open_for_freelancers",
      "open_for_bids",
    ])
    .withMessage("Invalid status filter."),
  query("projectType").optional().isIn(["fixed", "bidding"]).withMessage("Invalid projectType filter."),
  query("categoryId").optional().isInt({ min: 1 }).withMessage("categoryId must be a positive integer."),
  query("subSubCategoryIds")
    .optional()
    .matches(/^\d+(,\d+)*$/)
    .withMessage("subSubCategoryIds must be comma-separated positive integers."),
  query("sort").optional().isIn(["newest", "oldest", "price_high", "price_low"]).withMessage("Invalid sort filter."),
  query("q").optional().isString().trim().isLength({ min: 1, max: 120 }).withMessage("q must be 1..120 chars."),
];

const createInternalOrderValidators = [
  body("orderCode")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ min: 2, max: 32 })
    .withMessage("رمز الطلب غير صالح.")
    .matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/)
    .withMessage("رمز الطلب غير صالح."),
  body("title").isString().trim().isLength({ min: 2, max: 200 }).withMessage("Project Title is required."),
  body("description").isString().trim().isLength({ min: 10, max: 5000 }).withMessage("Description is required."),
  body("categoryId").isInt({ min: 1 }).withMessage("Category is required."),
  body("subcategoryId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Invalid sub category."),
  body("subSubcategoryId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Invalid sub sub category."),
  body("subSubcategoryId")
    .custom((value, { req }) => {
      if (value === undefined || value === null || value === "") return true;
      // If detailed is provided, category must be present (already required), and subcategory can be omitted (inferred).
      return true;
    }),
  body("projectType").isIn(["fixed", "bidding"]).withMessage("Project Type must be fixed or bidding."),
  body("budget")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      if (type === "bidding") {
        // budget must be omitted or empty for bidding
        if (value === undefined || value === null || value === "") return true;
        throw new Error("Budget must be omitted for bidding projects.");
      }
      // fixed: budget required and > 0
      if (value === undefined || value === null || value === "") {
        throw new Error("Budget is required for fixed projects.");
      }
      const n = Number(value);
      if (!Number.isFinite(n) || !(n > 0)) {
        throw new Error("Budget must be a number > 0.");
      }
      return true;
    })
    .toFloat(),
  body("durationValue").isInt({ min: 1, max: 100000 }).withMessage("Project Duration must be > 0."),
  body("durationUnit").isIn(["days", "hours", "minutes"]).withMessage("Duration Unit is invalid."),
  body("bidBudgetMin")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      if (type !== "bidding") return true;
      if (value === undefined || value === null || value === "") {
        throw new Error("Bid budget min is required for bidding projects.");
      }
      const n = Number(value);
      if (!Number.isFinite(n) || !(n > 0)) throw new Error("Invalid bid budget min.");
      return true;
    }),
  body("bidBudgetMax")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      if (type !== "bidding") return true;
      if (value === undefined || value === null || value === "") {
        throw new Error("Bid budget max is required for bidding projects.");
      }
      const max = Number(value);
      const min = Number(req.body.bidBudgetMin);
      if (!Number.isFinite(max) || !(max > 0)) throw new Error("Invalid bid budget max.");
      if (!Number.isFinite(min) || !(min > 0)) return true;
      if (max < min) throw new Error("Bid max must be >= bid min.");
      return true;
    }),
  body("preferredSkills")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      if (Array.isArray(value)) return true;
      const s = String(value).trim();
      if (!s) return true;
      // Accept JSON array or comma-separated
      if (s.startsWith("[")) {
        const parsed = JSON.parse(s);
        if (!Array.isArray(parsed)) throw new Error("preferredSkills must be a list.");
        if (parsed.length > 50) throw new Error("Too many skills.");
        return true;
      }
      if (s.length > 2000) throw new Error("preferredSkills is too long.");
      return true;
    })
    .withMessage("Preferred Skills is invalid."),
  body("assignedFreelancerId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Invalid freelancer."),
  body("archive")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === undefined || value === null || value === "") return true;
      const s = String(value).trim().toLowerCase();
      if (s === "true" || s === "false") return true;
      if (value === true || value === false) return true;
      throw new Error("archive must be boolean.");
    }),
  body("extraCategoryIds")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === undefined || value === null || value === "") return true;
      const raw = Array.isArray(value) ? value : JSON.parse(String(value));
      if (!Array.isArray(raw)) throw new Error("extraCategoryIds must be a list.");
      if (raw.length > 10) throw new Error("Too many extra categories.");
      for (const v of raw) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) throw new Error("Invalid extra category id.");
      }
      return true;
    }),
  body("extraCategoryDetails")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === undefined || value === null || value === "") return true;
      const obj = typeof value === "object" && !Array.isArray(value) ? value : JSON.parse(String(value));
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("extraCategoryDetails must be an object.");
      const keys = Object.keys(obj);
      if (keys.length > 20) throw new Error("extraCategoryDetails too large.");
      for (const k of keys) {
        const catId = Number(k);
        if (!Number.isInteger(catId) || catId < 1) throw new Error("Invalid extra category key.");
        const v = obj[k];
        if (v === null || v === undefined || v === "") continue;
        const ssId = Number(v);
        if (!Number.isInteger(ssId) || ssId < 1) throw new Error("Invalid extra sub subcategory id.");
      }
      return true;
    }),
];

const createClientOrderValidators = [
  body("orderCode")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ min: 2, max: 32 })
    .withMessage("رقم الطلب غير صالح.")
    .matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/)
    .withMessage("رقم الطلب غير صالح."),
  body("title").isString().trim().isLength({ min: 2, max: 200 }).withMessage("عنوان المشروع مطلوب."),
  body("description").isString().trim().isLength({ min: 10, max: 5000 }).withMessage("الوصف مطلوب."),
  body("categoryId").isInt({ min: 1 }).withMessage("التصنيف مطلوب."),
  body("subcategoryId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("تصنيف فرعي غير صالح."),
  body("subSubcategoryId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("تصنيف دقيق غير صالح."),
  body("projectType").isIn(["fixed", "bidding"]).withMessage("نوع المشروع غير صالح."),
  body("budget")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      if (type !== "fixed") return true;
      if (value === undefined || value === null || value === "") throw new Error("الميزانية مطلوبة للسعر الثابت.");
      const n = Number(value);
      if (!Number.isFinite(n) || !(n > 0)) throw new Error("الميزانية يجب أن تكون رقماً أكبر من صفر.");
      return true;
    }),
  body("bidBudgetMin")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      if (type !== "bidding") return true;
      if (value === undefined || value === null || value === "") throw new Error("الحد الأدنى للميزانية مطلوب للمزايدة.");
      const n = Number(value);
      if (!Number.isFinite(n) || !(n > 0)) throw new Error("الحد الأدنى غير صالح.");
      return true;
    }),
  body("bidBudgetMax")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      if (type !== "bidding") return true;
      if (value === undefined || value === null || value === "") throw new Error("الحد الأعلى للميزانية مطلوب للمزايدة.");
      const max = Number(value);
      const min = Number(req.body.bidBudgetMin);
      if (!Number.isFinite(max) || !(max > 0)) throw new Error("الحد الأعلى غير صالح.");
      if (!Number.isFinite(min) || !(min > 0)) return true;
      if (max < min) throw new Error("الحد الأعلى يجب أن يكون أكبر من أو يساوي الحد الأدنى.");
      return true;
    }),
  body("durationValue").isInt({ min: 1, max: 100000 }).withMessage("مدة التنفيذ مطلوبة."),
  body("durationUnit").isIn(["days", "hours", "minutes"]).withMessage("وحدة المدة غير صالحة."),
  body("preferredSkills")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      if (Array.isArray(value)) return true;
      const s = String(value).trim();
      if (!s) return true;
      if (s.startsWith("[")) {
        const parsed = JSON.parse(s);
        if (!Array.isArray(parsed)) throw new Error("preferredSkills must be a list.");
        if (parsed.length > 50) throw new Error("Too many skills.");
        return true;
      }
      if (s.length > 2000) throw new Error("preferredSkills is too long.");
      return true;
    }),
];

const submitPoolOrderBidValidators = [
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("مبلغ العرض يجب أن يكون أكبر من صفر.")
    .toFloat(),
  body("message").optional({ nullable: true }).isString().trim().isLength({ max: 4000 }).withMessage("رسالة العرض طويلة جداً."),
];

const clientOrderClaimIdBodyValidators = [
  body("claimId").isInt({ min: 1 }).withMessage("يرجى تحديد طلب المستقل.").toInt(),
];

const clientOrderBidIdBodyValidators = [
  body("bidId").isInt({ min: 1 }).withMessage("يرجى تحديد العرض.").toInt(),
];

const clientOrderBidIdParamValidators = [
  param("bidId").isInt({ min: 1 }).withMessage("يرجى تحديد العرض.").toInt(),
];

const clientOrderRevisionNoteValidators = [
  body("note").optional().isString().trim().isLength({ max: 4000 }).withMessage("نص طلب التعديل طويل جداً."),
];

/** GET /api/admin/freelancers — admin/super_admin assignment search */
const adminFreelancersSearchValidators = [
  query("search").optional().isString().trim().isLength({ max: 120 }).withMessage("search must be at most 120 chars."),
  query("q").optional().isString().trim().isLength({ max: 120 }).withMessage("q must be at most 120 chars."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be 1..100."),
  query("eligibleOnly").optional().custom((v) => {
    if (v === undefined || v === null || v === "") return true;
    const s = String(v).trim().toLowerCase();
    if (["true", "false", "1", "0"].includes(s)) return true;
    throw new Error("eligibleOnly must be true or false.");
  }),
  query("onlyActiveSubscription").optional().custom((v) => {
    if (v === undefined || v === null || v === "") return true;
    const s = String(v).trim().toLowerCase();
    if (["true", "false", "1", "0"].includes(s)) return true;
    throw new Error("onlyActiveSubscription must be true or false.");
  }),
  query("status").optional().isIn(["all", "active", "inactive"]).withMessage("status must be all, active, or inactive."),
];

module.exports = {
  orderIdParam,
  freelancerUserIdParam,
  clientOrderFileDownloadParams,
  listOrdersValidators,
  adminFreelancersSearchValidators,
  createInternalOrderValidators,
  createClientOrderValidators,
  submitPoolOrderBidValidators,
  clientOrderClaimIdBodyValidators,
  clientOrderBidIdBodyValidators,
  clientOrderBidIdParamValidators,
  clientOrderRevisionNoteValidators,
};

