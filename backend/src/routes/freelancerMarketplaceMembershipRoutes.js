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

module.exports = router;
