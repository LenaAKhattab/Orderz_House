const express = require("express");
const subscriptionsController = require("../controllers/subscriptionsController");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const {
  assignSubscriptionValidators,
  updateSubscriptionValidators,
  listSubscriptionsValidators,
  freelancerIdParam,
} = require("../validators/subscriptionsValidators");

const router = express.Router();

// super_admin only
router.use(requireAuth, requireRole("super_admin"));

router.get("/subscriptions", listSubscriptionsValidators, validateRequest, subscriptionsController.listSubscriptions);
router.post("/subscriptions/assign", assignSubscriptionValidators, validateRequest, subscriptionsController.assignPlan);
router.patch("/subscriptions/:id", updateSubscriptionValidators, validateRequest, subscriptionsController.updateSubscription);
router.get(
  "/freelancers/:freelancerUserId/subscription",
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerCurrentSubscription,
);
router.get(
  "/freelancers/:freelancerUserId/eligibility",
  freelancerIdParam,
  validateRequest,
  subscriptionsController.getFreelancerEligibility,
);

module.exports = router;

