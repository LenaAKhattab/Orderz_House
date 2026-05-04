const express = require("express");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const subscriptionsService = require("../services/subscriptionsService");
const subscriptionsController = require("../controllers/subscriptionsController");
const {
  freelancerSelfSubscribeValidators,
  freelancerConfirmCheckoutValidators,
} = require("../validators/subscriptionsValidators");

const router = express.Router();

// Authenticated freelancer endpoints (read-only)
router.use(requireAuth, requireRole("freelancer"));

router.get("/subscription", async (req, res, next) => {
  try {
    const subscription = await subscriptionsService.getCurrentSubscriptionForFreelancer(req.auth.userId);
    return res.status(200).json({ success: true, data: { subscription } });
  } catch (err) {
    return next(err);
  }
});

router.get("/eligibility", async (req, res, next) => {
  try {
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

module.exports = router;

