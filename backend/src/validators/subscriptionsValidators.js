const { body, param, query } = require("express-validator");

const subscriptionIdParam = [param("id").isInt({ min: 1 }).withMessage("Invalid subscription id.")];

const freelancerIdParam = [
  param("freelancerUserId").isInt({ min: 1 }).withMessage("Invalid freelancer user id."),
];

const assignSubscriptionValidators = [
  body("freelancerUserId").isInt({ min: 1 }).withMessage("freelancerUserId is required."),
  body("planId").isInt({ min: 1 }).withMessage("planId is required."),
  body("notes").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("Invalid notes."),
];

const updateSubscriptionValidators = [
  ...subscriptionIdParam,
  body("status")
    .optional()
    .isIn(["assigned_not_started", "active", "expired", "inactive", "cancelled"])
    .withMessage("Invalid status."),
  body("hasFirstOrder").optional().isBoolean().withMessage("hasFirstOrder must be boolean."),
  body("firstOrderDate").optional({ nullable: true }).isISO8601().withMessage("firstOrderDate must be ISO8601 date."),
  body("notes").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("Invalid notes."),
];

const listSubscriptionsValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("Invalid page."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Invalid limit."),
  query("freelancerUserId").optional().isInt({ min: 1 }).withMessage("Invalid freelancerUserId."),
  query("planId").optional().isInt({ min: 1 }).withMessage("Invalid planId."),
  query("search").optional().isString().trim().isLength({ max: 120 }).withMessage("Invalid search."),
  query("status")
    .optional()
    .isIn(["assigned_not_started", "active", "expired", "inactive", "cancelled"])
    .withMessage("Invalid status."),
];

const updateSubscriptionNotificationEmailValidators = [
  body("email").custom((value) => {
    if (value == null) throw new Error("يرجى إدخال بريد إلكتروني صحيح");
    const str = String(value).trim();
    if (str === "") return true; // empty clears the setting (falls back to env)
    if (str.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
      throw new Error("يرجى إدخال بريد إلكتروني صحيح");
    }
    return true;
  }),
];

const freelancerSelfSubscribeValidators = [
  body("planId")
    .custom((value) => {
      if (value === undefined || value === null || value === "") return false;
      const n = typeof value === "number" ? value : parseInt(String(value).trim(), 10);
      return Number.isInteger(n) && n >= 1;
    })
    .withMessage("planId must be a positive integer."),
];

const freelancerConfirmCheckoutValidators = [
  body("sessionId").isString().trim().isLength({ min: 1, max: 255 }).withMessage("sessionId is required."),
];

const activateSubscriptionValidators = [...subscriptionIdParam];

const markActivationFeePaidOfflineValidators = [
  body("freelancerUserId").isInt({ min: 1 }).withMessage("freelancerUserId is required."),
  body("notes").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }).withMessage("Invalid notes."),
];

module.exports = {
  subscriptionIdParam,
  freelancerIdParam,
  assignSubscriptionValidators,
  updateSubscriptionValidators,
  listSubscriptionsValidators,
  updateSubscriptionNotificationEmailValidators,
  freelancerSelfSubscribeValidators,
  freelancerConfirmCheckoutValidators,
  activateSubscriptionValidators,
  markActivationFeePaidOfflineValidators,
};

