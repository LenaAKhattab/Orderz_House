const express = require("express");
const { requireAuth, requireAnyRole, requirePermission, requireAnyPermission } = require("../middleware/rbacMiddleware");
const { PERMISSION_KEYS } = require("../constants/dashboardPermissions");
const superAdminAnalyticsController = require("../controllers/superAdminAnalyticsController");

const router = express.Router();

const superAdminOnly = [requireAuth, requireAnyRole(["super_admin"])];
const overviewGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.OVERVIEW),
];
const plansIntelGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requireAnyPermission([PERMISSION_KEYS.OVERVIEW, PERMISSION_KEYS.PLANS]),
];
const analyticsGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission(PERMISSION_KEYS.ANALYTICS),
];

router.get("/analytics/visitors", ...overviewGuard, superAdminAnalyticsController.getVisitorsAnalytics);

router.get("/platform/home-hero-stats", ...superAdminOnly, superAdminAnalyticsController.getHeroPlatformSettings);
router.patch("/platform/home-hero-stats", ...superAdminOnly, superAdminAnalyticsController.patchHeroPlatformSettings);

router.get("/analytics/health", ...superAdminOnly, superAdminAnalyticsController.getAnalyticsHealth);

router.get("/dashboard/summary", ...overviewGuard, superAdminAnalyticsController.getDashboardSummary);
router.get("/dashboard/business-kpis", ...overviewGuard, superAdminAnalyticsController.getDashboardBusinessKpis);
router.get("/dashboard/home-bundle", ...overviewGuard, superAdminAnalyticsController.getDashboardHomeBundle);
router.get("/dashboard/home-fast", ...overviewGuard, superAdminAnalyticsController.getDashboardHomeFast);
router.get("/dashboard/executive-kpis", ...overviewGuard, superAdminAnalyticsController.getDashboardHomeExecutiveKpis);
router.get("/dashboard/home-intelligence", ...overviewGuard, superAdminAnalyticsController.getDashboardHomeIntelligence);

router.get("/dashboard/analysis", ...analyticsGuard, superAdminAnalyticsController.getDashboardAnalysis);

router.get("/dashboard/intelligence/summary", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceSummary);
router.get("/dashboard/intelligence/orders", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceOrders);
router.get("/dashboard/intelligence/clients", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceClients);
router.get("/dashboard/intelligence/freelancers", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceFreelancers);
router.get(
  "/dashboard/intelligence/subscriptions",
  ...plansIntelGuard,
  superAdminAnalyticsController.getDashboardIntelligenceSubscriptions,
);
router.get("/dashboard/intelligence/courses", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceCourses);
router.get("/dashboard/intelligence/categories", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceCategories);
router.get("/dashboard/intelligence/financial", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceFinancial);
router.get("/dashboard/intelligence/attention", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceAttention);
router.get("/dashboard/intelligence/activity", ...overviewGuard, superAdminAnalyticsController.getDashboardIntelligenceActivity);

module.exports = router;
