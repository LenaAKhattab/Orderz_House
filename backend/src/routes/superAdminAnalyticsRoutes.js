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

router.get(
  "/analytics/health",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getAnalyticsHealth,
);

router.get(
  "/dashboard/summary",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardSummary,
);

module.exports = router;
