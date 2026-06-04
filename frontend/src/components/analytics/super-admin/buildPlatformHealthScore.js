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
export function buildPlatformHealthScore({ intelligence }) {
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
  let trendNote = "مستقر";
  let trendImpact = 0;
  if (orderTrend?.changePct != null) {
    if (orderTrend.changePct < -10) {
      trendImpact = -Math.min(10, Math.abs(orderTrend.changePct) / 2);
      score += trendImpact;
      trendNote = "تراجع في طلبات الشهر";
    } else if (orderTrend.changePct > 10) {
      trendImpact = Math.min(5, orderTrend.changePct / 4);
      score += trendImpact;
      trendNote = "نمو في طلبات الشهر";
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let statusLabel = "تحتاج متابعة";
  if (score >= 85) statusLabel = "ممتازة";
  else if (score >= 70) statusLabel = "جيدة";
  else if (score >= 55) statusLabel = "مستقرة";

  const factors = [
    {
      id: "stale-orders",
      label: "الطلبات المتأخرة",
      detail:
        staleOrders > 0
          ? `${formatInt(staleOrders)} طلب مفتوح منذ أكثر من 72 ساعة — يخفض النتيجة.`
          : "لا توجد طلبات متأخرة حالياً.",
      active: staleOrders > 0,
    },
    {
      id: "stale-claims",
      label: "المطالبات المالية",
      detail:
        staleClaims > 0
          ? `${formatInt(staleClaims)} مطالبة معلّقة أكثر من 7 أيام.`
          : "لا مطالبات مالية متأخرة.",
      active: staleClaims > 0,
    },
    {
      id: "activations",
      label: "الاشتراكات المعلقة",
      detail:
        pendingActivation > 0
          ? `${formatInt(pendingActivation)} اشتراك بانتظار تفعيل من الإدارة.`
          : "لا اشتراكات بانتظار التفعيل.",
      active: pendingActivation > 0,
    },
    {
      id: "freelancers",
      label: "نشاط المستقلين",
      detail:
        inactiveSub > 0
          ? `${formatInt(inactiveSub)} مشترك بلا طلبات منذ 30 يوماً من بداية الاشتراك.`
          : "المشتركون النشطون يعملون على المنصة.",
      active: inactiveSub > 0,
    },
    {
      id: "completion",
      label: "جودة الإكمال",
      detail:
        totalOrders >= 5
          ? `معدل إكمال الطلبات ${formatInt(completionRate)}٪ على إجمالي المنصة.`
          : "بيانات غير كافية لقياس الإكمال.",
      active: completionPenalty > 0,
    },
    {
      id: "growth",
      label: "اتجاه النمو",
      detail: `طلبات الشهر: ${trendNote}${orderTrend?.changePct != null ? ` (${formatInt(Math.abs(orderTrend.changePct))}٪)` : ""}.`,
      active: Math.abs(trendImpact) > 0,
    },
  ];

  return { score, statusLabel, factors, scopeLabel: HEALTH_SCORE_SCOPE };
}
