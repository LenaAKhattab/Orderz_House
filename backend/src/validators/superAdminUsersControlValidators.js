const { body, param, query } = require("express-validator");

const userIdParam = [
  param("userId").isInt({ min: 1 }).withMessage("معرّف المستخدم غير صالح."),
];

const listUsersValidators = [
  query("q").optional().isString().isLength({ max: 200 }),
  query("role").optional().isString().isLength({ max: 40 }),
  query("status").optional().isString().isLength({ max: 40 }),
  query("accountStatus").optional().isString().isLength({ max: 40 }),
  query("identityStatus").optional().isString().isLength({ max: 40 }),
  query("membershipTier").optional().isString().isLength({ max: 80 }),
  query("membershipStatus").optional().isString().isLength({ max: 40 }),
  query("courseStatus").optional().isString().isLength({ max: 40 }),
  query("hasPendingFinalTest").optional().isString().isLength({ max: 10 }),
  query("createdFrom").optional().isString().isLength({ max: 40 }),
  query("createdTo").optional().isString().isLength({ max: 40 }),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("sort").optional().isString().isLength({ max: 40 }),
];

const reasonBody = body("reason")
  .trim()
  .isLength({ min: 3, max: 2000 })
  .withMessage("سبب الإجراء مطلوب (٣ أحرف على الأقل).");

const patchAccountValidators = [
  ...userIdParam,
  reasonBody,
  body("firstName").optional({ nullable: true }).isString().isLength({ max: 80 }),
  body("fatherName").optional({ nullable: true }).isString().isLength({ max: 80 }),
  body("familyName").optional({ nullable: true }).isString().isLength({ max: 80 }),
  body("phone").optional({ nullable: true }).isString().isLength({ max: 40 }),
  body("whatsapp").optional({ nullable: true }).isString().isLength({ max: 40 }),
  body("accountStatus").optional().isIn(["active", "inactive"]),
  body("role").optional().isIn(["freelancer", "client", "admin", "super_admin", "financial_user"]),
  body("password").not().exists().withMessage("تعديل كلمة المرور غير مسموح."),
];

const patchIdentityValidators = [
  ...userIdParam,
  reasonBody,
  body("action")
    .isIn(["approve_identity", "reject_identity", "mark_pending_review", "request_resubmission"])
    .withMessage("إجراء الهوية غير صالح."),
  body("adminNote").optional({ nullable: true }).isString().isLength({ max: 2000 }),
];

const patchMembershipValidators = [
  ...userIdParam,
  reasonBody,
  body("action").isIn(["assign_plan", "change_plan", "cancel_plan"]).withMessage("إجراء الباقة غير صالح."),
  body("planId").optional({ nullable: true }).isInt({ min: 1 }),
];

const patchTrainingValidators = [
  ...userIdParam,
  reasonBody,
  body("action")
    .isIn(["mark_course_completed", "mark_final_test_passed", "reset_course_progress", "reset_final_test"])
    .withMessage("إجراء التدريب غير صالح."),
  body("courseId").isInt({ min: 1 }).withMessage("معرّف الدورة مطلوب."),
];

const bulkActionsValidators = [
  reasonBody,
  body("action")
    .isIn([
      "set_account_status",
      "assign_plan",
      "request_kyc_resubmission",
      "mark_identity_pending_review",
      "export_selected_users_csv",
    ])
    .withMessage("الإجراء الجماعي غير صالح."),
  body("userIds").isArray({ min: 1, max: 100 }).withMessage("يجب تحديد مستخدمين (١–١٠٠)."),
  body("userIds.*").isInt({ min: 1 }),
  body("payload").optional().isObject(),
];

module.exports = {
  userIdParam,
  listUsersValidators,
  patchAccountValidators,
  patchIdentityValidators,
  patchMembershipValidators,
  patchTrainingValidators,
  bulkActionsValidators,
};
