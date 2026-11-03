import { formatInt, formatMoneyJod } from "./superAdminHomeBundleUi";
import { pt } from "../../../i18n/activeLocale";
import { tPlural } from "../../../i18n/plural";
import { isNewLocale } from "../../../i18n/systemContent";
import { localizeCategoryName } from "../../../lib/i18n/platformContentLocale";
import { legacyArabicUiLocale } from "../../../admin/adminLocale";

/**
 * High-priority period events for the activity summary (from real bundle metrics only).
 * Copy was Arabic in both AR and EN UIs (kept); German / Dutch / Romanian get their own.
 */
export function buildBusinessSnapshot({ periodMetrics, intelligence, businessKpis, period }) {
  const loc = legacyArabicUiLocale();
  const tr = (key, values) => pt(`platformAdmin.analytics.snapshot.${key}`, values, loc);
  const countText = (key, count) =>
    tPlural((k, v) => pt(k, v, loc), loc, `platformAdmin.analytics.snapshot.${key}`, Number(count), {
      count: formatInt(count, loc),
    });
  const items = [];
  const categories = intelligence?.categories?.data;
  const topCategory = categories?.mostRequested?.[0] || intelligence?.orders?.data?.categories?.breakdown?.[0];

  const subs = periodMetrics?.subscriptionsInPeriod;
  if (subs != null && subs > 0) {
    items.push({
      id: "subs",
      text: countText("newSubscriptions", subs),
      tone: "positive",
    });
  }

  const orders = periodMetrics?.ordersInPeriod;
  if (orders != null && orders > 0) {
    items.push({
      id: "orders",
      text: countText("newOrders", orders),
      tone: "positive",
    });
  }

  const claims = periodMetrics?.claimsInPeriod;
  if (claims != null && claims > 0) {
    items.push({
      id: "claims",
      text: countText("newClaims", claims),
      tone: "neutral",
    });
  }

  const revenue =
    period?.preset === "today"
      ? businessKpis?.revenueTodayJod
      : periodMetrics?.revenueInPeriod;
  if (revenue != null && Number(revenue) > 0) {
    const amount = formatMoneyJod(revenue, loc);
    items.push({
      id: "revenue",
      text: period?.preset === "today" ? amount : tr("periodRevenue", { amount }),
      tone: "money",
    });
  }

  if (topCategory?.name) {
    const name = isNewLocale(loc) ? localizeCategoryName(topCategory, loc) || topCategory.name : topCategory.name;
    items.push({
      id: "category",
      text: tr("topCategory", { name }),
      tone: "highlight",
    });
  }

  return items.slice(0, 5);
}
