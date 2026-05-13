const platformUiSettingsService = require("../services/platformUiSettingsService");
const posthogAnalyticsService = require("../services/posthogAnalyticsService");
const publicHomeOrderStatsService = require("../services/publicHomeOrderStatsService");

async function getPublicHomeStats(req, res, next) {
  try {
    const settings = await platformUiSettingsService.getPlatformUiSettings();
    const showVisitorsCount = Boolean(settings.showHomeVisitorsCount);
    const showActiveUsersCount = Boolean(settings.showHomeActiveUsersCount);

    let orderCounts = null;
    try {
      orderCounts = await publicHomeOrderStatsService.getPublicHomeOrderCounts();
    } catch {
      orderCounts = null;
    }

    const orderPayload =
      orderCounts == null
        ? {
            openProjects: null,
            inProgressProjects: null,
            completedProjects: null,
            orderCountsDegraded: true,
          }
        : {
            openProjects: orderCounts.openProjects,
            inProgressProjects: orderCounts.inProgressProjects,
            completedProjects: orderCounts.completedProjects,
          };

    if (!showVisitorsCount && !showActiveUsersCount) {
      return res.status(200).json({
        success: true,
        data: {
          showVisitorsCount: false,
          showActiveUsersCount: false,
          visitors: null,
          activeUsers: null,
          ...orderPayload,
        },
      });
    }

    let visitors = null;
    let activeUsers = null;
    let analyticsDegraded = false;

    try {
      const snap = await posthogAnalyticsService.getHeroSnapshotNumbers();
      if (showVisitorsCount) visitors = snap.visitorsLast7Days;
      if (showActiveUsersCount) activeUsers = snap.activeUsersLast7Days;
    } catch {
      analyticsDegraded = true;
      if (showVisitorsCount) visitors = null;
      if (showActiveUsersCount) activeUsers = null;
    }

    return res.status(200).json({
      success: true,
      data: {
        showVisitorsCount,
        showActiveUsersCount,
        visitors,
        activeUsers,
        ...orderPayload,
        ...(analyticsDegraded ? { analyticsDegraded: true } : {}),
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublicHomeStats,
};
