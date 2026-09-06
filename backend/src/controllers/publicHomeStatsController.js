const platformUiSettingsService = require("../services/platformUiSettingsService");
const publicHomeOrderStatsService = require("../services/publicHomeOrderStatsService");
const analyticsHealthService = require("../services/analyticsHealthService");

const PUBLIC_HOME_STATS_RESPONSE_CACHE_MS = Math.min(
  Math.max(Number(process.env.PUBLIC_HOME_STATS_RESPONSE_CACHE_MS) || 60_000, 30_000),
  120_000,
);

/** @type {{ value: object | null, expires: number }} */
let homeStatsResponseCache = { value: null, expires: 0 };
/** @type {Promise<object> | null} */
let homeStatsInflight = null;

function invalidatePublicHomeStatsResponseCache() {
  homeStatsResponseCache = { value: null, expires: 0 };
  homeStatsInflight = null;
}

function buildOrderPayload(orderCounts) {
  if (orderCounts == null) {
    return {
      openProjects: null,
      inProgressProjects: null,
      completedProjects: null,
      availableOrdersNow: null,
      completedOrders: null,
      trainingRotationsCompleted: null,
      orderCountsDegraded: true,
    };
  }
  return {
    openProjects: orderCounts.openProjects,
    inProgressProjects: orderCounts.inProgressProjects,
    completedProjects: orderCounts.completedProjects,
    availableOrdersNow: orderCounts.availableOrdersNow,
    availableOrdersNowReal: orderCounts.availableOrdersNowReal,
    availableOrdersNowTraining: orderCounts.availableOrdersNowTraining,
    completedOrders: orderCounts.completedOrders,
    completedOrdersReal: orderCounts.completedOrdersReal,
    trainingRotationsCompleted: orderCounts.trainingRotationsCompletedTotal,
    trainingRotationsCompletedTotal: orderCounts.trainingRotationsCompletedTotal,
    trainingRotationsCompletedSinceCutoff: orderCounts.trainingRotationsCompletedSinceCutoff,
    homepageTrainingCompletedCutoffAt: orderCounts.homepageTrainingCompletedCutoffAt,
  };
}

async function computePublicHomeStatsPayload() {
  const { perfStart } = require("../utils/perfLog");
  const totalTimer = perfStart("public_home_stats", "compute");

  const settings = await platformUiSettingsService.getPlatformUiSettings();
  const showVisitorsCount = Boolean(settings.showHomeVisitorsCount);
  const showActiveUsersCount = Boolean(settings.showHomeActiveUsersCount);

  const orderCountsPromise = publicHomeOrderStatsService.getPublicHomeOrderCounts().catch(() => null);
  const analyticsPromise =
    showVisitorsCount || showActiveUsersCount
      ? analyticsHealthService.getPublicHomeAnalyticsMeta({
          showVisitorsCount,
          showActiveUsersCount,
        })
      : Promise.resolve(null);

  const [orderCounts, meta] = await Promise.all([orderCountsPromise, analyticsPromise]);
  const orderPayload = buildOrderPayload(orderCounts);

  const payload = meta
    ? {
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
      }
    : {
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
      };

  totalTimer.end({
    showVisitorsCount,
    showActiveUsersCount,
    orderCountsDegraded: Boolean(orderPayload.orderCountsDegraded),
  });
  return payload;
}

async function getPublicHomeStats(req, res, next) {
  try {
    const now = Date.now();
    if (homeStatsResponseCache.value && homeStatsResponseCache.expires > now) {
      return res.status(200).json(homeStatsResponseCache.value);
    }
    if (homeStatsInflight) {
      const payload = await homeStatsInflight;
      return res.status(200).json(payload);
    }

    homeStatsInflight = computePublicHomeStatsPayload()
      .then((payload) => {
        homeStatsResponseCache = {
          value: payload,
          expires: Date.now() + PUBLIC_HOME_STATS_RESPONSE_CACHE_MS,
        };
        return payload;
      })
      .finally(() => {
        homeStatsInflight = null;
      });

    const payload = await homeStatsInflight;
    return res.status(200).json(payload);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getPublicHomeStats,
  invalidatePublicHomeStatsResponseCache,
};
