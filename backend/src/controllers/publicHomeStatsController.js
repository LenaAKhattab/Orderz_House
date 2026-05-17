const platformUiSettingsService = require("../services/platformUiSettingsService");
const publicHomeOrderStatsService = require("../services/publicHomeOrderStatsService");
const analyticsHealthService = require("../services/analyticsHealthService");

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
          visitorsReason: "toggle_off",
          activeUsersReason: "toggle_off",
          ...orderPayload,
        },
      });
    }

    const meta = await analyticsHealthService.getPublicHomeAnalyticsMeta({
      showVisitorsCount,
      showActiveUsersCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        showVisitorsCount,
        showActiveUsersCount,
        visitors: meta.visitors,
        activeUsers: meta.activeUsers,
        visitorsReason: meta.reasons.visitors,
        activeUsersReason: meta.reasons.activeUsers,
        analyticsQueriedAt: meta.queriedAt,
        analyticsLastPageviewAt: meta.lastPageviewAt,
        ...orderPayload,
        ...(meta.analyticsDegraded ? { analyticsDegraded: true } : {}),
        ...(meta.analyticsMisconfigured ? { analyticsMisconfigured: true } : {}),
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublicHomeStats,
};
