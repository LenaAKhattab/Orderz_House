const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const marketplaceMembershipsController = require("../controllers/marketplaceMembershipsController");

const router = express.Router();

const guard = [requireAuth, requireSuperAdmin];

/**
 * Read-only Super Admin inspection. No silent Production activation endpoint.
 */
router.get(
  "/marketplace-memberships",
  ...guard,
  marketplaceMembershipsController.listAdminMarketplaceMemberships,
);

router.get(
  "/marketplace-memberships/:id",
  ...guard,
  marketplaceMembershipsController.getAdminMarketplaceMembership,
);

module.exports = router;
