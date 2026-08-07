/**
 * Rule-based portfolio actions (no AI). Uses metrics from planPerformanceUtils enrichment.
 *
 * Promotion: health excellent + catalog active + strong active ratio + not declining + (growth or strong floor).
 * Review: weak/unused/catalog_off with subs, no active among subs, peer alerts, low active share, or declining with subs.
 * Declining: subscriberPeriodTrend or revenuePeriodTrend trend === 'down'.
 * Priority high: score ≥ 45. medium: 15–44. low: < 15.
 * Concentration: existing revenueContribution.pct — warning ≥50%, severe styling ≥70%.
 */

import {
  COMPARISON_QUARTILE,
  CONCENTRATION_RISK_THRESHOLD,
  formatInt,
  HEALTH_THRESHOLDS,
  pickTopPlan,
} from "./planPerformanceUtils";

export const ACTION_PRIORITY = {
  high: "high",
  medium: "medium",
  low: "low",
};

export const CONCENTRATION_SEVERE_THRESHOLD = 70;

export const DECISION_FILTERS = {
  all: "all",
  promote: "promote",
  review: "review",
  high_risk: "high_risk",
  no_subs: "no_subs",
  top_revenue: "top_revenue",
  top_usage: "top_usage",
};

export const ACTION_SIGNAL_LABELS = {
  promote: "⭐ مرشّحة للترويج",
  review: "🛠 تحتاج مراجعة",
  declining: "⬇ انخفاض في النشاط الشهري",
  concentration: "⚠️ تعتمد قيمة الاشتراكات المدفوعة بشكل كبير على هذه الباقة",
};

export const PRIORITY_LABELS = {
  high: { label: "أولوية عالية", emoji: "🔴" },
  medium: { label: "أولوية متوسطة", emoji: "🟡" },
  low: { label: "أولوية منخفضة", emoji: "🟢" },
};

function quartileValue(sortedValues, q) {
  if (!sortedValues.length) return null;
  const idx = Math.max(0, Math.ceil(sortedValues.length * q) - 1);
  return sortedValues[idx];
}

function buildPeerContext(okPlans) {
  const subs = okPlans.map((p) => p.performance.subscribers.value ?? 0).filter((v) => v > 0);
  const rev = okPlans.map((p) => p.performance.revenueJod.value ?? 0).filter((v) => v > 0);
  return {
    p75Subs: quartileValue([...subs].sort((a, b) => a - b), COMPARISON_QUARTILE),
    p75Rev: quartileValue([...rev].sort((a, b) => a - b), COMPARISON_QUARTILE),
  };
}

export function hasDecliningMonthlyActivity(plan) {
  if (plan.performance?.state !== "ok") return false;
  const sub = plan.performance.subscriberPeriodTrend?.trend;
  const rev = plan.performance.revenuePeriodTrend?.trend;
  return sub === "down" || rev === "down";
}

/** @see module doc — promotion rules */
export function isPromotionCandidate(plan, platformContext) {
  if (plan.performance?.state !== "ok" || !plan.isActive) return false;
  const health = plan.portfolioHealth;
  if (health?.key !== "excellent") return false;
  if (hasDecliningMonthlyActivity(plan)) return false;

  const subs = plan.performance.subscribers.value ?? 0;
  const active = plan.performance.activeSubscribers.value ?? 0;
  if (subs === 0 || active === 0) return false;

  const ratio = active / subs;
  if (ratio < HEALTH_THRESHOLDS.excellentMinActiveRatio) return false;

  const floor = platformContext?.strongActiveFloor ?? HEALTH_THRESHOLDS.excellentMinActive;
  if (active < floor && active < HEALTH_THRESHOLDS.excellentMinActive) return false;

  const subTrend = plan.performance.subscriberPeriodTrend?.trend;
  const revTrend = plan.performance.revenuePeriodTrend?.trend;
  const hasGrowth = subTrend === "up" || revTrend === "up";
  const stableStrong =
    active >= HEALTH_THRESHOLDS.excellentMinActive && ratio >= HEALTH_THRESHOLDS.excellentMinActiveRatio;

  return hasGrowth || stableStrong;
}

/** @see module doc — review rules */
export function isReviewCandidate(plan) {
  if (plan.performance?.state !== "ok") return false;

  const health = plan.portfolioHealth;
  if (health?.key === "weak" || health?.key === "unused" || health?.key === "catalog_off") return true;

  const subs = plan.performance.subscribers.value ?? 0;
  const active = plan.performance.activeSubscribers.value ?? 0;

  if (subs > 0 && active === 0) return true;
  if (subs > 0 && hasDecliningMonthlyActivity(plan)) return true;

  const share = plan.performance.activeShare?.value;
  if (subs >= 3 && share != null && share < HEALTH_THRESHOLDS.goodMinActiveRatio) return true;

  if ((plan.performance.comparisonAlerts?.length ?? 0) > 0) return true;

  return false;
}

function computePriorityScore(plan, { isPromote, isReview, isDeclining }) {
  let score = 0;
  const health = plan.portfolioHealth;
  const subs = plan.performance?.subscribers?.value ?? 0;
  const active = plan.performance?.activeSubscribers?.value ?? 0;
  const revPct = plan.performance?.revenueContribution?.pct ?? 0;

  if (health?.key === "unused") score += 40;
  if (health?.key === "weak") score += 35;
  if (health?.key === "catalog_off" && subs > 0) score += 30;
  if (subs > 0 && active === 0) score += 35;
  if (isDeclining) score += 25;
  if (revPct >= CONCENTRATION_SEVERE_THRESHOLD) score += 30;
  else if (revPct >= CONCENTRATION_RISK_THRESHOLD) score += 20;
  if (isReview) score += 15;
  score += Math.min(20, (plan.performance?.comparisonAlerts?.length ?? 0) * 10);
  if (isPromote) score -= 15;

  return Math.max(0, score);
}

export function computeActionPriority(plan, flags = {}) {
  if (plan.performance?.state !== "ok") {
    return { key: ACTION_PRIORITY.low, ...PRIORITY_LABELS.low, score: 0 };
  }

  const isPromote = flags.isPromote ?? plan.portfolioActions?.isPromotionCandidate;
  const isReview = flags.isReview ?? plan.portfolioActions?.isReviewCandidate;
  const isDeclining = flags.isDeclining ?? hasDecliningMonthlyActivity(plan);
  const score = computePriorityScore(plan, { isPromote, isReview, isDeclining });

  if (score >= 45) return { key: ACTION_PRIORITY.high, ...PRIORITY_LABELS.high, score };
  if (score >= 15) return { key: ACTION_PRIORITY.medium, ...PRIORITY_LABELS.medium, score };
  return { key: ACTION_PRIORITY.low, ...PRIORITY_LABELS.low, score };
}

function buildConcentrationRisk(plan) {
  const revPct = plan.performance?.revenueContribution?.pct;
  if (revPct == null || revPct < CONCENTRATION_RISK_THRESHOLD) return null;

  const severity = revPct >= CONCENTRATION_SEVERE_THRESHOLD ? "severe" : "elevated";
  return {
    pct: revPct,
    severity,
    display: ACTION_SIGNAL_LABELS.concentration,
  };
}

function buildActionSignals(plan, { isPromote, isReview, isDeclining, concentration }) {
  const signals = [];
  if (concentration) {
    signals.push({ key: "concentration", label: concentration.display, severity: concentration.severity });
  }
  if (isDeclining) {
    signals.push({ key: "declining", label: ACTION_SIGNAL_LABELS.declining });
  }
  if (isReview) {
    signals.push({ key: "review", label: ACTION_SIGNAL_LABELS.review });
  }
  if (isPromote) {
    signals.push({ key: "promote", label: ACTION_SIGNAL_LABELS.promote });
  }
  return signals;
}

export function enrichPlansWithPortfolioActions(plans, platformContext) {
  const okPlans = (plans || []).filter((p) => p.performance?.state === "ok");
  const peer = buildPeerContext(okPlans);

  for (const plan of plans || []) {
    if (plan.performance?.state !== "ok") {
      plan.portfolioActions = null;
      continue;
    }

    const isPromote = isPromotionCandidate(plan, platformContext);
    const isReview = isReviewCandidate(plan);
    const isDeclining = hasDecliningMonthlyActivity(plan);
    const concentration = buildConcentrationRisk(plan);

    if (concentration) {
      plan.performance.concentrationRisk = concentration;
    }

    const priority = computeActionPriority(plan, { isPromote, isReview, isDeclining });
    const signals = buildActionSignals(plan, { isPromote, isReview, isDeclining, concentration });

    plan.portfolioActions = {
      priority,
      signals,
      isPromotionCandidate: isPromote,
      isReviewCandidate: isReview,
      isDeclining,
      isHighRisk:
        priority.key === ACTION_PRIORITY.high ||
        (concentration?.pct ?? 0) >= CONCENTRATION_RISK_THRESHOLD,
      peer,
    };
  }
}

export function filterPlansByDecision(plans, decisionFilter, _platformContext) {
  if (!decisionFilter || decisionFilter === DECISION_FILTERS.all) return plans;

  const okPlans = (plans || []).filter((p) => p.performance?.state === "ok");
  const peer = buildPeerContext(okPlans);

  return (plans || []).filter((plan) => {
    if (plan.performance?.state !== "ok") return false;
    const actions = plan.portfolioActions;
    if (!actions) return false;

    switch (decisionFilter) {
      case DECISION_FILTERS.promote:
        return actions.isPromotionCandidate;
      case DECISION_FILTERS.review:
        return actions.isReviewCandidate;
      case DECISION_FILTERS.high_risk:
        return actions.isHighRisk;
      case DECISION_FILTERS.no_subs:
        return plan.portfolioHealth?.key === "unused";
      case DECISION_FILTERS.top_revenue: {
        const rev = plan.performance.revenueJod.value ?? 0;
        if (rev <= 0) return false;
        const threshold = peer.p75Rev ?? rev;
        return rev >= threshold;
      }
      case DECISION_FILTERS.top_usage: {
        const subs = plan.performance.subscribers.value ?? 0;
        if (subs <= 0) return false;
        const threshold = peer.p75Subs ?? subs;
        return subs >= threshold;
      }
      default:
        return true;
    }
  });
}

export function computePortfolioActionChips(plans, platformContext) {
  const okPlans = (plans || []).filter((p) => p.performance?.state === "ok");
  if (!okPlans.length) return [];

  let reviewCount = 0;
  let promoteCount = 0;
  let noSubsCount = 0;
  let highRiskCount = 0;

  for (const plan of okPlans) {
    const a = plan.portfolioActions;
    if (!a) continue;
    if (a.isReviewCandidate) reviewCount += 1;
    if (a.isPromotionCandidate) promoteCount += 1;
    if (plan.portfolioHealth?.key === "unused") noSubsCount += 1;
    if (a.isHighRisk) highRiskCount += 1;
  }

  const chips = [];

  if (reviewCount > 0) {
    chips.push({
      key: DECISION_FILTERS.review,
      label:
        reviewCount === 1
          ? "باقة واحدة تحتاج مراجعة"
          : `${formatInt(reviewCount)} باقات تحتاج مراجعة`,
      count: reviewCount,
    });
  }
  if (promoteCount > 0) {
    chips.push({
      key: DECISION_FILTERS.promote,
      label:
        promoteCount === 1
          ? "باقة واحدة مرشّحة للترويج"
          : `${formatInt(promoteCount)} باقات مرشّحة للترويج`,
      count: promoteCount,
    });
  }

  const topRev = pickTopPlan(okPlans, (p) => p.performance.revenueJod.value);
  if (topRev && platformContext?.totalRevenue > 0) {
    const pct = (topRev.val / platformContext.totalRevenue) * 100;
    if (pct >= CONCENTRATION_RISK_THRESHOLD) {
      chips.push({
        key: DECISION_FILTERS.high_risk,
        label:
          pct >= CONCENTRATION_SEVERE_THRESHOLD
            ? "تركّز شديد على باقة واحدة"
            : "باقة واحدة تحمل قيمة مدفوعة كبيرة",
        count: 1,
      });
    }
  }

  if (noSubsCount > 0) {
    chips.push({
      key: DECISION_FILTERS.no_subs,
      label:
        noSubsCount === 1
          ? "باقة واحدة بلا اشتراكات سارية"
          : `${formatInt(noSubsCount)} باقات بلا اشتراكات سارية`,
      count: noSubsCount,
    });
  }

  if (highRiskCount > 0 && !chips.some((c) => c.key === DECISION_FILTERS.high_risk)) {
    chips.push({
      key: DECISION_FILTERS.high_risk,
      label:
        highRiskCount === 1
          ? "باقة واحدة عالية المخاطر"
          : `${formatInt(highRiskCount)} باقات عالية المخاطر`,
      count: highRiskCount,
    });
  }

  return chips;
}

export function computePortfolioSummarySentence(plans, platformContext) {
  const okPlans = (plans || []).filter((p) => p.performance?.state === "ok");
  if (!okPlans.length) return null;

  let reviewCount = 0;
  let promoteCount = 0;
  let highCount = 0;
  let decliningCount = 0;

  for (const plan of okPlans) {
    const a = plan.portfolioActions;
    if (!a) continue;
    if (a.isReviewCandidate) reviewCount += 1;
    if (a.isPromotionCandidate) promoteCount += 1;
    if (a.priority?.key === ACTION_PRIORITY.high) highCount += 1;
    if (a.isDeclining) decliningCount += 1;
  }

  const parts = [];

  if (highCount === 0 && reviewCount === 0 && decliningCount === 0) {
    parts.push("محفظة الباقات مستقرة.");
  } else if (highCount > 0) {
    parts.push(
      highCount === 1
        ? "باقة واحدة تحتاج قراراً عاجلاً."
        : `${formatInt(highCount)} باقات تحتاج قراراً عاجلاً.`,
    );
  } else if (reviewCount > 0) {
    parts.push(
      reviewCount === 1
        ? "باقة واحدة تحتاج مراجعة."
        : `${formatInt(reviewCount)} باقات تحتاج مراجعة.`,
    );
  } else if (decliningCount > 0) {
    parts.push(
      decliningCount === 1
        ? "باقة واحدة تشهد انخفاضاً شهرياً."
        : `${formatInt(decliningCount)} باقات تشهد انخفاضاً شهرياً.`,
    );
  } else {
    parts.push("محفظة الباقات تحتاج متابعة.");
  }

  const topRev = pickTopPlan(okPlans, (p) => p.performance.revenueJod.value);
  if (topRev && platformContext?.totalRevenue > 0) {
    const pct = Math.round((topRev.val / platformContext.totalRevenue) * 100);
    if (pct >= CONCENTRATION_RISK_THRESHOLD) {
      parts.push(`تعتمد ${formatInt(pct)}٪ من القيمة المدفوعة على باقة واحدة.`);
    }
  }

  if (promoteCount > 0) {
    parts.push(
      promoteCount === 1
        ? "باقة واحدة مرشّحة للترويج."
        : `${formatInt(promoteCount)} باقات مرشّحة للترويج.`,
    );
  }

  return parts.join(" ");
}
