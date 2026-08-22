import {
  isOrderzhouseFreePlan,
  ORDERZHOUSE_PLANS_BY_ID,
} from "../constants/orderzhousePlansCatalog";
import { getLocaleField } from "../lib/i18n/getLocalizedField";

export function formatMoneyJod(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export function formatJoDateMedium(value, locale = "ar") {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const dateLocale = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(d);
}

export function formatTimeRemaining(expiryDate, nowMs = Date.now(), t) {
  if (!expiryDate || typeof t !== "function") return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;
  const diffMs = exp.getTime() - nowMs;
  if (diffMs < 0) {
    return {
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      text: t("freelancerDashboard.status.timeRemaining.expired"),
    };
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const joiner = t("freelancerDashboard.status.timeRemaining.joiner");
  const parts = [];
  if (days > 0) parts.push(t("freelancerDashboard.status.timeRemaining.day", { count: days }));
  if (hours > 0 || days > 0) parts.push(t("freelancerDashboard.status.timeRemaining.hour", { count: hours }));
  if (days === 0 && hours === 0 && minutes > 0) {
    parts.push(t("freelancerDashboard.status.timeRemaining.minute", { count: minutes }));
  }
  const partsText = parts.join(joiner);
  return {
    expired: false,
    days,
    hours,
    minutes,
    text: t("freelancerDashboard.status.timeRemaining.remaining", { parts: partsText }),
  };
}

/** @deprecated Use formatTimeRemaining */
export function formatTimeRemainingAr(expiryDate, nowMs = Date.now(), t) {
  return formatTimeRemaining(expiryDate, nowMs, t);
}

/** Human headline for subscription expiring within 7 days. */
export function formatExpiryUrgency(expiryDate, nowMs = Date.now(), t) {
  const remaining = formatTimeRemaining(expiryDate, nowMs, t);
  if (!remaining || remaining.expired) return null;
  if (remaining.days > 7) return null;

  if (remaining.days >= 2) {
    return {
      headlineKey: "freelancerDashboard.statusHeadline.expiringDays.headline",
      headlineParams: { count: remaining.days },
      sub: remaining.text,
    };
  }
  if (remaining.days === 1) {
    return {
      headlineKey: "freelancerDashboard.statusHeadline.expiringTomorrow.headline",
      headlineParams: undefined,
      sub: remaining.text,
    };
  }
  if (remaining.hours > 0) {
    return {
      headlineKey: "freelancerDashboard.statusHeadline.expiringHours.headline",
      headlineParams: { count: remaining.hours },
      sub: remaining.text,
    };
  }
  return {
    headlineKey: "freelancerDashboard.statusHeadline.expiringToday.headline",
    headlineParams: undefined,
    sub: remaining.text,
  };
}

/**
 * Active workload: assigned + in progress (incl. ready_for_work) + pending client review.
 * Does not add revisionRequired separately (those rows are already in inProgress).
 */
export function computeActiveWorkloadCount(counts = {}) {
  return (
    (Number(counts.assigned) || 0) +
    (Number(counts.inProgress) || 0) +
    (Number(counts.waitingClientApproval) || 0)
  );
}

export function mergeOrdersByRecency(orderLists, limit = 5) {
  const byId = new Map();
  for (const list of orderLists) {
    if (!Array.isArray(list)) continue;
    for (const o of list) {
      if (o?.id != null) byId.set(String(o.id), o);
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return tb - ta;
    })
    .slice(0, limit);
}

export function getPlanOrderValueRangeLabel(subscription, t) {
  if (typeof t !== "function") return null;
  const planId = Number(subscription?.planId ?? subscription?.plan?.id);
  const catalog = ORDERZHOUSE_PLANS_BY_ID[planId];
  if (!catalog) return null;
  if (isOrderzhouseFreePlan(planId)) {
    return t("freelancerDashboard.plans.rangeFreePlan");
  }
  const min = catalog.minOrderValue ?? catalog.orderValueMinJod;
  const max = catalog.maxOrderValue ?? catalog.orderValueMaxJod;
  if (min != null && max != null) return t("freelancerDashboard.plans.rangeMinMax", { min, max });
  if (min != null) return t("freelancerDashboard.plans.rangeMinOnly", { min });
  return null;
}

export function aggregateFinancialClaims(claims = []) {
  let paidTotalJod = 0;
  let pendingTotalJod = 0;
  let openClaimsCount = 0;
  const openStatuses = new Set(["pending", "accepted", "frozen", "requires_in_person_review"]);

  for (const c of claims) {
    const status = String(c?.status || "");
    const paid = Number(c?.paidAmount || 0);
    const remaining = Number(c?.remainingAmount || 0);
    if (status === "paid" || paid > 0) {
      paidTotalJod += paid;
    }
    if (openStatuses.has(status)) {
      openClaimsCount += 1;
      if (remaining > 0) pendingTotalJod += remaining;
      else if (status === "accepted" || status === "pending") {
        const snap = Number(c?.userAmountSnapshot);
        if (Number.isFinite(snap) && snap > 0) pendingTotalJod += snap;
      }
    }
  }

  const sorted = [...claims].sort((a, b) => {
    const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return tb - ta;
  });

  return {
    paidTotalJod: Math.round(paidTotalJod * 100) / 100,
    pendingTotalJod: Math.round(pendingTotalJod * 100) / 100,
    openClaimsCount,
    latestClaim: sorted[0] || null,
  };
}

function courseProgress(course) {
  const p = course?.progress;
  const completed = p?.completedLessons ?? 0;
  const total = p?.totalLessons ?? 0;
  const pct =
    typeof p?.percentage === "number"
      ? Math.min(100, Math.max(0, p.percentage))
      : total > 0
        ? Math.round((completed / total) * 100)
        : 0;
  return { completed, total, pct };
}

export function isCourseCompleted(course) {
  if (course?.courseCompletedAt) return true;
  const { pct } = courseProgress(course);
  return !course?.isTestingEnabled && pct >= 100;
}

export function isCourseFinalTestPending(course) {
  if (!course?.isTestingEnabled || isCourseCompleted(course)) return false;
  const { completed, total } = courseProgress(course);
  return total > 0 && completed >= total;
}

export function aggregateCourses(courses = []) {
  let inProgress = 0;
  let completed = 0;
  let notStarted = 0;
  let pendingFinalTest = 0;
  let continueCourse = null;

  for (const c of courses) {
    if (c?.isLocked) continue;
    if (isCourseCompleted(c)) {
      completed += 1;
      continue;
    }
    const { pct } = courseProgress(c);
    if (pct === 0) notStarted += 1;
    else {
      inProgress += 1;
      if (!continueCourse) continueCourse = c;
    }
    if (isCourseFinalTestPending(c)) pendingFinalTest += 1;
  }

  return {
    total: courses.filter((c) => !c?.isLocked).length,
    inProgress,
    notStarted,
    completed,
    pendingFinalTest,
    continueCourse: continueCourse || courses.find((c) => !isCourseCompleted(c) && !c?.isLocked) || null,
  };
}

const ACTIVE_ORDER_STATUSES = new Set([
  "assigned",
  "in_progress",
  "ready_for_work",
  "pending_client_review",
]);

export function isActiveOrder(order) {
  const st = String(order?.orderStatus || "");
  if (ACTIVE_ORDER_STATUSES.has(st)) return true;
  if (
    order?.clientRevisionNote &&
    ["in_progress", "ready_for_work", "pending_client_review"].includes(st)
  ) {
    return true;
  }
  return false;
}

export function filterActiveOrders(orders = [], limit = 5) {
  return orders.filter(isActiveOrder).slice(0, limit);
}

export function buildFreelancerStatusHeadline({ eligibility, subscription, nowMs = Date.now(), t }) {
  if (typeof t !== "function") {
    return { tone: "neutral", headlineKey: null, subKey: null };
  }

  const reason = String(eligibility?.reason || "");
  const eligible = Boolean(eligibility?.eligible);
  const payment = String(subscription?.paymentStatus || "");
  const activation = String(subscription?.activationStatus || "");
  const status = String(subscription?.status || "");
  const freePlan = isOrderzhouseFreePlan(subscription?.planId ?? subscription?.plan);

  if (!subscription) {
    return {
      tone: "warning",
      headlineKey: "freelancerDashboard.statusHeadline.noSubscription.headline",
      subKey: "freelancerDashboard.statusHeadline.noSubscription.sub",
    };
  }

  if (reason === "expired" || status === "expired") {
    return {
      tone: "danger",
      headlineKey: "freelancerDashboard.statusHeadline.expired.headline",
      subKey: "freelancerDashboard.statusHeadline.expired.sub",
    };
  }

  if (payment === "pending" && activation !== "company_approved") {
    return {
      tone: "warning",
      headlineKey: "freelancerDashboard.statusHeadline.paymentPending.headline",
      subKey: "freelancerDashboard.statusHeadline.paymentPending.sub",
    };
  }

  if (activation === "company_pending" || reason === "company_activation_pending") {
    return {
      tone: "warning",
      headlineKey: "freelancerDashboard.statusHeadline.companyPending.headline",
      subKey: "freelancerDashboard.statusHeadline.companyPending.sub",
    };
  }

  const expiryUrgency =
    status === "active" && subscription?.expiryDate ? formatExpiryUrgency(subscription.expiryDate, nowMs, t) : null;
  if (expiryUrgency) {
    return {
      tone: "warning",
      headlineKey: expiryUrgency.headlineKey,
      headlineParams: expiryUrgency.headlineParams,
      subText: expiryUrgency.sub,
    };
  }

  if (eligible && freePlan) {
    return {
      tone: "info",
      headlineKey: "freelancerDashboard.statusHeadline.freePlanExplore.headline",
      subKey: "freelancerDashboard.statusHeadline.freePlanExplore.sub",
    };
  }

  if (eligible && status === "assigned_not_started") {
    return {
      tone: "success",
      headlineKey: "freelancerDashboard.statusHeadline.firstOrder.headline",
      subKey: "freelancerDashboard.statusHeadline.firstOrder.sub",
    };
  }

  if (eligible) {
    return {
      tone: "success",
      headlineKey: "freelancerDashboard.statusHeadline.eligible.headline",
      subKey: "freelancerDashboard.statusHeadline.eligible.sub",
    };
  }

  return {
    tone: "neutral",
    headlineKey: "freelancerDashboard.statusHeadline.notEligible.headline",
    subKey: "freelancerDashboard.statusHeadline.notEligible.sub",
  };
}

export function buildPendingActions({
  subscription,
  eligibility,
  counts = {},
  courses = [],
  claims = [],
  recentOrders = [],
  nowMs = Date.now(),
  t,
  locale = "ar",
}) {
  const actions = [];
  const payment = String(subscription?.paymentStatus || "");
  const activation = String(subscription?.activationStatus || "");
  const status = String(subscription?.status || "");
  const reason = String(eligibility?.reason || "");

  if (!subscription) {
    actions.push({
      id: "no-sub",
      priority: 1,
      icon: "◆",
      to: "/dashboard/freelancer/plans",
    });
  }

  if (payment === "pending" && activation !== "company_approved") {
    actions.push({
      id: "payment-pending",
      priority: 1,
      icon: "◍",
      to: "/dashboard/freelancer/plans",
    });
  }

  if (activation === "company_pending" || reason === "company_activation_pending") {
    actions.push({
      id: "company-pending",
      priority: 2,
      icon: "◎",
      to: "/dashboard/freelancer/settings",
    });
  }

  if (reason === "expired" || status === "expired") {
    actions.push({
      id: "sub-expired",
      priority: 1,
      icon: "⏱",
      to: "/dashboard/freelancer/plans",
    });
  }

  const expiryUrgency =
    status === "active" && subscription?.expiryDate && typeof t === "function"
      ? formatExpiryUrgency(subscription.expiryDate, nowMs, t)
      : null;
  if (expiryUrgency) {
    actions.push({
      id: "sub-expiring",
      priority: 3,
      icon: "⏳",
      titleKey: expiryUrgency.headlineKey,
      i18nParams: expiryUrgency.headlineParams,
      descriptionText: expiryUrgency.sub,
      to: "/dashboard/freelancer/plans",
    });
  }

  const revisionCount = Number(counts.revisionRequired || 0);
  if (revisionCount > 0) {
    const revOrder = recentOrders.find(
      (o) =>
        o?.clientRevisionNote &&
        ["in_progress", "ready_for_work", "pending_client_review"].includes(String(o?.orderStatus || "")),
    );
    actions.push({
      id: "revision",
      priority: 2,
      icon: "✎",
      i18nParams: revOrder
        ? { count: revisionCount, code: revOrder.orderCode || revOrder.id }
        : { count: revisionCount },
      descriptionVariant: revOrder ? "description" : "descriptionGeneric",
      to: revOrder
        ? `/dashboard/freelancer/my-orders/${revOrder.id}`
        : "/dashboard/freelancer/my-orders?status=revision_required",
    });
  }

  const courseAgg = aggregateCourses(courses);
  if (courseAgg.pendingFinalTest > 0) {
    const testCourse = courses.find((c) => isCourseFinalTestPending(c)) || courseAgg.continueCourse;
    const courseName = getLocaleField(testCourse, "title", locale);
    const hasCourseTitle = Boolean(courseName?.trim());
    actions.push({
      id: "final-test",
      priority: 2,
      icon: "▶",
      i18nParams: {
        count: courseAgg.pendingFinalTest,
        ...(hasCourseTitle ? { course: courseName.trim() } : {}),
      },
      to: testCourse ? `/dashboard/freelancer/courses/${testCourse.id}` : "/dashboard/freelancer/courses",
    });
  }

  const openClaimStatuses = ["pending", "requires_in_person_review"];
  const openReview = claims.filter((c) => openClaimStatuses.includes(String(c?.status || "")));
  if (openReview.length > 0) {
    actions.push({
      id: "claims-review",
      priority: 3,
      icon: "◍",
      i18nParams: { count: openReview.length },
      to: "/dashboard/freelancer/financial-claims",
    });
  }

  const acceptedPayout = claims.filter((c) => {
    const st = String(c?.status || "");
    const rem = Number(c?.remainingAmount || 0);
    return st === "accepted" && rem > 0.000001;
  });
  if (acceptedPayout.length > 0) {
    actions.push({
      id: "claims-accepted-payout",
      priority: 3,
      icon: "◍",
      i18nParams: { count: acceptedPayout.length },
      to: "/dashboard/freelancer/financial-claims",
    });
  }

  const priorityRank = { 1: 0, 2: 1, 3: 2 };
  return actions.sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)).slice(0, 5);
}

/** Lightweight courses-focus hints for sidebar + banner — no layout redesign. */
export function deriveFreelancerCoursesFocus(summary) {
  const empty = {
    show: false,
    sidebarBadgeKey: null,
    coursesAgg: null,
  };

  if (!summary) return empty;

  const subscription = summary.subscription;
  const courses = summary.courses?.loadState === "ok" ? summary.courses : null;
  if (!courses) return empty;

  const activation = String(subscription?.activationStatus || "");
  const isCompanyApproved = activation === "company_approved";
  const total = Number(courses.total) || 0;
  const completed = Number(courses.completed) || 0;
  const pendingFinalTest = Number(courses.pendingFinalTest) || 0;

  if (total === 0) return { ...empty, coursesAgg: courses };

  const coursesPathComplete = completed === total && pendingFinalTest === 0;
  const needsCoursesFocus = !isCompanyApproved || !coursesPathComplete;

  if (!needsCoursesFocus) {
    return { ...empty, coursesAgg: courses };
  }

  return {
    show: true,
    sidebarBadgeKey:
      pendingFinalTest > 0
        ? "freelancerDashboard.sidebar.badges.required"
        : "freelancerDashboard.sidebar.badges.startHere",
    coursesAgg: courses,
  };
}

function resolveCourseName(examPendingAction, latestCourse, locale) {
  if (latestCourse) {
    const title = getLocaleField(latestCourse, "title", locale);
    return title ? String(title).trim() : "";
  }
  const fromParams = examPendingAction?.i18nParams?.course;
  if (fromParams && String(fromParams).trim()) return String(fromParams).trim();
  return "";
}

/** Build/enhance the top activation banner action (exam or courses pending). */
export function buildCoursesActivationBannerActions(summary, pendingActions = [], t, locale = "ar") {
  const focus = deriveFreelancerCoursesFocus(summary);
  const courses = focus.coursesAgg;
  const activationActions = [];

  if (focus.show && courses) {
    const pendingFinalTest = Number(courses.pendingFinalTest) || 0;
    const total = Number(courses.total) || 0;
    const completed = Number(courses.completed) || 0;
    const latestCourse = courses.latestInProgressCourse || courses.continueCourse;
    const examPendingAction = pendingActions.find((a) => a.id === "final-test");

    if (pendingFinalTest > 0) {
      const courseName = resolveCourseName(examPendingAction, latestCourse, locale);
      const hasCourseTitle = Boolean(courseName);
      const examUrl =
        examPendingAction?.to ||
        examPendingAction?.actionUrl ||
        (latestCourse?.id ? `/dashboard/freelancer/courses/${latestCourse.id}` : "/dashboard/freelancer/courses");

      activationActions.push({
        id: "final-test",
        isActivationBanner: true,
        i18nParams: {
          count: pendingFinalTest,
          ...(hasCourseTitle ? { course: courseName } : {}),
        },
        descriptionKey: hasCourseTitle
          ? "freelancerDashboard.pendingActions.finalTest.descriptionActivation"
          : "freelancerDashboard.pendingActions.finalTest.descriptionActivationGeneric",
        ctaKey: "freelancerDashboard.pendingActions.finalTest.cta",
        secondaryCtaKey: "freelancerDashboard.pendingActions.finalTest.viewCourse",
        to: examUrl,
        secondaryTo: examUrl,
      });
    } else if (completed < total) {
      const pendingCount = total - completed;
      const continueUrl = latestCourse?.id
        ? `/dashboard/freelancer/courses/${latestCourse.id}`
        : "/dashboard/freelancer/courses";

      activationActions.push({
        id: "courses-pending",
        isActivationBanner: true,
        i18nParams: { count: pendingCount },
        to: continueUrl,
        secondaryTo: "/dashboard/freelancer/courses",
      });
    }
  }

  const rest = pendingActions.filter((a) => a.id !== "final-test" && a.id !== "courses-pending");

  return [...activationActions, ...rest];
}

function insightSortRank(item) {
  if (item?.type === "courses" || item?.id === "final-test" || item?.id === "course-progress") {
    return 0;
  }
  if (item?.id === "company-pending" || item?.id === "pending-company-pending") {
    return 1;
  }
  return 5;
}

export function prioritizeCoursesInsights(insights = [], coursesFocusActive = false, _t) {
  const boosted = insights.map((item) => {
    if (item.id === "final-test") {
      return {
        ...item,
        actionLabelKey:
          item.actionLabelKey || "freelancerDashboard.recommendations.completeTest",
      };
    }
    return item;
  });

  if (!coursesFocusActive) return boosted;

  return [...boosted].sort((a, b) => insightSortRank(a) - insightSortRank(b));
}

export function insightsForWelcomeTip(insights = [], coursesFocusActive = false) {
  if (!coursesFocusActive) return insights;
  return insights.filter(
    (item) =>
      item?.type !== "courses" &&
      item?.id !== "final-test" &&
      item?.id !== "course-progress",
  );
}
