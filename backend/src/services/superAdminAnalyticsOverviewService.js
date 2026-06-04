/**
 * Super Admin analytics overview: Postgres business facts + PostHog product analytics.
 * PostHog failures do not fail the whole response (graceful degradation).
 */

const posthogAnalyticsService = require("./posthogAnalyticsService");
const businessMetrics = require("./superAdminBusinessMetricsService");
const { getOrSet } = require("../utils/superAdminDashboardCache");
const { timedDashboardSection } = require("../utils/superAdminDashboardTiming");

const POSTHOG_OVERVIEW_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.SUPERADMIN_DASHBOARD_POSTHOG_CACHE_MS) || 120_000, 60_000),
  300_000,
);

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

async function getPosthogProductAnalytics({ range: rangeIn, topLimit } = {}) {
  const range = normalizeRange(rangeIn);
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(topLimit) || 10)));
  const cacheKey = `posthog-overview:${range}:${limit}`;

  return getOrSet(cacheKey, POSTHOG_OVERVIEW_CACHE_TTL_MS, async () => {
    const updatedAt = new Date().toISOString();
    const cfg = posthogAnalyticsService.readPosthogCredentialsLoose();
    const posthogResult = await timedDashboardSection("analytics/visitors", "posthog", () =>
      loadPosthogSlice(cfg, { range, topLimit: limit }),
    );
    const posthogSlice = posthogResult.slice;
    const posthogError = posthogResult.error;
    const events = posthogError || !posthogSlice ? null : posthogSlice.eventCounts || emptyEventCounts();

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
      },
      trends: {
        visitorsByDay: posthogSlice?.trends?.visitorsByDay ?? [],
        ordersByDay: posthogSlice?.trends?.ordersByDay ?? [],
      },
      events,
      topPages: posthogSlice?.topPages ?? [],
      conversion: buildConversionSummary(events),
    };
  });
}

/** Full overview (DB + PostHog) — used by dedicated analytics pages. */
async function getAnalyticsOverview({ range: rangeIn, topLimit } = {}) {
  const range = normalizeRange(rangeIn);
  const [business, posthog] = await Promise.all([
    businessMetrics.getDashboardBusinessKpis(),
    getPosthogProductAnalytics({ range, topLimit }),
  ]);

  return {
    ...posthog,
    updatedAt: new Date().toISOString(),
    range,
    meta: {
      ...posthog.meta,
      currency: business.currency || "JOD",
    },
    kpis: {
      ...posthog.kpis,
      revenueTodayJod: business.revenueTodayJod,
      activeSubscriptions: business.activeSubscriptions,
    },
    trends: {
      ...posthog.trends,
      revenueByDay: business.revenueByDay,
    },
  };
}

module.exports = {
  getAnalyticsOverview,
  getPosthogProductAnalytics,
};
