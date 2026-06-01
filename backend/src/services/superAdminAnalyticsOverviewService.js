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

function emptyEventCounts() {
  const counts = {};
  for (const name of [
    "signup_completed",
    "user_logged_in",
    "client_order_created",
    "fixed_order_taken",
    "bid_submitted",
    "order_completed",
    "subscription_purchased",
    "financial_claim_submitted",
  ]) {
    counts[name] = 0;
  }
  return counts;
}

function formatPosthogError(err) {
  const code = err?.publicCode || "";
  if (code === "PH_QUERY_TIMEOUT" || err?.name === "AbortError") {
    return "استغرق استعلام PostHog وقتاً أطول من المتوقع.";
  }
  return err?.message || "PostHog analytics query failed.";
}

async function loadPosthogSlice(cfg, { range, topLimit }) {
  if (!cfg) {
    return {
      slice: null,
      error: "PostHog غير مُعدّ على الخادم (POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY).",
    };
  }

  try {
    const slice = await posthogAnalyticsService.fetchSuperAdminOverviewPosthogWithTimeout(cfg, {
      range,
      topLimit,
    });
    return { slice, error: null };
  } catch (err) {
    return { slice: null, error: formatPosthogError(err) };
  }
}

async function getAnalyticsOverview({ range: rangeIn, topLimit } = {}) {
  const range = normalizeRange(rangeIn);
  const updatedAt = new Date().toISOString();
  const cfg = posthogAnalyticsService.readPosthogCredentialsLoose();

  const [dbResult, posthogResult] = await Promise.all([
    Promise.all([
      businessMetrics.getRevenueTodayJod(),
      businessMetrics.getActivePaidSubscriptionsCount(),
      businessMetrics.getRevenueByDayLast7Days(),
    ]),
    loadPosthogSlice(cfg, { range, topLimit }),
  ]);

  const [revenueTodayJod, activeSubscriptions, revenueByDay] = dbResult;
  const posthogSlice = posthogResult.slice;
  const posthogError = posthogResult.error;
  const events = posthogSlice?.eventCounts || emptyEventCounts();

  return {
    updatedAt,
    range,
    meta: {
      posthogConfigured: Boolean(cfg),
      posthogError,
      currency: "JOD",
    },
    kpis: {
      visitorsToday: posthogSlice?.kpisToday?.visitorsToday ?? null,
      activeUsersToday: posthogSlice?.kpisToday?.activeUsersToday ?? null,
      ordersToday: posthogSlice?.kpisToday?.ordersToday ?? null,
      revenueTodayJod,
      activeSubscriptions,
    },
    trends: {
      visitorsByDay: posthogSlice?.trends?.visitorsByDay ?? [],
      ordersByDay: posthogSlice?.trends?.ordersByDay ?? [],
      revenueByDay,
    },
    events,
    topPages: posthogSlice?.topPages ?? [],
    conversion: buildConversionSummary(events),
  };
}

module.exports = {
  getAnalyticsOverview,
};
