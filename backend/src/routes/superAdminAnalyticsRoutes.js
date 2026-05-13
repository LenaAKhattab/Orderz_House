const express = require("express");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
const superAdminAnalyticsController = require("../controllers/superAdminAnalyticsController");

const router = express.Router();

router.get(
  "/analytics/visitors",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getVisitorsAnalytics,
);

router.get(
  "/platform/home-hero-stats",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getHeroPlatformSettings,
);

router.patch(
  "/platform/home-hero-stats",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.patchHeroPlatformSettings,
);

module.exports = router;
