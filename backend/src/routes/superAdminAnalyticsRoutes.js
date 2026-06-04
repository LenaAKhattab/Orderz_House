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

router.get(
  "/dashboard/business-kpis",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardBusinessKpis,
);

router.get(
  "/dashboard/home-bundle",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardHomeBundle,
);

router.get(
  "/dashboard/home-fast",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardHomeFast,
);

router.get(
  "/dashboard/executive-kpis",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardHomeExecutiveKpis,
);

router.get(
  "/dashboard/home-intelligence",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardHomeIntelligence,
);

router.get(
  "/dashboard/intelligence/summary",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceSummary,
);

router.get(
  "/dashboard/intelligence/orders",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceOrders,
);

router.get(
  "/dashboard/intelligence/clients",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceClients,
);

router.get(
  "/dashboard/intelligence/freelancers",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceFreelancers,
);

router.get(
  "/dashboard/intelligence/subscriptions",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceSubscriptions,
);

router.get(
  "/dashboard/intelligence/courses",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceCourses,
);

router.get(
  "/dashboard/intelligence/categories",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceCategories,
);

router.get(
  "/dashboard/intelligence/financial",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceFinancial,
);

router.get(
  "/dashboard/intelligence/attention",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceAttention,
);

router.get(
  "/dashboard/intelligence/activity",
  requireAuth,
  requireAnyRole(["super_admin"]),
  superAdminAnalyticsController.getDashboardIntelligenceActivity,
);

module.exports = router;
