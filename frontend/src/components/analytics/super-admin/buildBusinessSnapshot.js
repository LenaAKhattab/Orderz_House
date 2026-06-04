import { formatInt, formatMoneyJod } from "./superAdminHomeBundleUi";

/**
 * High-priority period events for "ملخص النشاط" (from real bundle metrics only).
 */
export function buildBusinessSnapshot({ periodMetrics, intelligence, businessKpis, period }) {
  const items = [];
  const categories = intelligence?.categories?.data;
  const topCategory = categories?.mostRequested?.[0] || intelligence?.orders?.data?.categories?.breakdown?.[0];

  const subs = periodMetrics?.subscriptionsInPeriod;
  if (subs != null && subs > 0) {
    items.push({
      id: "subs",
      text: `+${formatInt(subs)} اشتراك جديد`,
      tone: "positive",
    });
  }

  const orders = periodMetrics?.ordersInPeriod;
  if (orders != null && orders > 0) {
    items.push({
      id: "orders",
      text: `+${formatInt(orders)} طلب جديد`,
      tone: "positive",
    });
  }

  const claims = periodMetrics?.claimsInPeriod;
  if (claims != null && claims > 0) {
    items.push({
      id: "claims",
      text: `+${formatInt(claims)} مطالبة مالية`,
      tone: "neutral",
    });
  }

  const revenue =
    period?.preset === "today"
      ? businessKpis?.revenueTodayJod
      : periodMetrics?.revenueInPeriod;
  if (revenue != null && Number(revenue) > 0) {
    const prefix = period?.preset === "today" ? "" : "إيرادات الفترة: ";
    items.push({
      id: "revenue",
      text: `${prefix}${formatMoneyJod(revenue)}`,
      tone: "money",
    });
  }

  if (topCategory?.name) {
    items.push({
      id: "category",
      text: `أفضل فئة: ${topCategory.name}`,
      tone: "highlight",
    });
  }

  return items.slice(0, 5);
}
