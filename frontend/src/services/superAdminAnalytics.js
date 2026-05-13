/**
 * Super Admin analytics API — thin wrapper for clearer imports / future caching.
 */
export {
  getSuperadminVisitorsAnalyticsRequest as fetchSuperAdminOverview,
  getSuperadminHeroHomeStatsSettingRequest,
  patchSuperadminHeroHomeStatsSettingRequest,
} from "./api";
