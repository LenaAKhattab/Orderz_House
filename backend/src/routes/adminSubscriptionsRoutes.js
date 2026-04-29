const express = require("express");
const subscriptionsController = require("../controllers/subscriptionsController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole, requireAnyRole } = require("../middleware/rbacMiddleware");
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
  requireAnyRole(["admin", "super_admin"]),
  listSubscriptionsValidators,
  validateRequest,
  subscriptionsController.listSubscriptions,
);
router.post(
  "/subscriptions/assign",
  requireRole("super_admin"),
  assignSubscriptionValidators,
  validateRequest,
  subscriptionsController.assignPlan,
);
router.patch("/subscriptions/:id", requireRole("super_admin"), updateSubscriptionValidators, validateRequest, subscriptionsController.updateSubscription);
router.get(
  "/freelancers/:freelancerUserId/subscription",
  requireRole("super_admin"),
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerCurrentSubscription,
);
router.get(
  "/freelancers/:freelancerUserId/eligibility",
  requireRole("super_admin"),
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerEligibility,
);
router.patch(
  "/subscriptions/:id/company-activate",
  requireAnyRole(["admin", "super_admin"]),
  activateSubscriptionValidators,
  validateRequest,
  subscriptionsController.activateSubscriptionCompanyApproval,
);

module.exports = router;

