const superAdminDashboardSummaryService = require("./superAdminDashboardSummaryService");
const superAdminBusinessMetricsService = require("./superAdminBusinessMetricsService");
const superAdminAnalyticsOverviewService = require("./superAdminAnalyticsOverviewService");
const intelligence = require("./superAdminDashboardIntelligenceService");
const { getOrSet } = require("../utils/superAdminDashboardCache");
const { timedDashboardSection } = require("../utils/superAdminDashboardTiming");

const ENDPOINT_FAST = "home-fast";
const ENDPOINT_EXECUTIVE = "executive-kpis";
const ENDPOINT_INTELLIGENCE = "home-intelligence";
const ENDPOINT_POSTHOG = "analytics/visitors";
const ENDPOINT_BUNDLE = "home-bundle";

const FAST_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.SUPERADMIN_DASHBOARD_FAST_CACHE_MS) || 20_000, 15_000),
  30_000,
);
const EXECUTIVE_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.SUPERADMIN_DASHBOARD_EXECUTIVE_CACHE_MS) || 30_000, 15_000),
  60_000,
);
const INTELLIGENCE_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.SUPERADMIN_DASHBOARD_INTELLIGENCE_CACHE_MS) || 45_000, 30_000),
  60_000,
);
const POSTHOG_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.SUPERADMIN_DASHBOARD_POSTHOG_CACHE_MS) || 120_000, 60_000),
  300_000,
);

function toInt(v) {
  return Math.max(0, Math.trunc(Number(v) || 0));
}

function mergeSectionErrors(...sections) {
  const sectionErrors = {};
  for (const section of sections) {
    const err = section?.meta?.sectionErrors;
    if (err && typeof err === "object") {
      Object.assign(sectionErrors, err);
    }
  }
  return Object.keys(sectionErrors).length ? { sectionErrors } : {};
}

function buildUnifiedAttention(attentionSection, summaryAttention) {
  const alerts = (attentionSection?.data?.alerts || []).filter((a) => toInt(a.count) > 0);

  if (toInt(summaryAttention?.unreadNotifications) > 0) {
    alerts.push({
      key: "unread_notifications",
      title: "إشعارات غير مقروءة",
      count: toInt(summaryAttention.unreadNotifications),
      path: "/dashboard/super-admin/notifications",
    });
  }

  if (toInt(summaryAttention?.internalOrdersPendingClaims) > 0) {
    alerts.push({
      key: "internal_orders_pending",
      title: "طلبات داخلية بمطالبات معلقة",
      count: toInt(summaryAttention.internalOrdersPendingClaims),
      path: "/dashboard/super-admin/orders",
    });
  }

  return {
    alerts,
    lowPerformingCourses: attentionSection?.data?.lowPerformingCourses || [],
    totalAttentionItems: alerts.reduce((sum, a) => sum + toInt(a.count), 0),
  };
}

function normalizePosthogRange(range) {
  const r = String(range || "7d").trim();
  if (r === "today" || r === "30d") return r;
  return "7d";
}

function buildAttentionPayload(attentionIntel, summary) {
  const unifiedAttention = buildUnifiedAttention(attentionIntel, summary?.attention);
  return {
    section: "attention",
    updatedAt: attentionIntel.updatedAt,
    data: unifiedAttention,
  };
}

/**
 * Critical path only: summary, business KPIs, attention (no executive, PostHog, or deep intelligence).
 */
async function getDashboardHomeFast({ userId }) {
  const cacheKey = `home-fast:${userId || "anon"}`;
  return getOrSet(
    cacheKey,
    FAST_CACHE_TTL_MS,
    async () => {
      const [summary, businessKpis, attentionIntel] = await Promise.all([
        timedDashboardSection(ENDPOINT_FAST, "summary", () =>
          superAdminDashboardSummaryService.getDashboardSummary({ userId }),
        ),
        timedDashboardSection(ENDPOINT_FAST, "businessKpis", () =>
          superAdminBusinessMetricsService.getDashboardBusinessKpis(),
        ),
        timedDashboardSection(ENDPOINT_FAST, "attention", () =>
          intelligence.getAttentionIntelligence(),
        ),
      ]);

      const attention = buildAttentionPayload(attentionIntel, summary);
      const meta = mergeSectionErrors(attentionIntel);

      return {
        updatedAt: new Date().toISOString(),
        summary,
        businessKpis,
        intelligence: { attention },
        meta,
      };
    },
    { endpoint: ENDPOINT_FAST },
  );
}

/**
 * Executive month comparison — separate from home-fast so hero KPIs are not blocked.
 */
async function getDashboardHomeExecutiveKpis() {
  const cacheKey = "home-executive-kpis";
  return getOrSet(
    cacheKey,
    EXECUTIVE_CACHE_TTL_MS,
    async () => {
      const executiveKpis = await timedDashboardSection(ENDPOINT_EXECUTIVE, "executiveKpis", () =>
        intelligence.getExecutiveKpiComparison(),
      );
      return {
        updatedAt: new Date().toISOString(),
        intelligence: { executiveKpis },
        meta: mergeSectionErrors(executiveKpis),
      };
    },
    { endpoint: ENDPOINT_EXECUTIVE },
  );
}

async function getDashboardHomePosthog({ range: rangeIn, topLimit = 10 } = {}) {
  const posthogRange = normalizePosthogRange(rangeIn);
  const cacheKey = `home-posthog:${posthogRange}:${topLimit}`;
  return getOrSet(
    cacheKey,
    POSTHOG_CACHE_TTL_MS,
    async () => {
      const posthog = await timedDashboardSection(ENDPOINT_POSTHOG, "posthog", () =>
        superAdminAnalyticsOverviewService.getPosthogProductAnalytics({
          range: posthogRange,
          topLimit,
        }),
      );
      return {
        posthog,
        meta: {
          posthogConfigured: Boolean(posthog?.meta?.posthogConfigured),
          posthogError: posthog?.meta?.posthogError || null,
          period: { posthogRange },
        },
      };
    },
    { endpoint: ENDPOINT_POSTHOG },
  );
}

async function getDashboardHomeIntelligence({ range: rangeIn } = {}) {
  const posthogRange = normalizePosthogRange(rangeIn);
  const cacheKey = `home-intelligence:${posthogRange}`;
  return getOrSet(
    cacheKey,
    INTELLIGENCE_CACHE_TTL_MS,
    async () => {
      const [
        summaryIntel,
        ordersIntel,
        clientsIntel,
        freelancersIntel,
        subscriptionsIntel,
        coursesIntel,
        categoriesIntel,
        financialIntel,
      ] = await Promise.all([
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "summaryIntelligence", () =>
          intelligence.getSummaryIntelligence(),
        ),
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "ordersIntelligence", () =>
          intelligence.getOrdersIntelligence(),
        ),
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "clientsIntelligence", () =>
          intelligence.getClientsIntelligence(),
        ),
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "freelancersIntelligence", () =>
          intelligence.getFreelancersIntelligence(),
        ),
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "subscriptionsIntelligence", () =>
          intelligence.getSubscriptionsIntelligence(),
        ),
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "coursesIntelligence", () =>
          intelligence.getCoursesIntelligence(),
        ),
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "categoriesIntelligence", () =>
          intelligence.getCategoriesIntelligence(),
        ),
        timedDashboardSection(ENDPOINT_INTELLIGENCE, "financialIntelligence", () =>
          intelligence.getFinancialIntelligence(),
        ),
      ]);

      const intelligencePayload = {
        summary: summaryIntel,
        orders: ordersIntel,
        clients: clientsIntel,
        freelancers: freelancersIntel,
        subscriptions: subscriptionsIntel,
        courses: coursesIntel,
        categories: categoriesIntel,
        financial: financialIntel,
      };

      const meta = mergeSectionErrors(
        summaryIntel,
        ordersIntel,
        clientsIntel,
        freelancersIntel,
        subscriptionsIntel,
        coursesIntel,
        categoriesIntel,
        financialIntel,
      );

      return {
        updatedAt: new Date().toISOString(),
        intelligence: intelligencePayload,
        meta: {
          ...meta,
          period: { posthogRange },
        },
      };
    },
    { endpoint: ENDPOINT_INTELLIGENCE },
  );
}

function composeHomeBundle({ fast, executive, intel, posthogWrap }) {
  const posthog = posthogWrap?.posthog;
  const sectionErrors = {
    ...(fast?.meta?.sectionErrors || {}),
    ...(executive?.meta?.sectionErrors || {}),
    ...(intel?.meta?.sectionErrors || {}),
  };

  const intelligencePayload = {
    ...intel?.intelligence,
    executiveKpis: executive?.intelligence?.executiveKpis,
    attention: fast?.intelligence?.attention,
  };

  return {
    updatedAt: new Date().toISOString(),
    summary: fast?.summary,
    businessKpis: fast?.businessKpis,
    posthog,
    intelligence: intelligencePayload,
    meta: {
      ...(Object.keys(sectionErrors).length ? { sectionErrors } : {}),
      posthogConfigured: Boolean(posthogWrap?.meta?.posthogConfigured),
      posthogError: posthogWrap?.meta?.posthogError || null,
      period: { posthogRange: intel?.meta?.period?.posthogRange || "7d" },
    },
  };
}

/** Legacy single payload (composes all parts in parallel). */
async function getDashboardHomeBundle({ userId, range: rangeIn }) {
  const posthogRange = normalizePosthogRange(rangeIn);
  const [fast, executive, intel, posthogWrap] = await Promise.all([
    getDashboardHomeFast({ userId }),
    getDashboardHomeExecutiveKpis(),
    getDashboardHomeIntelligence({ range: posthogRange }),
    getDashboardHomePosthog({ range: posthogRange, topLimit: 10 }),
  ]);
  return composeHomeBundle({ fast, executive, intel, posthogWrap });
}

module.exports = {
  getDashboardHomeFast,
  getDashboardHomeExecutiveKpis,
  getDashboardHomeIntelligence,
  getDashboardHomePosthog,
  getDashboardHomeBundle,
  composeHomeBundle,
};
