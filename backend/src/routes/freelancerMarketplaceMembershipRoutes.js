const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const marketplaceMembershipsController = require("../controllers/marketplaceMembershipsController");

const router = express.Router();

router.use(requireAuth, requireRole("freelancer"));

/**
 * GET /api/freelancer/marketplace-membership
 * Read-only snapshot. Does not consume Priority Bid uses.
 */
router.get("/marketplace-membership", marketplaceMembershipsController.getMyMarketplaceMembership);

/** E1: Starter free activation after verification (no company queue). */
router.post(
  "/marketplace-membership/starter/activate",
  marketplaceMembershipsController.activateStarter,
);

/** E1: Paid activation request — waits for company approval ("ابدأ اشتراكي"). */
router.post(
  "/marketplace-membership/activation-requests",
  marketplaceMembershipsController.requestPaidActivation,
);

/**
 * Marketplace-M2: Stripe Checkout for paid SILVER/PRO/ELITE.
 * Does NOT grant membership (webhook M3). STARTER rejected.
 */
router.post(
  "/marketplace-membership/checkout",
  marketplaceMembershipsController.createMarketplaceMembershipCheckout,
);

/** Alias matching plural resource naming used in M2 design notes. */
router.post(
  "/marketplace-memberships/checkout",
  marketplaceMembershipsController.createMarketplaceMembershipCheckout,
);

module.exports = router;
