const { body, param, query } = require("express-validator");
const {
  BILDAZO_AUTHOR_LINK_FLOWS,
  BILDAZO_AUTHOR_LINK_STATUSES,
  BILDAZO_ADMIN_REVIEW_STATUSES,
} = require("../constants/bildazoAuthorLink");

const idParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الطلب غير صالح.")];

const listBildazoAuthorLinkValidators = [
  query("status")
    .optional({ nullable: true, checkFalsy: true })
    .isIn(["all", ...BILDAZO_AUTHOR_LINK_STATUSES])
    .withMessage("حالة الربط غير صالحة."),
  query("linkFlow")
    .optional({ nullable: true, checkFalsy: true })
    .isIn(BILDAZO_AUTHOR_LINK_FLOWS)
    .withMessage("نوع طلب الربط غير صالح."),
  query("search").optional({ nullable: true }).isString().isLength({ max: 80 }),
  query("q").optional({ nullable: true }).isString().isLength({ max: 80 }),
  query("page").optional({ checkFalsy: true }).isInt({ min: 1 }),
  query("limit").optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }),
];

const rejectSensitive = [
  body("password").not().exists().withMessage("لا يتم جمع كلمة مرور Bildazo."),
  body("passwordHash").not().exists().withMessage("لا يتم جمع كلمة مرور Bildazo."),
  body("role").not().exists().withMessage("حقل غير مسموح."),
  body("roleId").not().exists().withMessage("حقل غير مسموح."),
  body("token").not().exists().withMessage("حقل غير مسموح."),
  body("adminToken").not().exists().withMessage("حقل غير مسموح."),
];

const manualLinkValidators = [
  ...idParam,
  ...rejectSensitive,
  body("confirmVerified")
    .custom((v) => v === true || v === "true" || v === 1)
    .withMessage("يجب تأكيد التحقق من ملكية حساب Bildazo قبل الربط."),
  body("bildazoUserId").optional({ nullable: true }).isString().isLength({ max: 80 }),
  body("bildazoPublicId").optional({ nullable: true }).isString().isLength({ max: 120 }),
  body("bildazoProfileUrl").optional({ nullable: true }).isString().isLength({ max: 500 }),
  body("manualReviewReason").optional({ nullable: true }).isString().isLength({ max: 2000 }),
];

const updateStatusValidators = [
  ...idParam,
  ...rejectSensitive,
  body("status")
    .isIn(BILDAZO_ADMIN_REVIEW_STATUSES)
    .withMessage("الحالة المسموحة: مراجعة يدوية أو فشل أو إيقاف."),
  body("manualReviewReason").optional({ nullable: true }).isString().isLength({ max: 2000 }),
];

module.exports = {
  listBildazoAuthorLinkValidators,
  manualLinkValidators,
  updateStatusValidators,
};
