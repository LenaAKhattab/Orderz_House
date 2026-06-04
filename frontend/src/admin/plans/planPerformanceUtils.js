import { formatPriceJod } from "./planDisplayUtils";
import {
  ALERT_LABELS,
  BADGE_LABELS,
  concentrationPlatformPhrase,
  HEALTH_LABELS,
  RECOMMENDATION_LABELS,
  revenueSharePhrase,
  STRIP_LABELS,
} from "./planMetricTerminology";

export const LABEL_UNAVAILABLE = "غير متاح";
export const LABEL_LOAD_FAILED = "تعذر تحميل البيانات";

/** Show concentration warning on card when plan revenue share ≥ this (percent). */
export const CONCENTRATION_RISK_THRESHOLD = 50;

/** Peer comparison: top/bottom quartile cutoff (0.75 = upper quartile). */
export const COMPARISON_QUARTILE = 0.75;

export const SORT_MODES = {
  revenue: "revenue",
  subscribers: "subscribers",
  active: "active",
  attention: "attention",
};

export const HEALTH_THRESHOLDS = {
  excellentMinActive: 5,
  excellentMinActiveRatio: 0.75,
  excellentRelativeActiveShare: 0.6,
  goodMinActive: 1,
  goodMinActiveRatio: 0.5,
};

export function formatInt(value) {
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

function formatPctAr(pct) {
  const n = Math.round(Number(pct));
  if (!Number.isFinite(n)) return null;
  return `${formatInt(n)}٪`;
}

export function formatTrendDisplay(trendObj) {
  if (!trendObj || trendObj.trend == null) return null;
  const pct = Math.abs(Math.round(Number(trendObj.changePct) || 0));
  if (trendObj.trend === "up") return { display: `↑ +${formatInt(pct)}٪`, trend: "up" };
  if (trendObj.trend === "down") return { display: `↓ -${formatInt(pct)}٪`, trend: "down" };
  return { display: "→ 0٪", trend: "flat" };
}

function toMetric(value, state) {
  if (state === "failed") return { value: null, display: LABEL_LOAD_FAILED };
  if (state === "unavailable" || value === null || value === undefined || Number.isNaN(Number(value))) {
    return { value: null, display: LABEL_UNAVAILABLE };
  }
  return { value: Number(value), display: formatInt(value) };
}

function toMoneyMetric(value, state) {
  if (state === "failed") return { value: null, display: LABEL_LOAD_FAILED };
  if (state === "unavailable" || value === null || value === undefined || Number.isNaN(Number(value))) {
    return { value: null, display: LABEL_UNAVAILABLE };
  }
  const n = Number(value);
  return { value: n, display: formatPriceJod(n) ?? LABEL_UNAVAILABLE };
}

function quartileValue(sortedValues, q) {
  if (!sortedValues.length) return null;
  const idx = Math.max(0, Math.ceil(sortedValues.length * q) - 1);
  return sortedValues[idx];
}

function buildComparisonContext(okPlans) {
  const subs = okPlans.map((p) => p.performance.subscribers.value ?? 0).filter((v) => v > 0);
  const rev = okPlans.map((p) => p.performance.revenueJod.value ?? 0).filter((v) => v > 0);
  const maxSubs = subs.length ? Math.max(...subs) : 0;

  return {
    p75Subs: quartileValue([...subs].sort((a, b) => a - b), COMPARISON_QUARTILE),
    p25Subs: quartileValue([...subs].sort((a, b) => a - b), 1 - COMPARISON_QUARTILE),
    p75Rev: quartileValue([...rev].sort((a, b) => a - b), COMPARISON_QUARTILE),
    p25Rev: quartileValue([...rev].sort((a, b) => a - b), 1 - COMPARISON_QUARTILE),
    maxSubs,
  };
}

function computeComparisonAlerts(plan, cmp) {
  if (plan.performance?.state !== "ok") return [];
  const subs = plan.performance.subscribers.value ?? 0;
  const rev = plan.performance.revenueJod.value ?? 0;
  const active = plan.performance.activeSubscribers.value ?? 0;
  const share = subs > 0 ? active / subs : 0;
  const alerts = [];

  if (cmp.p75Subs != null && cmp.p25Rev != null && subs >= cmp.p75Subs && (rev <= cmp.p25Rev || rev === 0)) {
    alerts.push({ key: "high_subs_low_rev", label: ALERT_LABELS.high_subs_low_rev });
  }
  if (cmp.p75Rev != null && cmp.p25Subs != null && rev >= cmp.p75Rev && subs > 0 && subs <= cmp.p25Subs) {
    alerts.push({ key: "high_rev_low_subs", label: ALERT_LABELS.high_rev_low_subs });
  }
  if (share >= 0.8 && cmp.maxSubs > 0 && subs < cmp.maxSubs * 0.35) {
    alerts.push({ key: "high_act_low_adopt", label: ALERT_LABELS.high_act_low_adopt });
  }
  if (share < 0.5 && cmp.p75Subs != null && subs >= cmp.p75Subs) {
    alerts.push({ key: "low_act_high_adopt", label: ALERT_LABELS.low_act_high_adopt });
  }

  return alerts;
}

function computeRecommendations(plan, health, alerts, platformContext) {
  const recs = [];
  if (plan.performance?.state !== "ok") return recs;

  const rev = plan.performance.revenueJod.value ?? 0;
  const active = plan.performance.activeSubscribers.value ?? 0;
  const subs = plan.performance.subscribers.value ?? 0;
  const share = subs > 0 ? active / subs : 0;
  const revPct = plan.performance.revenueContribution?.pct ?? 0;

  if (health?.key === "excellent") recs.push({ key: "promote", label: RECOMMENDATION_LABELS.promote });
  if (health?.key === "weak") recs.push({ key: "review", label: RECOMMENDATION_LABELS.review });
  if (health?.key === "unused") recs.push({ key: "rethink", label: RECOMMENDATION_LABELS.rethink });

  if (
    plan.isActive &&
    rev > 0 &&
    share >= 0.75 &&
    (revPct >= 25 || active >= (platformContext?.strongActiveFloor ?? 5))
  ) {
    recs.push({ key: "strategic", label: RECOMMENDATION_LABELS.strategic });
  }

  for (const alert of alerts) {
    if (alert.key === "high_subs_low_rev") recs.push({ key: "fix_revenue", label: RECOMMENDATION_LABELS.fix_revenue });
    if (alert.key === "low_act_high_adopt") recs.push({ key: "fix_activation", label: RECOMMENDATION_LABELS.fix_activation });
  }

  const seen = new Set();
  return recs.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}

function computeAttentionScore(plan, health, alerts) {
  let score = 0;
  if (health?.key === "unused") score += 100;
  else if (health?.key === "weak") score += 80;
  else if (health?.key === "catalog_off") score += 70;
  else if (health?.key === "good") score += 20;
  score += alerts.length * 12;
  const revPct = plan.performance?.revenueContribution?.pct ?? 0;
  if (revPct >= CONCENTRATION_RISK_THRESHOLD) score += 10;
  const share = plan.performance?.activeShare?.value;
  if (share != null && share < 0.5) score += Math.round((1 - share) * 40);
  return score;
}

function enrichPlanPortfolioFields(plan, platformContext, cmp) {
  if (plan.performance.state !== "ok") return;

  const subs = plan.performance.subscribers.value;
  const active = plan.performance.activeSubscribers.value;
  const rev = plan.performance.revenueJod.value;

  if (subs != null && subs > 0 && rev != null) {
    const rps = rev / subs;
    plan.performance.revenuePerSubscriber = {
      value: rps,
      display: formatPriceJod(rps),
    };
  }

  if (subs != null && subs > 0 && active != null) {
    const pct = Math.round((active / subs) * 100);
    plan.performance.activeShare = {
      value: active / subs,
      display: `${formatInt(pct)}٪ من السارية`,
    };
  }

  plan.performance.subscriberTrendDisplay = formatTrendDisplay(plan.performance.subscriberPeriodTrend);
  plan.performance.revenueTrendDisplay = formatTrendDisplay(plan.performance.revenuePeriodTrend);

  const health = computePlanHealth(plan, platformContext);
  plan.portfolioHealth = health;
  plan.performance.comparisonAlerts = computeComparisonAlerts(plan, cmp);
  plan.performance.recommendations = computeRecommendations(
    plan,
    health,
    plan.performance.comparisonAlerts,
    platformContext,
  );
  plan.performance.attentionScore = computeAttentionScore(plan, health, plan.performance.comparisonAlerts);
}

function enrichAllPlansPortfolio(plans, platformContext) {
  const okPlans = plans.filter((p) => p.performance?.state === "ok");
  const cmp = buildComparisonContext(okPlans);
  for (const plan of plans) {
    enrichPlanPortfolioFields(plan, platformContext, cmp);
  }
}

export function pickTopPlan(plans, getMetricValue) {
  let top = null;
  for (const plan of plans) {
    const val = getMetricValue(plan);
    if (val == null || val <= 0) continue;
    if (!top || val > top.val || (val === top.val && Number(plan.id) < Number(top.plan.id))) {
      top = { plan, val };
    }
  }
  return top;
}

export function getPlatformPerformanceContext(plansWithStats) {
  const okPlans = (plansWithStats || []).filter((p) => p.performance?.state === "ok");
  let maxActive = 0;
  let totalRevenue = 0;

  for (const plan of okPlans) {
    const active = plan.performance.activeSubscribers.value ?? 0;
    const rev = plan.performance.revenueJod.value ?? 0;
    if (active > maxActive) maxActive = active;
    if (rev != null && !Number.isNaN(rev)) totalRevenue += rev;
  }

  const strongActiveFloor = Math.max(
    HEALTH_THRESHOLDS.excellentMinActive,
    Math.ceil(maxActive * HEALTH_THRESHOLDS.excellentRelativeActiveShare),
  );

  return { maxActive, totalRevenue, strongActiveFloor, okPlans };
}

export function mergePlansWithPerformanceStats(plans, intelligencePayload, { statsFailed = false } = {}) {
  const byPlan = intelligencePayload?.data?.byPlan;
  const statsAvailable = !statsFailed && Array.isArray(byPlan);
  const statsByPlanId = new Map();

  if (statsAvailable) {
    for (const row of byPlan) {
      if (row?.planId == null) continue;
      statsByPlanId.set(String(row.planId), row);
    }
  }

  const merged = (plans || []).map((plan) => {
    let state = "unavailable";
    if (statsFailed) state = "failed";
    else if (statsAvailable && statsByPlanId.has(String(plan.id))) state = "ok";

    const stats = statsByPlanId.get(String(plan.id));
    const performance = {
      state,
      available: state === "ok",
      subscribers: toMetric(state === "ok" ? stats.subscribers : null, state),
      activeSubscribers: toMetric(state === "ok" ? stats.activeSubscribers : null, state),
      revenueJod: toMoneyMetric(state === "ok" ? stats.revenueJod : null, state),
      revenueContribution: null,
      subscriberPeriodTrend: state === "ok" ? stats.subscriberPeriodTrend ?? null : null,
      revenuePeriodTrend: state === "ok" ? stats.revenuePeriodTrend ?? null : null,
      revenuePerSubscriber: null,
      activeShare: null,
      subscriberTrendDisplay: null,
      revenueTrendDisplay: null,
      concentrationRisk: null,
      comparisonAlerts: [],
      recommendations: [],
      attentionScore: 0,
    };

    return { ...plan, performance };
  });

  const platform = getPlatformPerformanceContext(merged);

  for (const plan of merged) {
    if (plan.performance.state !== "ok") continue;
    const rev = plan.performance.revenueJod.value;
    if (platform.totalRevenue > 0 && rev != null && !Number.isNaN(rev)) {
      const pct = (rev / platform.totalRevenue) * 100;
      plan.performance.revenueContribution = {
        pct,
        display: revenueSharePhrase(formatPctAr(pct)),
      };
    }
  }

  enrichAllPlansPortfolio(merged, platform);

  return { plans: merged, statsAvailable, statsFailed, platformContext: platform };
}

export function computePlanBadges(plansWithStats) {
  const badges = new Map();
  const list = (plansWithStats || []).filter((p) => p.performance?.state === "ok");
  if (!list.length) return badges;

  const topSubs = pickTopPlan(list, (p) => p.performance.subscribers.value);
  const topRev = pickTopPlan(list, (p) => p.performance.revenueJod.value);

  let topPrice = null;
  for (const plan of list) {
    if (!plan.isActive) continue;
    const price = plan.priceJod != null && !Number.isNaN(Number(plan.priceJod)) ? Number(plan.priceJod) : null;
    if (price == null) continue;
    if (
      !topPrice ||
      price > topPrice.price ||
      (price === topPrice.price && Number(plan.sortOrder ?? 0) < Number(topPrice.plan.sortOrder ?? 0))
    ) {
      topPrice = { plan, price };
    }
  }

  if (topSubs) badges.set(String(topSubs.plan.id), { key: "popular", label: BADGE_LABELS.popular });
  if (topRev) badges.set(String(topRev.plan.id), { key: "revenue", label: BADGE_LABELS.revenue });
  if (topPrice) badges.set(String(topPrice.plan.id), { key: "premium", label: BADGE_LABELS.premium });

  return badges;
}

export function computePlanHealth(plan, platformContext) {
  if (plan.performance?.state !== "ok") return null;

  const subs = plan.performance.subscribers.value;
  const active = plan.performance.activeSubscribers.value;
  if (subs == null || active == null) return null;

  if (subs === 0) return { key: "unused", ...HEALTH_LABELS.unused };
  if (!plan.isActive) return { key: "catalog_off", ...HEALTH_LABELS.catalog_off };

  const ratio = subs > 0 ? active / subs : 0;
  const floor = platformContext?.strongActiveFloor ?? HEALTH_THRESHOLDS.excellentMinActive;

  if (
    active >= HEALTH_THRESHOLDS.excellentMinActive &&
    ratio >= HEALTH_THRESHOLDS.excellentMinActiveRatio &&
    active >= floor
  ) {
    return { key: "excellent", ...HEALTH_LABELS.excellent };
  }
  if (active >= HEALTH_THRESHOLDS.goodMinActive && ratio >= HEALTH_THRESHOLDS.goodMinActiveRatio) {
    return { key: "good", ...HEALTH_LABELS.good };
  }
  return { key: "weak", ...HEALTH_LABELS.weak };
}

export function computePortfolioInsightStrip(plansWithStats, { statsAvailable, statsFailed, platformContext } = {}) {
  if (statsFailed || !statsAvailable) {
    return { items: [], concentrationPlatform: null };
  }

  const okPlans = (plansWithStats || []).filter((p) => p.performance?.state === "ok");
  const topRev = pickTopPlan(okPlans, (p) => p.performance.revenueJod.value);
  const topSubs = pickTopPlan(okPlans, (p) => p.performance.subscribers.value);

  let fastestGrowth = null;
  for (const plan of okPlans) {
    const t = plan.performance.subscriberTrendDisplay;
    if (!t || t.trend !== "up") continue;
    const pct = plan.performance.subscriberPeriodTrend?.changePct ?? 0;
    if (!fastestGrowth || pct > fastestGrowth.pct || (pct === fastestGrowth.pct && Number(plan.id) < Number(fastestGrowth.plan.id))) {
      fastestGrowth = { plan, pct };
    }
  }

  const items = [];
  if (fastestGrowth) {
    items.push({
      key: "growth",
      label: STRIP_LABELS.growth,
      value: `${fastestGrowth.plan.title} ${fastestGrowth.plan.performance.subscriberTrendDisplay.display} (شهري)`,
    });
  }
  if (topRev) {
    const pct = platformContext?.totalRevenue > 0 ? (topRev.val / platformContext.totalRevenue) * 100 : null;
    items.push({
      key: "revenue",
      label: STRIP_LABELS.revenue,
      value: pct != null ? `${topRev.plan.title} (${formatPctAr(pct)} من المدفوع)` : topRev.plan.title,
    });
  }
  if (topSubs) {
    items.push({
      key: "usage",
      label: STRIP_LABELS.usage,
      value: `${topSubs.plan.title} (${formatInt(topSubs.val)} اشتراك ساري)`,
    });
  }

  let concentrationPlatform = null;
  if (topRev && platformContext?.totalRevenue > 0) {
    const pct = (topRev.val / platformContext.totalRevenue) * 100;
    if (pct >= CONCENTRATION_RISK_THRESHOLD) {
      concentrationPlatform = {
        display: concentrationPlatformPhrase(topRev.plan.title, formatPctAr(pct)),
        pct,
      };
      items.push({ key: "risk", label: STRIP_LABELS.risk, value: concentrationPlatform.display });
    }
  }

  return { items, concentrationPlatform };
}

export function sortPlansForDisplay(plans, sortMode = SORT_MODES.revenue) {
  const list = [...(plans || [])];
  const byId = (a, b) => Number(a.id) - Number(b.id);

  switch (sortMode) {
    case SORT_MODES.subscribers:
      return list.sort((a, b) => {
        const diff = (b.performance?.subscribers?.value ?? -1) - (a.performance?.subscribers?.value ?? -1);
        return diff !== 0 ? diff : byId(a, b);
      });
    case SORT_MODES.active:
      return list.sort((a, b) => {
        const diff =
          (b.performance?.activeSubscribers?.value ?? -1) - (a.performance?.activeSubscribers?.value ?? -1);
        return diff !== 0 ? diff : byId(a, b);
      });
    case SORT_MODES.attention:
      return list.sort((a, b) => {
        const diff = (b.performance?.attentionScore ?? 0) - (a.performance?.attentionScore ?? 0);
        return diff !== 0 ? diff : byId(a, b);
      });
    case SORT_MODES.revenue:
    default:
      return list.sort((a, b) => {
        const diff = (b.performance?.revenueJod?.value ?? -1) - (a.performance?.revenueJod?.value ?? -1);
        return diff !== 0 ? diff : byId(a, b);
      });
  }
}

export function computePlansBusinessSummary(plansWithStats, { statsAvailable, statsFailed, platformContext } = {}) {
  if (statsFailed) {
    return {
      totalSubscribers: { display: LABEL_LOAD_FAILED },
      totalRevenue: { display: LABEL_LOAD_FAILED },
      topPlanByUsage: { display: LABEL_LOAD_FAILED },
      topPlanByRevenue: { display: LABEL_LOAD_FAILED },
      topRevenueShare: { display: LABEL_LOAD_FAILED },
    };
  }

  if (!statsAvailable) {
    return {
      totalSubscribers: { display: LABEL_UNAVAILABLE },
      totalRevenue: { display: LABEL_UNAVAILABLE },
      topPlanByUsage: { display: LABEL_UNAVAILABLE },
      topPlanByRevenue: { display: LABEL_UNAVAILABLE },
      topRevenueShare: { display: LABEL_UNAVAILABLE },
    };
  }

  const okPlans = (plansWithStats || []).filter((p) => p.performance?.state === "ok");
  const ctx = platformContext || getPlatformPerformanceContext(plansWithStats);

  let totalSubscribers = 0;
  for (const plan of okPlans) {
    const subs = plan.performance.subscribers.value;
    if (subs != null) totalSubscribers += subs;
  }

  const topUsage = pickTopPlan(okPlans, (p) => p.performance.subscribers.value);
  const topRevenue = pickTopPlan(okPlans, (p) => p.performance.revenueJod.value);

  let topRevenueShare = { display: LABEL_UNAVAILABLE };
  if (topRevenue && ctx.totalRevenue > 0) {
    const pct = (topRevenue.val / ctx.totalRevenue) * 100;
    topRevenueShare = {
      display: `${topRevenue.plan.title} — ${revenueSharePhrase(formatPctAr(pct))}`,
      title: topRevenue.plan.title,
      pct,
    };
  } else if (topRevenue && ctx.totalRevenue === 0) {
    topRevenueShare = { display: `${topRevenue.plan.title} — لا قيمة مدفوعة مسجّلة بعد` };
  }

  return {
    totalSubscribers: { display: formatInt(totalSubscribers) },
    totalRevenue: { display: formatPriceJod(ctx.totalRevenue) ?? `${formatInt(0)} د.أ` },
    topPlanByUsage: {
      display: topUsage ? `${topUsage.plan.title} (${formatInt(topUsage.val)} ساري)` : LABEL_UNAVAILABLE,
    },
    topPlanByRevenue: {
      display: topRevenue ? `${topRevenue.plan.title} (${formatPriceJod(topRevenue.val)} مدفوع)` : LABEL_UNAVAILABLE,
    },
    topRevenueShare,
  };
}
