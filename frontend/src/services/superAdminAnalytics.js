/**
 * Super Admin analytics API — thin wrapper for clearer imports / future caching.
 */
export {
  getSuperadminVisitorsAnalyticsRequest as fetchSuperAdminOverview,
  getSuperadminDashboardBusinessKpisRequest as fetchSuperAdminBusinessKpis,
  getSuperadminHeroHomeStatsSettingRequest,
  patchSuperadminHeroHomeStatsSettingRequest,
  getSuperadminAnalyticsHealthRequest,
  getSuperadminDashboardHomeBundleRequest,
  getSuperadminDashboardHomeFastRequest,
  getSuperadminDashboardExecutiveKpisRequest,
  getSuperadminDashboardHomeIntelligenceRequest,
  getSuperadminDashboardIntelligenceSummaryRequest,
  getSuperadminDashboardIntelligenceOrdersRequest,
  getSuperadminDashboardIntelligenceClientsRequest,
  getSuperadminDashboardIntelligenceFreelancersRequest,
  getSuperadminDashboardIntelligenceSubscriptionsRequest,
  getSuperadminDashboardIntelligenceCoursesRequest,
  getSuperadminDashboardIntelligenceCategoriesRequest,
  getSuperadminDashboardIntelligenceFinancialRequest,
  getSuperadminDashboardIntelligenceAttentionRequest,
  getSuperadminDashboardIntelligenceActivityRequest,
} from "./api";
