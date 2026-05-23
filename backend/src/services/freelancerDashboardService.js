const authService = require("./authService");
const subscriptionsService = require("./subscriptionsService");
const ordersService = require("./ordersService");
const financialClaimsService = require("./financialClaimsService");
const coursesService = require("./coursesService");
const notificationService = require("./notificationService");
const planOrderValueEligibility = require("./planOrderValueEligibility");
const {
  aggregateFinancialClaims,
  aggregateCourses,
  buildPendingActions,
  computeActiveWorkloadCount,
  computeRemainingDays,
  getEligibilityMessageAr,
  isFreePlan,
} = require("./freelancerDashboardAggregates");
const freelancerPerformanceService = require("./freelancerPerformanceService");
const freelancerReviewsService = require("./freelancerReviewsService");
const { buildGrowthBundle } = require("./freelancerDashboardGrowth");

const SECTION_TIMEOUT_MS = Number(process.env.DASHBOARD_SECTION_TIMEOUT_MS || 5000);

function safeErrorMessage(err) {
  return err?.message || "تعذر تحميل هذا القسم.";
}

async function safeSection(name, runner, fallback) {
  try {
    const value = await runner();
    return { ok: true, value, error: null };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[freelancer-dashboard] ${name} failed:`, err?.message || err);
    return { ok: false, value: fallback, error: safeErrorMessage(err) };
  }
}

/** Optional sections: fail fast instead of blocking the whole dashboard. */
async function safeSectionWithTimeout(name, runner, fallback, timeoutMs = SECTION_TIMEOUT_MS) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn(`[freelancer-dashboard] ${name} timed out after ${timeoutMs}ms`);
      resolve({ ok: false, value: fallback, error: "انتهت مهلة تحميل هذا القسم." });
    }, timeoutMs);
  });

  const workPromise = safeSection(name, runner, fallback).then((r) => {
    clearTimeout(timer);
    return r;
  });

  return Promise.race([workPromise, timeoutPromise]);
}

function mapProfileSummary(userRow) {
  if (!userRow) return null;
  return {
    id: String(userRow.id),
    firstName: userRow.first_name || null,
    lastName: userRow.family_name || null,
    professionalTitle: userRow.professional_title || null,
    avatar: userRow.avatar_url || null,
    role: userRow.role || null,
    isActive: userRow.is_active !== false,
    emailVerified: userRow.email_verified !== false,
  };
}

function mapSubscriptionSummary(subscription, planRange) {
  if (!subscription) return null;
  const labelAr = planOrderValueEligibility.formatPlanRangeLabel(planRange);
  return {
    id: subscription.id,
    planId: subscription.planId,
    plan: subscription.plan
      ? {
          id: subscription.plan.id,
          name: subscription.plan.name,
          title: subscription.plan.title,
          durationDays: subscription.plan.durationDays,
          priceJod: subscription.plan.priceJod,
        }
      : null,
    paymentStatus: subscription.paymentStatus,
    activationStatus: subscription.activationStatus,
    status: subscription.status,
    actualStartDate: subscription.actualStartDate,
    expiryDate: subscription.expiryDate,
    remainingDays: computeRemainingDays(subscription.expiryDate),
    hasFirstOrder: Boolean(subscription.hasFirstOrder),
    planOrderValueRange: planRange
      ? {
          minOrderValue: planRange.minOrderValue != null ? Number(planRange.minOrderValue) : null,
          maxOrderValue: planRange.maxOrderValue != null ? Number(planRange.maxOrderValue) : null,
          labelAr,
        }
      : null,
    labelAr,
  };
}

function mapEligibilitySummary(eligibility, subscription, planRange, canAccessTrainingOrders) {
  const eligible = Boolean(eligibility?.eligible);
  return {
    eligible,
    reason: eligibility?.reason || null,
    messageAr: getEligibilityMessageAr(eligibility, subscription),
    canAccessRealOrders: eligible,
    canAccessTrainingOrders: Boolean(canAccessTrainingOrders),
  };
}

async function getFreelancerDashboardSummary(freelancerUserId) {
  const started = Date.now();
  const uid = Number(freelancerUserId);
  const sectionErrors = {};

  const [, userRow, subscription] = await Promise.all([
    subscriptionsService.maybeEnsureFreelancerDefaultFreePlan(uid),
    authService.findUserById(uid),
    subscriptionsService.getCurrentSubscriptionForFreelancer(uid),
  ]);

  const profile = mapProfileSummary(userRow);
  const eligibility = subscriptionsService.evaluateFreelancerTakeOrdersEligibility(subscription);

  const planRange = subscription?.planId
    ? await planOrderValueEligibility.resolvePlanOrderValueRange(subscription.planId)
    : null;
  const canAccessTrainingOrders = false;

  const subscriptionSummary = mapSubscriptionSummary(subscription, planRange);
  const eligibilitySummary = mapEligibilitySummary(
    eligibility,
    subscription,
    planRange,
    canAccessTrainingOrders,
  );

  const ordersFallback = { counts: {}, overdueCount: 0, recentActiveOrders: [] };
  const earningsFallback = null;
  const coursesFallback = {
    total: 0,
    inProgress: 0,
    completed: 0,
    pendingFinalTest: 0,
    latestInProgressCourse: null,
  };
  const notificationsFallback = { unreadCount: 0, latest: [] };
  const poolFallback = {
    totalVisible: 0,
    eligibleCount: null,
    eligibleCountSampled: false,
    canAccessMarketplace: Boolean(eligibilitySummary.eligible),
  };
  const performanceFallback = {
    completedOrders: 0,
    totalOrders: 0,
    cancelledOrders: 0,
    completionRate: null,
    cancellationRate: null,
    revisionRate: null,
    revisionOrdersCount: 0,
    onTimeDeliveryPercent: null,
    completedWithDeadline: 0,
    onTimeDeliveries: 0,
    averageDeliveryDays: null,
    activeStreakDays: null,
    activeStreakLabel: null,
    completedLast30Days: 0,
    hasOrderHistory: false,
  };
  const reviewsFallback = {
    available: true,
    averageRating: null,
    totalReviews: 0,
    recommendationRate: null,
    ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    latestReviews: [],
    analytics: null,
  };

  const [
    ordersSection,
    earningsSection,
    coursesSection,
    notificationsSection,
    poolSection,
    performanceSection,
    reviewsSection,
  ] = await Promise.all([
    safeSectionWithTimeout(
      "orders",
      () => ordersService.getFreelancerDashboardOrderSnapshot(uid),
      ordersFallback,
    ),
    safeSectionWithTimeout(
      "earnings",
      async () => {
        const claimsList = await financialClaimsService.listClaimsForFreelancerDashboard(uid);
        return { claimsList, summary: aggregateFinancialClaims(claimsList) };
      },
      { claimsList: [], summary: earningsFallback },
    ),
    safeSectionWithTimeout(
      "courses",
      async () => {
        const coursesList = await coursesService.listAssignedCoursesForFreelancerDashboard({
          freelancerUserId: uid,
        });
        return { coursesList, agg: aggregateCourses(coursesList) };
      },
      { coursesList: [], agg: coursesFallback },
    ),
    safeSectionWithTimeout(
      "notifications",
      async () => {
        const [unreadCount, list] = await Promise.all([
          notificationService.getUnreadCount(uid),
          notificationService.getUserNotifications(uid, { limit: 3, offset: 0 }, null, "freelancer"),
        ]);
        return { unreadCount, latest: list.notifications || [] };
      },
      notificationsFallback,
    ),
    safeSectionWithTimeout(
      "pool",
      async () => {
        const counts = await ordersService.getPoolMarketplaceCountSummary();
        return {
          ...counts,
          canAccessMarketplace: Boolean(eligibilitySummary.eligible),
        };
      },
      poolFallback,
    ),
    safeSectionWithTimeout(
      "performance",
      () => freelancerPerformanceService.getFreelancerPerformanceMetrics(uid),
      performanceFallback,
    ),
    safeSectionWithTimeout(
      "reviews",
      () => freelancerReviewsService.getFreelancerReviewAggregates(uid),
      reviewsFallback,
    ),
  ]);

  if (!ordersSection.ok) sectionErrors.orders = ordersSection.error;
  if (!earningsSection.ok) sectionErrors.earnings = earningsSection.error;
  if (!coursesSection.ok) sectionErrors.courses = coursesSection.error;
  if (!notificationsSection.ok) sectionErrors.notifications = notificationsSection.error;
  if (!poolSection.ok) sectionErrors.pool = poolSection.error;
  if (!performanceSection.ok) sectionErrors.performance = performanceSection.error;
  if (!reviewsSection.ok) sectionErrors.reviews = reviewsSection.error;

  const counts = ordersSection.value.counts || {};
  const activeWorkload = computeActiveWorkloadCount(counts);
  const claimsList = earningsSection.value.claimsList || [];
  const coursesList = coursesSection.value.coursesList || [];
  const coursesAgg = coursesSection.value.agg || coursesFallback;
  const earningsAgg = earningsSection.value.summary;

  const pendingActions = buildPendingActions({
    subscription: subscriptionSummary,
    eligibility: eligibilitySummary,
    counts,
    courses: coursesSection.ok ? coursesList : [],
    claims: earningsSection.ok ? claimsList : [],
    recentOrders: ordersSection.value.recentActiveOrders || [],
    nowMs: Date.now(),
  });

  const growth = buildGrowthBundle({
    userRow,
    performance: performanceSection.value,
    coursesSummary: coursesAgg,
    earningsSummary: earningsAgg || {},
    reviewsSummary: reviewsSection.value,
    subscription: subscriptionSummary,
    eligibility: eligibilitySummary,
    counts,
    pendingActions,
    nowMs: Date.now(),
  });

  const durationMs = Date.now() - started;
  if (durationMs > 1500) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        component: "freelancer-dashboard",
        event: "summary_slow",
        durationMs,
        userId: uid,
        sectionErrors: Object.keys(sectionErrors),
      }),
    );
  }

  return {
    profile,
    subscription: subscriptionSummary,
    eligibility: eligibilitySummary,
    workload: {
      activeWorkload,
      overdueCount: Number(ordersSection.value.overdueCount || 0),
    },
    orders: {
      counts,
      recentActiveOrders: ordersSection.value.recentActiveOrders || [],
    },
    earnings: earningsSection.ok
      ? { loadState: "ok", ...earningsAgg }
      : { loadState: "error", error: earningsSection.error },
    courses: coursesSection.ok
      ? { loadState: "ok", ...coursesAgg }
      : { loadState: "error", error: coursesSection.error },
    notifications: notificationsSection.ok
      ? {
          loadState: "ok",
          unreadCount: notificationsSection.value.unreadCount,
          latest: notificationsSection.value.latest,
        }
      : { loadState: "error", error: notificationsSection.error, unreadCount: 0, latest: [] },
    pendingActions,
    pool: poolSection.value,
    performance: performanceSection.ok
      ? { loadState: "ok", ...growth.performance }
      : { loadState: "error", error: performanceSection.error, ...growth.performance },
    profileCompletion: growth.profileCompletion,
    reputation: growth.reputation,
    reviews: reviewsSection.ok
      ? { loadState: "ok", ...growth.reviews }
      : { loadState: "error", error: reviewsSection.error, ...growth.reviews },
    insights: growth.insights,
    achievements: growth.achievements,
    sectionErrors,
    meta: {
      isFreePlan: isFreePlan(subscriptionSummary?.planId),
      durationMs,
    },
  };
}

module.exports = {
  getFreelancerDashboardSummary,
};
