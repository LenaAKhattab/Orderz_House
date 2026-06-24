const express = require("express");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const subscriptionsService = require("../services/subscriptionsService");
const subscriptionsController = require("../controllers/subscriptionsController");
const { getActivationFeeStatus } = require("../services/subscriptionActivationFeeService");
const {
  freelancerSelfSubscribeValidators,
  freelancerConfirmCheckoutValidators,
} = require("../validators/subscriptionsValidators");

const router = express.Router();

// Authenticated freelancer endpoints (read-only)
router.use(requireAuth, requireRole("freelancer"));

router.get("/subscription", async (req, res, next) => {
  try {
    await subscriptionsService.maybeEnsureFreelancerDefaultFreePlan(req.auth.userId);
    const uid = req.auth.userId;
    const [subscription, activationFeeStatus] = await Promise.all([
      subscriptionsService.getCurrentSubscriptionForFreelancer(uid),
      getActivationFeeStatus(uid),
    ]);
    return res.status(200).json({ success: true, data: { subscription, activationFeeStatus } });
  } catch (err) {
    return next(err);
  }
});

router.get("/eligibility", async (req, res, next) => {
  try {
    await subscriptionsService.maybeEnsureFreelancerDefaultFreePlan(req.auth.userId);
    const eligibility = await subscriptionsService.canFreelancerTakeOrders(req.auth.userId);
    return res.status(200).json({ success: true, data: eligibility });
  } catch (err) {
    return next(err);
  }
});

router.post(
  "/subscriptions/checkout",
  freelancerSelfSubscribeValidators,
  validateRequest,
  subscriptionsController.createFreelancerSubscriptionCheckout,
);

router.post(
  "/subscriptions/confirm-checkout",
  freelancerConfirmCheckoutValidators,
  validateRequest,
  subscriptionsController.confirmFreelancerSubscriptionCheckout,
);

router.post(
  "/subscriptions/checkout-cancel-notify",
  freelancerConfirmCheckoutValidators,
  validateRequest,
  subscriptionsController.recordFreelancerSubscriptionCheckoutCancelledNotify,
);

module.exports = router;

