const { body, param, query } = require("express-validator");

const claimIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف المطالبة غير صالح.").toInt()];

const listPortalFinancialClaimsValidators = [
  query("status").optional().isString().trim().isLength({ min: 2, max: 60 }).withMessage("حالة المطالبة غير صالحة."),
];

const listDoneProjectsValidators = [
  query("q").optional().isString().trim().isLength({ max: 200 }).withMessage("نص البحث غير صالح."),
  query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("limit غير صالح.").toInt(),
];

const createPortalFinancialClaimValidators = [
  body("mode").isIn(["manual", "done_project"]).withMessage("mode must be manual or done_project."),
  body("projectId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("projectId غير صالح.").toInt(),
  body("orderNumber")
    .if((value, { req }) => String(req.body.mode || "") === "manual")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("رقم الطلب مطلوب."),
  body("requestTitle")
    .if((value, { req }) => String(req.body.mode || "") === "manual")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("عنوان الطلب مطلوب."),
  body("categories")
    .if((value, { req }) => String(req.body.mode || "") === "manual")
    .custom((value) => {
      if (!Array.isArray(value) || value.length < 1) throw new Error("يجب اختيار تصنيف واحد على الأقل.");
      return true;
    }),
  body("durationMinutes")
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) throw new Error("duration_minutes يجب أن يكون رقم صحيح >= 0.");
      return true;
    }),
  body("actualCompletionDate")
    .if((value, { req }) => String(req.body.mode || "") === "manual")
    .isISO8601()
    .withMessage("actual_completion_date must be YYYY-MM-DD."),
  body("freelancerNote").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("freelancer_note غير صالح."),
];

const listSuperAdminFinancialClaimsValidators = [
  query("q").optional().isString().trim().isLength({ max: 200 }).withMessage("q غير صالح."),
  query("status")
    .optional()
    .isIn(["pending", "accepted", "rejected", "frozen", "requires_in_person_review", "paid"])
    .withMessage("status غير صالح."),
  query("payoutStatus")
    .optional()
    .isIn(["missing_completion_date", "not_due_yet", "within_payout_window", "late_after_payout_window", "paid"])
    .withMessage("payoutStatus غير صالح."),
];

const updateFinancialClaimStatusValidators = [
  ...claimIdParam,
  body("status")
    .isIn(["pending", "accepted", "rejected", "frozen", "requires_in_person_review", "paid"])
    .withMessage("status غير صالح."),
  body("adminNote").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("admin_note غير صالح."),
];

const updateFinancialClaimPricingValidators = [
  ...claimIdParam,
  body("totalPriceSnapshot").isFloat({ min: 0.01 }).withMessage("total_price_snapshot يجب أن يكون أكبر من 0.").toFloat(),
  body("userPercentageSnapshot").isFloat({ min: 0, max: 100 }).withMessage("user_percentage_snapshot غير صالح.").toFloat(),
  body("companyPercentageSnapshot")
    .isFloat({ min: 0, max: 100 })
    .withMessage("company_percentage_snapshot غير صالح.")
    .toFloat(),
];

const createFreelancerPaymentValidators = [
  body("freelancerId").isInt({ min: 1 }).withMessage("freelancer_id غير صالح.").toInt(),
  body("paymentMethod").isString().trim().isLength({ min: 2, max: 80 }).withMessage("payment_method غير صالح."),
  body("paymentReference").optional({ nullable: true }).isString().trim().isLength({ max: 255 }).withMessage("payment_reference غير صالح."),
  body("paidAt").optional({ nullable: true }).isISO8601().withMessage("paid_at غير صالح."),
  body("claimIds")
    .isArray({ min: 1 })
    .withMessage("claimIds must contain at least one claim.")
    .custom((arr) => arr.every((id) => Number.isInteger(Number(id)) && Number(id) > 0))
    .withMessage("claimIds contains invalid id(s)."),
];

module.exports = {
  claimIdParam,
  listPortalFinancialClaimsValidators,
  listDoneProjectsValidators,
  createPortalFinancialClaimValidators,
  listSuperAdminFinancialClaimsValidators,
  updateFinancialClaimStatusValidators,
  updateFinancialClaimPricingValidators,
  createFreelancerPaymentValidators,
};
