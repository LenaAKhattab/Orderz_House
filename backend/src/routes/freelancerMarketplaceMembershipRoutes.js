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

module.exports = router;
