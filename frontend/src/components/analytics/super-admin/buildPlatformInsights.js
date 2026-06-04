import { formatInt, formatPctChange } from "./superAdminHomeBundleUi";
import { isPosthogUnavailable } from "./superAdminHomeDataUtils";
import { INSIGHT_SOURCES } from "./dashboardMetricScope";

function trendInsight(label, changePct, trend, impactBase) {
  if (changePct == null || trend == null || Math.abs(changePct) < 0.5) return null;
  const pct = formatPctChange(Math.abs(changePct));
  const text =
    trend === "up"
      ? `${label} ارتفعت ${pct} مقارنة بالشهر السابق.`
      : `${label} انخفضت ${pct} مقارنة بالشهر السابق.`;
  return {
    text,
    impact: impactBase + Math.min(20, Math.abs(changePct)),
    topic: "growth",
  };
}

/**
 * Growth / opportunity insights only — operational alerts live in unified attention.
 */
export function buildPlatformInsights({ intelligence, posthog, meta }) {
  const candidates = [];
  const executive = intelligence?.executiveKpis?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const categories = intelligence?.categories?.data;
  const courses = intelligence?.courses?.data;

  const revTrend = executive?.find((m) => m.key === "monthlyRevenue" && m.comparable);
  const revIns = trendInsight("إيرادات الشهر", revTrend?.changePct, revTrend?.trend, 55);
  if (revIns) candidates.push({ ...revIns, id: "rev-trend" });

  const orderMonth = executive?.find((m) => m.key === "ordersThisMonth" && m.comparable);
  const orderIns = trendInsight("طلبات الشهر", orderMonth?.changePct, orderMonth?.trend, 50);
  if (orderIns) candidates.push({ ...orderIns, id: "orders-month" });

  const subTrend = executive?.find((m) => m.key === "activeSubscriptions" && m.comparable);
  const subIns = trendInsight("الاشتراكات النشطة", subTrend?.changePct, subTrend?.trend, 48);
  if (subIns) candidates.push({ ...subIns, id: "sub-trend" });

  const shortage = categories?.potentialShortage?.[0];
  if (shortage?.name && Number(shortage.demandOrders) > Number(shortage.freelancerSupply)) {
    candidates.push({
      id: "cat-shortage",
      topic: "supply",
      impact: 65 + Number(shortage.demandOrders),
      text: `فئة «${shortage.name}»: طلب أعلى من عرض المستقلين — فرصة لتوسيع العرض.`,
    });
  }

  const stuck = Number(courses?.totals?.stuckAbove80Percent) || 0;
  if (stuck > 0) {
    candidates.push({
      id: "courses-stuck",
      topic: "courses",
      impact: 30 + stuck,
      text: `${formatInt(stuck)} متعلّم عالق فوق 80٪ — تحسين مسار الإكمال قد يرفع التحويل.`,
    });
  }

  const topPlan = subscriptions?.byPlan?.[0];
  if (topPlan?.planTitle && Number(topPlan.subscribers) > 0) {
    candidates.push({
      id: "top-plan",
      topic: "growth",
      impact: 25 + Number(topPlan.subscribers),
      text: `«${topPlan.planTitle}» الأكثر اشتراكاً (${formatInt(topPlan.subscribers)} مشترك).`,
    });
  }

  if (isPosthogUnavailable(posthog, meta)) {
    candidates.push({
      id: "posthog-off",
      topic: "meta",
      impact: 10,
      text: "بيانات النشاط (PostHog) غير متاحة — الأرقام أدناه من قاعدة البيانات.",
    });
  }

  const seenTopics = new Set();
  return candidates
    .sort((a, b) => b.impact - a.impact)
    .filter((item) => {
      if (seenTopics.has(item.topic)) return false;
      seenTopics.add(item.topic);
      return true;
    })
    .slice(0, 5)
    .map(({ id, text, topic }) => ({
      id,
      text,
      source: INSIGHT_SOURCES[topic] || INSIGHT_SOURCES.growth,
    }));
}
