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
import "../../i18n/planAdminResources";
import { pt } from "../../i18n/activeLocale.js";
import { legacyArabicUiLocale } from "../adminLocale.js";

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

const PRIORITY_EMOJI = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

/**
 * Translator used when `t` is omitted. These helpers historically answered in Arabic without `t`; that stays
 * for Arabic / English, while German / Dutch / Romanian resolve their own planAdmin copy.
 */
function fallbackT(key, values) {
  return pt(key, values, legacyArabicUiLocale());
}

/** @deprecated Arabic-only fallbacks when `t` is omitted (now resolved from planAdmin.metrics.portfolio.signals) */
export const ACTION_SIGNAL_LABELS = Object.freeze({
  get promote() {
    return fallbackT("planAdmin.metrics.portfolio.signals.promote");
  },
  get review() {
    return fallbackT("planAdmin.metrics.portfolio.signals.review");
  },
  get declining() {
    return fallbackT("planAdmin.metrics.portfolio.signals.declining");
  },
  get concentration() {
    return fallbackT("planAdmin.metrics.portfolio.signals.concentration");
  },
});

function priorityLabelEntry(key) {
  return Object.freeze({
    get label() {
      return fallbackT(`planAdmin.metrics.portfolio.priority.${key}`);
    },
    emoji: PRIORITY_EMOJI[key],
  });
}

/** @deprecated Arabic-only fallbacks when `t` is omitted (now resolved from planAdmin.metrics.portfolio.priority) */
export const PRIORITY_LABELS = {
  high: priorityLabelEntry("high"),
  medium: priorityLabelEntry("medium"),
  low: priorityLabelEntry("low"),
};

function actionSignalLabel(key, t) {
  if (t) return t(`planAdmin.metrics.portfolio.signals.${key}`);
  return ACTION_SIGNAL_LABELS[key];
}

function priorityMeta(priorityKey, t) {
  const emoji = PRIORITY_EMOJI[priorityKey];
  const label = t
    ? t(`planAdmin.metrics.portfolio.priority.${priorityKey}`)
    : PRIORITY_LABELS[priorityKey].label;
  return { label, emoji };
}

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

export function computeActionPriority(plan, flags = {}, t = null) {
  if (plan.performance?.state !== "ok") {
    return { key: ACTION_PRIORITY.low, ...priorityMeta(ACTION_PRIORITY.low, t), score: 0 };
  }

  const isPromote = flags.isPromote ?? plan.portfolioActions?.isPromotionCandidate;
  const isReview = flags.isReview ?? plan.portfolioActions?.isReviewCandidate;
  const isDeclining = flags.isDeclining ?? hasDecliningMonthlyActivity(plan);
  const score = computePriorityScore(plan, { isPromote, isReview, isDeclining });

  if (score >= 45) return { key: ACTION_PRIORITY.high, ...priorityMeta(ACTION_PRIORITY.high, t), score };
  if (score >= 15) return { key: ACTION_PRIORITY.medium, ...priorityMeta(ACTION_PRIORITY.medium, t), score };
  return { key: ACTION_PRIORITY.low, ...priorityMeta(ACTION_PRIORITY.low, t), score };
}

function buildConcentrationRisk(plan, t) {
  const revPct = plan.performance?.revenueContribution?.pct;
  if (revPct == null || revPct < CONCENTRATION_RISK_THRESHOLD) return null;

  const severity = revPct >= CONCENTRATION_SEVERE_THRESHOLD ? "severe" : "elevated";
  return {
    pct: revPct,
    severity,
    display: actionSignalLabel("concentration", t),
  };
}

function buildActionSignals(plan, { isPromote, isReview, isDeclining, concentration }, t) {
  const signals = [];
  if (concentration) {
    signals.push({ key: "concentration", label: concentration.display, severity: concentration.severity });
  }
  if (isDeclining) {
    signals.push({ key: "declining", label: actionSignalLabel("declining", t) });
  }
  if (isReview) {
    signals.push({ key: "review", label: actionSignalLabel("review", t) });
  }
  if (isPromote) {
    signals.push({ key: "promote", label: actionSignalLabel("promote", t) });
  }
  return signals;
}

export function enrichPlansWithPortfolioActions(plans, platformContext, t = null) {
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
    const concentration = buildConcentrationRisk(plan, t);

    if (concentration) {
      plan.performance.concentrationRisk = concentration;
    }

    const priority = computeActionPriority(plan, { isPromote, isReview, isDeclining }, t);
    const signals = buildActionSignals(plan, { isPromote, isReview, isDeclining, concentration }, t);

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

export function computePortfolioActionChips(plans, platformContext, t = null) {
  const chip = (oneKey, manyKey, count) => {
    const n = formatInt(count);
    const tr = t || fallbackT;
    return count === 1
      ? tr(`planAdmin.metrics.portfolio.chips.${oneKey}`)
      : tr(`planAdmin.metrics.portfolio.chips.${manyKey}`, { count: n });
  };

  const concentrationLabel = (severe) => {
    const tr = t || fallbackT;
    return severe
      ? tr("planAdmin.metrics.portfolio.chips.concentrationSevere")
      : tr("planAdmin.metrics.portfolio.chips.concentrationElevated");
  };
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
      label: chip("reviewOne", "reviewMany", reviewCount),
      count: reviewCount,
    });
  }
  if (promoteCount > 0) {
    chips.push({
      key: DECISION_FILTERS.promote,
      label: chip("promoteOne", "promoteMany", promoteCount),
      count: promoteCount,
    });
  }

  const topRev = pickTopPlan(okPlans, (p) => p.performance.revenueJod.value);
  if (topRev && platformContext?.totalRevenue > 0) {
    const pct = (topRev.val / platformContext.totalRevenue) * 100;
    if (pct >= CONCENTRATION_RISK_THRESHOLD) {
      chips.push({
        key: DECISION_FILTERS.high_risk,
        label: concentrationLabel(pct >= CONCENTRATION_SEVERE_THRESHOLD),
        count: 1,
      });
    }
  }

  if (noSubsCount > 0) {
    chips.push({
      key: DECISION_FILTERS.no_subs,
      label: chip("noSubsOne", "noSubsMany", noSubsCount),
      count: noSubsCount,
    });
  }

  if (highRiskCount > 0 && !chips.some((c) => c.key === DECISION_FILTERS.high_risk)) {
    chips.push({
      key: DECISION_FILTERS.high_risk,
      label: chip("highRiskOne", "highRiskMany", highRiskCount),
      count: highRiskCount,
    });
  }

  return chips;
}

export function computePortfolioSummarySentence(plans, platformContext, t = null) {
  const summary = (key, params) => {
    if (t) return t(`planAdmin.metrics.portfolio.summary.${key}`, params);
    const formatted = params
      ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, formatInt(v)]))
      : undefined;
    return fallbackT(`planAdmin.metrics.portfolio.summary.${key}`, formatted);
  };
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
    parts.push(summary("stable"));
  } else if (highCount > 0) {
    parts.push(
      highCount === 1 ? summary("urgentOne") : summary("urgentMany", { count: highCount }),
    );
  } else if (reviewCount > 0) {
    parts.push(
      reviewCount === 1 ? summary("reviewOne") : summary("reviewMany", { count: reviewCount }),
    );
  } else if (decliningCount > 0) {
    parts.push(
      decliningCount === 1
        ? summary("decliningOne")
        : summary("decliningMany", { count: decliningCount }),
    );
  } else {
    parts.push(summary("needsAttention"));
  }

  const topRev = pickTopPlan(okPlans, (p) => p.performance.revenueJod.value);
  if (topRev && platformContext?.totalRevenue > 0) {
    const pct = Math.round((topRev.val / platformContext.totalRevenue) * 100);
    if (pct >= CONCENTRATION_RISK_THRESHOLD) {
      parts.push(summary("concentration", { pct }));
    }
  }

  if (promoteCount > 0) {
    parts.push(
      promoteCount === 1 ? summary("promoteOne") : summary("promoteMany", { count: promoteCount }),
    );
  }

  return parts.join(" ");
}
