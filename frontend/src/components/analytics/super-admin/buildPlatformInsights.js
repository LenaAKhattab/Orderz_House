import { isPosthogUnavailable } from "./superAdminHomeDataUtils";
import { INSIGHT_SOURCES } from "./dashboardMetricScope";

function trendInsight(labelKey, changePct, trend, impactBase) {
  if (changePct == null || trend == null || Math.abs(changePct) < 0.5) return null;
  const pct = Math.abs(changePct);
  const textKey = trend === "up" ? "analysis.platformInsights.trendUp" : "analysis.platformInsights.trendDown";
  return {
    textKey,
    textParams: { labelKey, pct },
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
  const revIns = trendInsight("analysis.platformInsights.monthlyRevenue", revTrend?.changePct, revTrend?.trend, 55);
  if (revIns) candidates.push({ ...revIns, id: "rev-trend" });

  const orderMonth = executive?.find((m) => m.key === "ordersThisMonth" && m.comparable);
  const orderIns = trendInsight("analysis.platformInsights.monthlyOrders", orderMonth?.changePct, orderMonth?.trend, 50);
  if (orderIns) candidates.push({ ...orderIns, id: "orders-month" });

  const subTrend = executive?.find((m) => m.key === "activeSubscriptions" && m.comparable);
  const subIns = trendInsight(
    "analysis.platformInsights.activeSubscriptions",
    subTrend?.changePct,
    subTrend?.trend,
    48,
  );
  if (subIns) candidates.push({ ...subIns, id: "sub-trend" });

  const shortage = categories?.potentialShortage?.[0];
  if (shortage?.name && Number(shortage.demandOrders) > Number(shortage.freelancerSupply)) {
    candidates.push({
      id: "cat-shortage",
      topic: "supply",
      impact: 65 + Number(shortage.demandOrders),
      textKey: "analysis.platformInsights.catShortage",
      textParams: { name: shortage.name },
    });
  }

  const stuck = Number(courses?.totals?.stuckAbove80Percent) || 0;
  if (stuck > 0) {
    candidates.push({
      id: "courses-stuck",
      topic: "courses",
      impact: 30 + stuck,
      textKey: "analysis.platformInsights.coursesStuck",
      textParams: { count: stuck },
    });
  }

  const topPlan = subscriptions?.byPlan?.[0];
  if (topPlan?.planTitle && Number(topPlan.subscribers) > 0) {
    candidates.push({
      id: "top-plan",
      topic: "growth",
      impact: 25 + Number(topPlan.subscribers),
      textKey: "analysis.platformInsights.topPlan",
      textParams: { plan: topPlan.planTitle, count: topPlan.subscribers },
    });
  }

  if (isPosthogUnavailable(posthog, meta)) {
    candidates.push({
      id: "posthog-off",
      topic: "meta",
      impact: 10,
      textKey: "analysis.platformInsights.posthogOff",
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
    .map(({ id, textKey, textParams, topic }) => ({
      id,
      textKey,
      textParams,
      sourceKey: INSIGHT_SOURCES[topic] || INSIGHT_SOURCES.growth,
    }));
}
