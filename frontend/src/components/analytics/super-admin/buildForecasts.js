import { formatInt, formatMoneyJod } from "./superAdminHomeBundleUi";
import { SCOPE_LABELS } from "./dashboardMetricScope";

/**
 * Linear month-end projection from month-to-date actuals.
 *
 * ordersForecast = (ordersThisMonth / dayOfMonth) * daysInMonth
 * subscriptionsForecast = (subsInCurrentMonth / dayOfMonth) * daysInMonth
 * revenueForecast = (revenueThisMonth / dayOfMonth) * daysInMonth
 *
 * Requires dayOfMonth ≥ 3 to avoid wild early-month estimates.
 */
export function buildForecasts({ intelligence, periodMetrics }) {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  if (dayOfMonth < 3) return [];

  const orders = intelligence?.orders?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const executive = intelligence?.executiveKpis?.data;

  const ordersMtd = Number(orders?.totals?.ordersThisMonth) || Number(periodMetrics?.ordersInPeriod) || 0;
  const revMetric = executive?.find((m) => m.key === "monthlyRevenue");
  const revenueMtd = Number(revMetric?.current) || Number(periodMetrics?.revenueInPeriod) || 0;

  let subsMtd = 0;
  const subTrend = subscriptions?.trendByMonth || [];
  const curMonth = subTrend[subTrend.length - 1];
  if (curMonth) subsMtd = Number(curMonth.subscriptionsCount ?? curMonth.subscriptions_count) || 0;

  const factor = daysInMonth / dayOfMonth;

  const forecasts = [];

  if (ordersMtd > 0) {
    forecasts.push({
      id: "orders",
      label: "طلبات",
      estimate: Math.round(ordersMtd * factor),
      unit: "count",
    });
  }

  if (subsMtd > 0) {
    forecasts.push({
      id: "subscriptions",
      label: "اشتراكات جديدة",
      estimate: Math.round(subsMtd * factor),
      unit: "count",
    });
  }

  if (revenueMtd > 0) {
    forecasts.push({
      id: "revenue",
      label: "إيرادات",
      estimate: Math.round(revenueMtd * factor * 100) / 100,
      unit: "money",
    });
  }

  return forecasts.map((f) => ({
    ...f,
    scopeLabel: SCOPE_LABELS.estimate_month,
    isEstimate: true,
    display:
      f.unit === "money"
        ? formatMoneyJod(f.estimate)
        : `${formatInt(f.estimate)} ${f.label}`,
  }));
}
