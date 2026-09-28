import { formatInt } from "./superAdminHomeBundleUi";
import { HEALTH_SCORE_SCOPE } from "./dashboardMetricScope";

/**
 * Platform health score (0–100) — deterministic, not AI.
 *
 * Formula:
 * - Start at 100
 * - Stale orders (>72h open): −3 per order, max −25
 * - Stale claims (>7d pending): −3 per claim, max −15
 * - Pending subscription activations: −2 each, max −10
 * - Inactive subscribed freelancers (30d): −2 each, max −10
 * - Low order completion (<50% with ≥5 orders): −(50 − rate)/2, max −15
 * - Month orders trend down >10%: −min(10, |changePct|/2)
 * - Month orders trend up >10%: +min(5, changePct/4)
 * Clamp 0–100
 */
export function buildPlatformHealthScore({ intelligence, t = (key) => key }) {
  let score = 100;
  const orders = intelligence?.orders?.data;
  const financial = intelligence?.financial?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const freelancers = intelligence?.freelancers?.data;
  const executive = intelligence?.executiveKpis?.data;

  const staleOrders = Number(orders?.totals?.ordersWaitingTooLong) || 0;
  const staleOrdersPenalty = Math.min(25, staleOrders * 3);
  score -= staleOrdersPenalty;

  const staleClaims = Number(financial?.totals?.claimsWaitingTooLong) || 0;
  const staleClaimsPenalty = Math.min(15, staleClaims * 3);
  score -= staleClaimsPenalty;

  const pendingActivation = Number(subscriptions?.totals?.pendingActivation) || 0;
  const activationPenalty = Math.min(10, pendingActivation * 2);
  score -= activationPenalty;

  const inactiveSub = Number(freelancers?.totals?.inactiveAfterSubscription) || 0;
  const inactivePenalty = Math.min(10, inactiveSub * 2);
  score -= inactivePenalty;

  const completionRate = Number(orders?.totals?.completionRate);
  const totalOrders = Number(orders?.totals?.totalOrders) || 0;
  let completionPenalty = 0;
  if (totalOrders >= 5 && Number.isFinite(completionRate) && completionRate < 50) {
    completionPenalty = Math.min(15, (50 - completionRate) / 2);
    score -= completionPenalty;
  }

  const orderTrend = executive?.find((m) => m.key === "ordersThisMonth" && m.comparable);
  let trendKey = "analysis.platformScore.stable";
  let trendImpact = 0;
  if (orderTrend?.changePct != null) {
    if (orderTrend.changePct < -10) {
      trendImpact = -Math.min(10, Math.abs(orderTrend.changePct) / 2);
      score += trendImpact;
      trendKey = "analysis.platformScore.down";
    } else if (orderTrend.changePct > 10) {
      trendImpact = Math.min(5, orderTrend.changePct / 4);
      score += trendImpact;
      trendKey = "analysis.platformScore.up";
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let statusKey = "analysis.platformScore.needsAttention";
  if (score >= 85) statusKey = "analysis.platformScore.excellent";
  else if (score >= 70) statusKey = "analysis.platformScore.good";
  else if (score >= 55) statusKey = "analysis.platformScore.steady";

  const trendNote = t(trendKey);
  const pct =
    orderTrend?.changePct != null ? ` (${formatInt(Math.abs(orderTrend.changePct))}%)` : "";

  const factors = [
    {
      id: "stale-orders",
      label: t("analysis.platformScore.staleOrders"),
      detail:
        staleOrders > 0
          ? t("analysis.platformScore.staleOrdersDetail", { count: formatInt(staleOrders) })
          : t("analysis.platformScore.staleOrdersNone"),
      active: staleOrders > 0,
    },
    {
      id: "stale-claims",
      label: t("analysis.platformScore.staleClaims"),
      detail:
        staleClaims > 0
          ? t("analysis.platformScore.staleClaimsDetail", { count: formatInt(staleClaims) })
          : t("analysis.platformScore.staleClaimsNone"),
      active: staleClaims > 0,
    },
    {
      id: "activations",
      label: t("analysis.platformScore.activations"),
      detail:
        pendingActivation > 0
          ? t("analysis.platformScore.activationsDetail", { count: formatInt(pendingActivation) })
          : t("analysis.platformScore.activationsNone"),
      active: pendingActivation > 0,
    },
    {
      id: "freelancers",
      label: t("analysis.platformScore.freelancers"),
      detail:
        inactiveSub > 0
          ? t("analysis.platformScore.freelancersDetail", { count: formatInt(inactiveSub) })
          : t("analysis.platformScore.freelancersNone"),
      active: inactiveSub > 0,
    },
    {
      id: "completion",
      label: t("analysis.platformScore.completion"),
      detail:
        totalOrders >= 5
          ? t("analysis.platformScore.completionDetail", { rate: formatInt(completionRate) })
          : t("analysis.platformScore.completionNone"),
      active: completionPenalty > 0,
    },
    {
      id: "growth",
      label: t("analysis.platformScore.growth"),
      detail: t("analysis.platformScore.growthDetail", { note: trendNote, pct }),
      active: Math.abs(trendImpact) > 0,
    },
  ];

  return { score, statusLabel: t(statusKey), factors, scopeLabel: HEALTH_SCORE_SCOPE };
}
