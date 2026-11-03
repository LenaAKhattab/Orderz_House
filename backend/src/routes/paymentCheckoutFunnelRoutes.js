const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/rbacMiddleware");
const { userOrIpKey, rateLimitJsonHandler } = require("../middleware/rateLimitHelpers");
const { postCheckoutFunnelEvent } = require("../controllers/paymentCheckoutFunnelController");

const router = express.Router();

const checkoutFunnelEventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => userOrIpKey("checkout_funnel", req),
  handler: rateLimitJsonHandler(
    "checkout_funnel_events",
    "تم تجاوز حد إشارات الدفع، حاول لاحقاً",
    { windowMsFallback: 60 * 1000 },
  ),
});

router.post(
  "/checkout-funnel-events",
  requireAuth,
  checkoutFunnelEventLimiter,
  postCheckoutFunnelEvent,
);

module.exports = router;
