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
  query("freelancerUserId").optional().isInt({ min: 1 }).withMessage("Invalid freelancerUserId."),
  query("status").optional().isString().trim().isLength({ min: 2, max: 40 }).withMessage("Invalid status."),
];

const freelancerSelfSubscribeValidators = [
  body("planId").isInt({ min: 1 }).withMessage("planId is required."),
];

const activateSubscriptionValidators = [...subscriptionIdParam];

module.exports = {
  subscriptionIdParam,
  freelancerIdParam,
  assignSubscriptionValidators,
  updateSubscriptionValidators,
  listSubscriptionsValidators,
  freelancerSelfSubscribeValidators,
  activateSubscriptionValidators,
};

