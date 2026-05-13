/**
 * Super Admin analytics overview: Postgres business facts + PostHog product analytics.
 * PostHog failures do not fail the whole response (graceful degradation).
 */

const posthogAnalyticsService = require("./posthogAnalyticsService");
const businessMetrics = require("./superAdminBusinessMetricsService");

function normalizeRange(range) {
  const r = String(range || "7d").trim();
  return posthogAnalyticsService.RANGE_PRESETS[r] ? r : "7d";
}

function buildConversionSummary(eventCounts = {}) {
  const signups = Math.trunc(Number(eventCounts.signup_completed) || 0);
  const logins = Math.trunc(Number(eventCounts.user_logged_in) || 0);
  const subs = Math.trunc(Number(eventCounts.subscription_purchased) || 0);
  const ordersDone = Math.trunc(Number(eventCounts.order_completed) || 0);
  return {
    signups,
    logins,
    subscriptionsPurchased: subs,
    ordersCompleted: ordersDone,
    signupToLoginRatio: signups > 0 ? logins / signups : null,
  };
}

async function getAnalyticsOverview({ range: rangeIn, topLimit } = {}) {
  const range = normalizeRange(rangeIn);
  const updatedAt = new Date().toISOString();

  const [revenueTodayJod, activeSubscriptions, revenueByDay] = await Promise.all([
    businessMetrics.getRevenueTodayJod(),
    businessMetrics.getActivePaidSubscriptionsCount(),
    businessMetrics.getRevenueByDayLast7Days(),
  ]);

  const cfg = posthogAnalyticsService.readPosthogCredentialsLoose();
  let posthogSlice = null;
  let posthogError = null;

  if (cfg) {
    try {
      posthogSlice = await posthogAnalyticsService.fetchSuperAdminOverviewPosthog(cfg, { range, topLimit });
    } catch (err) {
      posthogError = err?.message || "PostHog analytics query failed.";
    }
  } else {
    posthogError = "PostHog غير مُعدّ على الخادم (POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY).";
  }

  const ph = posthogSlice;
  const events = ph?.eventCounts || {};

  return {
    updatedAt,
    range,
    meta: {
      posthogConfigured: Boolean(cfg),
      posthogError,
      currency: "JOD",
    },
    kpis: {
      visitorsToday: ph?.kpisToday?.visitorsToday ?? null,
      activeUsersToday: ph?.kpisToday?.activeUsersToday ?? null,
      ordersToday: ph?.kpisToday?.ordersToday ?? null,
      revenueTodayJod,
      activeSubscriptions,
    },
    trends: {
      visitorsByDay: ph?.trends?.visitorsByDay ?? [],
      ordersByDay: ph?.trends?.ordersByDay ?? [],
      revenueByDay,
    },
    events,
    topPages: ph?.topPages ?? [],
    conversion: buildConversionSummary(events),
  };
}

module.exports = {
  getAnalyticsOverview,
};
