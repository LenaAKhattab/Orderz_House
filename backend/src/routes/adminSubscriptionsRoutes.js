const express = require("express");
const subscriptionsController = require("../controllers/subscriptionsController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");

/**
 * Policy: `admin` and `super_admin` may assign plans, update subscription rows, and read freelancer
 * subscription/eligibility (same as company-activation). Creating/editing plan *templates* stays
 * super_admin-only in adminPlansRoutes.js.
 */
const ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES = ["admin", "super_admin"];
const {
  assignSubscriptionValidators,
  updateSubscriptionValidators,
  listSubscriptionsValidators,
  freelancerIdParam,
  activateSubscriptionValidators,
} = require("../validators/subscriptionsValidators");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/subscriptions",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  listSubscriptionsValidators,
  validateRequest,
  subscriptionsController.listSubscriptions,
);
router.post(
  "/subscriptions/assign",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  assignSubscriptionValidators,
  validateRequest,
  subscriptionsController.assignPlan,
);
router.patch(
  "/subscriptions/:id",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  updateSubscriptionValidators,
  validateRequest,
  subscriptionsController.updateSubscription,
);
router.get(
  "/freelancers/:freelancerUserId/subscription",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerCurrentSubscription,
);
router.get(
  "/freelancers/:freelancerUserId/eligibility",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerEligibility,
);
router.patch(
  "/subscriptions/:id/company-activate",
  requireAnyRole(ASSIGN_AND_MANAGE_SUBSCRIPTION_ROLES),
  activateSubscriptionValidators,
  validateRequest,
  subscriptionsController.activateSubscriptionCompanyApproval,
);

module.exports = router;

