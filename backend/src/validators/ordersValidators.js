const { body, param, query } = require("express-validator");

const orderIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid order id.")];

const clientOrderFileDownloadParams = [
  param("id").isInt({ min: 1 }).withMessage("معرّف الطلب غير صالح."),
  param("fileId").isInt({ min: 1 }).withMessage("معرّف الملف غير صالح."),
];

const listOrdersValidators = [
  query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit must be 1..200."),
  query("offset").optional().isInt({ min: 0, max: 100000 }).withMessage("offset must be >= 0."),
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
  body("currencyCode")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      const hasBidRange =
        type === "bidding" &&
        req.body.bidBudgetMin !== undefined &&
        req.body.bidBudgetMin !== "" &&
        req.body.bidBudgetMax !== undefined &&
        req.body.bidBudgetMax !== "";
      if (type === "fixed") {
        if (value === undefined || value === null || value === "") {
          throw new Error("currencyCode is required for fixed projects.");
        }
      } else if (type === "bidding" && hasBidRange) {
        if (value === undefined || value === null || value === "") {
          throw new Error("currencyCode is required for priced bidding.");
        }
      } else if (type === "bidding" && !hasBidRange) {
        if (value !== undefined && value !== null && value !== "") {
          throw new Error("currencyCode must be omitted for bidding without price range.");
        }
        return true;
      }
      if (value === undefined || value === null || value === "") return true;
      const code = String(value).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code)) {
        throw new Error("Invalid currencyCode.");
      }
      const allowed = ["JOD", "SAR", "USD", "AED", "EUR", "KWD", "QAR", "BHD", "OMR"];
      if (!allowed.includes(code)) {
        throw new Error("Unsupported currencyCode.");
      }
      return true;
    }),
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
      if (value === undefined || value === null || value === "") return true;
      const n = Number(value);
      if (!Number.isFinite(n) || !(n > 0)) throw new Error("Invalid bid budget min.");
      return true;
    }),
  body("bidBudgetMax")
    .optional({ nullable: true })
    .custom((value, { req }) => {
      const type = String(req.body.projectType || "").trim();
      if (type !== "bidding") return true;
      if (value === undefined || value === null || value === "") return true;
      const max = Number(value);
      const min = Number(req.body.bidBudgetMin);
      if (!Number.isFinite(max) || !(max > 0)) throw new Error("Invalid bid budget max.");
      if (Number.isFinite(min) && max < min) throw new Error("bid max must be >= bid min.");
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
  body("title").isString().trim().isLength({ min: 2, max: 200 }).withMessage("عنوان المشروع مطلوب."),
  body("description").isString().trim().isLength({ min: 10, max: 5000 }).withMessage("الوصف مطلوب."),
  body("categoryId").isInt({ min: 1 }).withMessage("التصنيف مطلوب."),
  body("subcategoryId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("تصنيف فرعي غير صالح."),
  body("subSubcategoryId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("تصنيف دقيق غير صالح."),
  body("projectType").isIn(["fixed", "bidding"]).withMessage("نوع المشروع غير صالح."),
  body("currencyCode")
    .isString()
    .trim()
    .isLength({ min: 3, max: 3 })
    .withMessage("رمز العملة مطلوب (3 أحرف).")
    .custom((v) => {
      const code = String(v).trim().toUpperCase();
      const allowed = ["JOD", "SAR", "USD", "AED", "EUR", "KWD", "QAR", "BHD", "OMR"];
      if (!allowed.includes(code)) throw new Error("رمز العملة غير مدعوم.");
      return true;
    }),
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
];

const clientOrderClaimIdBodyValidators = [
  body("claimId").isInt({ min: 1 }).withMessage("يرجى تحديد طلب المستقل.").toInt(),
];

const clientOrderBidIdBodyValidators = [
  body("bidId").isInt({ min: 1 }).withMessage("يرجى تحديد العرض.").toInt(),
];

const clientOrderRevisionNoteValidators = [
  body("note").optional().isString().trim().isLength({ max: 4000 }).withMessage("نص طلب التعديل طويل جداً."),
];

module.exports = {
  orderIdParam,
  clientOrderFileDownloadParams,
  listOrdersValidators,
  createInternalOrderValidators,
  createClientOrderValidators,
  submitPoolOrderBidValidators,
  clientOrderClaimIdBodyValidators,
  clientOrderBidIdBodyValidators,
  clientOrderRevisionNoteValidators,
};

