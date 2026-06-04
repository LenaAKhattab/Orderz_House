import { filterRowsByPeriod } from "./dashboardDateRange";
import { buildChartPack } from "../../../hooks/useSuperAdminAnalyticsOverview";

function sumRows(rows, keys) {
  return (rows || []).reduce((acc, row) => {
    const v = keys.reduce((val, k) => (val != null ? val : row[k]), null);
    return acc + (Number(v) || 0);
  }, 0);
}

function pickOrdersInPeriod(orders, period) {
  const totals = orders?.totals || {};
  if (period.preset === "today") return totals.ordersToday ?? null;
  if (period.preset === "7d") return totals.ordersThisWeek ?? sumRows(orders?.timing?.trendByDay, ["orders_count", "ordersCount"]);
  if (period.preset === "this_month") return totals.ordersThisMonth ?? null;
  const filtered = filterRowsByPeriod(orders?.timing?.trendByDay, "day", period);
  const fromTrend = sumRows(filtered, ["orders_count", "ordersCount"]);
  return fromTrend > 0 ? fromTrend : null;
}

function pickSubscriptionsInPeriod(subscriptions, period) {
  const monthly = filterRowsByPeriod(subscriptions?.trendByMonth, "monthStart", period);
  const fromTrend = sumRows(monthly, ["subscriptions_count", "subscriptionsCount"]);
  if (fromTrend > 0) return fromTrend;
  if (period.preset === "this_month" && subscriptions?.trendByMonth?.length) {
    const cur = subscriptions.trendByMonth[subscriptions.trendByMonth.length - 1];
    return Number(cur?.subscriptionsCount ?? cur?.subscriptions_count) || null;
  }
  return null;
}

function pickClaimsInPeriod(financial, executive, period) {
  const monthly = filterRowsByPeriod(financial?.paymentTrendByMonth, "monthStart", period);
  const fromTrend = sumRows(monthly, ["claims_count", "claimsCount"]);
  if (fromTrend > 0) return fromTrend;
  const claimsMetric = executive?.find((m) => m.key === "claimsSubmitted");
  if (period.preset === "this_month" && claimsMetric?.current != null) return claimsMetric.current;
  return null;
}

function pickRevenueInPeriod(bundle, period, filteredChart) {
  if (period.preset === "today") return bundle?.businessKpis?.revenueTodayJod ?? null;
  const fromChart = (filteredChart || []).reduce((s, r) => s + (Number(r.revenueJod) || 0), 0);
  if (fromChart > 0) return fromChart;
  if (period.preset === "this_month") {
    return bundle?.intelligence?.summary?.data?.monthlyRevenueJod ?? null;
  }
  return fromChart === 0 ? 0 : null;
}

/**
 * Apply selected period to bundle (charts filtered; period aggregates for snapshot/forecast).
 */
export function adaptBundleForPeriod(bundle, period) {
  if (!bundle || !period) {
    return { bundle, periodMetrics: null, chartPack: buildChartPack(bundle?.posthog, bundle?.businessKpis) };
  }

  const posthog = bundle.posthog;
  const businessKpis = bundle.businessKpis;

  const visitorsByDay = filterRowsByPeriod(posthog?.trends?.visitorsByDay, "date", period).map((r) => ({
    date: String(r.date).slice(0, 10),
    visitors: Number(r.visitors) || 0,
  }));
  const ordersByDay = filterRowsByPeriod(posthog?.trends?.ordersByDay, "date", period).map((r) => ({
    date: String(r.date).slice(0, 10),
    orders: Number(r.orders) || 0,
  }));
  const revenueByDay = filterRowsByPeriod(businessKpis?.revenueByDay, "date", period).map((r) => ({
    date: String(r.date || r.day).slice(0, 10),
    revenueJod: Number(r.revenueJod ?? r.revenue_jod) || 0,
  }));

  const adaptedPosthog = posthog
    ? {
        ...posthog,
        trends: {
          ...posthog.trends,
          visitorsByDay,
          ordersByDay,
        },
      }
    : posthog;

  const adaptedBusiness = businessKpis
    ? {
        ...businessKpis,
        revenueByDay,
      }
    : businessKpis;

  const chartPack = buildChartPack(adaptedPosthog, adaptedBusiness);
  const intelligence = bundle.intelligence;
  const orders = intelligence?.orders?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const financial = intelligence?.financial?.data;
  const executive = intelligence?.executiveKpis?.data;

  const periodMetrics = {
    ordersInPeriod: pickOrdersInPeriod(orders, period),
    subscriptionsInPeriod: pickSubscriptionsInPeriod(subscriptions, period),
    claimsInPeriod: pickClaimsInPeriod(financial, executive, period),
    revenueInPeriod: pickRevenueInPeriod(bundle, period, chartPack?.unified),
    ordersTrendFiltered: filterRowsByPeriod(orders?.timing?.trendByDay, "day", period),
    subscriptionsTrendFiltered: filterRowsByPeriod(subscriptions?.trendByMonth, "monthStart", period),
    financialTrendFiltered: filterRowsByPeriod(financial?.paymentTrendByMonth, "monthStart", period),
    posthogLimited: Boolean(period.posthogLimited),
  };

  return {
    bundle: {
      ...bundle,
      posthog: adaptedPosthog,
      businessKpis: adaptedBusiness,
    },
    periodMetrics,
    chartPack,
    periodLabel: period.label,
  };
}
