const express = require("express");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const subscriptionsService = require("../services/subscriptionsService");

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

module.exports = router;

