/**
 * Pure dashboard aggregation helpers (no I/O).
 * Mirrors freelancer dashboard UI rules without duplicating subscription/order business rules.
 */

const { ORDERZHOUSE_FREE_PLAN_ID } = require("../constants/orderzhousePlansCatalog");

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function formatTimeRemainingAr(expiryDate, nowMs = Date.now()) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;
  const diffMs = exp.getTime() - nowMs;
  if (diffMs < 0) return { expired: true, days: 0, hours: 0, minutes: 0, text: "الاشتراك منتهي" };

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (hours > 0 || days > 0) parts.push(`${hours} ساعة`);
  if (days === 0 && hours === 0 && minutes > 0) parts.push(`${minutes} دقيقة`);
  return { expired: false, days, hours, minutes, text: `متبقي ${parts.join(" و ")}` };
}

function formatExpiryUrgency(expiryDate, nowMs = Date.now()) {
  const remaining = formatTimeRemainingAr(expiryDate, nowMs);
  if (!remaining || remaining.expired) return null;
  if (remaining.days > 7) return null;

  if (remaining.days >= 2) {
    return { headline: `اشتراكك ينتهي خلال ${remaining.days} يوم`, sub: remaining.text };
  }
  if (remaining.days === 1) {
    return { headline: "اشتراكك ينتهي غداً", sub: remaining.text };
  }
  if (remaining.hours > 0) {
    return { headline: `اشتراكك ينتهي خلال ${remaining.hours} ساعة`, sub: remaining.text };
  }
  return { headline: "اشتراكك ينتهي اليوم", sub: remaining.text };
}

function computeActiveWorkloadCount(counts = {}) {
  return (
    (Number(counts.assigned) || 0) +
    (Number(counts.inProgress) || 0) +
    (Number(counts.waitingClientApproval) || 0)
  );
}

function aggregateFinancialClaims(claims = []) {
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
    paidTotalJod: round2(paidTotalJod),
    pendingTotalJod: round2(pendingTotalJod),
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

function isCourseCompleted(course) {
  if (course?.courseCompletedAt) return true;
  const { pct } = courseProgress(course);
  return !course?.isTestingEnabled && pct >= 100;
}

function isCourseFinalTestPending(course) {
  if (!course?.isTestingEnabled || isCourseCompleted(course)) return false;
  const { completed, total } = courseProgress(course);
  return total > 0 && completed >= total;
}

function mapLatestInProgressCourse(course) {
  if (!course) return null;
  const p = courseProgress(course);
  return {
    id: course.id,
    title: course.title || null,
    progress: {
      completedLessons: p.completed,
      totalLessons: p.total,
      percentage: p.pct,
    },
  };
}

function aggregateCourses(courses = []) {
  let inProgress = 0;
  let completed = 0;
  let pendingFinalTest = 0;
  let continueCourse = null;

  for (const c of courses) {
    if (isCourseCompleted(c)) {
      completed += 1;
      continue;
    }
    const { pct } = courseProgress(c);
    if (pct > 0) {
      inProgress += 1;
      if (!continueCourse) continueCourse = c;
    }
    if (isCourseFinalTestPending(c)) pendingFinalTest += 1;
  }

  const latestInProgressCourse = mapLatestInProgressCourse(
    continueCourse || courses.find((c) => !isCourseCompleted(c)) || null,
  );

  return {
    total: courses.length,
    inProgress,
    completed,
    pendingFinalTest,
    latestInProgressCourse,
    continueCourse: latestInProgressCourse,
  };
}

function getEligibilityMessageAr(eligibility, subscription = null) {
  const reason = String(eligibility?.reason || "");
  const activationStatus = String(subscription?.activationStatus || "");
  const paymentStatus = String(subscription?.paymentStatus || "");
  const isCompanyPending =
    activationStatus === "company_pending" &&
    (paymentStatus === "paid" ||
      paymentStatus === "pending" ||
      paymentStatus === "not_required" ||
      paymentStatus === "");

  if (isCompanyPending || reason === "company_activation_pending") {
    return "بانتظار موافقة الإدارة قبل بدء استلام الطلبات";
  }
  if (reason === "no_subscription") {
    return "لا يمكنك استلام الطلبات حالياً لأنك غير مشترك. يرجى الاشتراك أولاً.";
  }
  if (reason === "status_inactive" || reason === "status_cancelled") {
    return "اشتراكك غير نشط حالياً. يرجى الاشتراك أولاً.";
  }
  if (reason === "payment_not_completed") {
    return "تعذر تفعيل استلام الطلبات لأن حالة الدفع للاشتراك غير مكتملة.";
  }
  if (reason === "expired") {
    return "اشتراكك منتهي. يرجى تجديد الاشتراك لاستلام الطلبات.";
  }
  if (eligibility?.eligible) {
    return null;
  }
  return "حسابك غير مؤهل حالياً لاستلام طلبات من المعرض (تحقق من الاشتراك).";
}

function isFreePlan(planId) {
  return Number(planId) === ORDERZHOUSE_FREE_PLAN_ID;
}

function buildPendingActions({
  subscription,
  eligibility,
  counts = {},
  courses = [],
  claims = [],
  recentOrders = [],
  nowMs = Date.now(),
}) {
  const actions = [];
  const payment = String(subscription?.paymentStatus || "");
  const activation = String(subscription?.activationStatus || "");
  const status = String(subscription?.status || "");
  const reason = String(eligibility?.reason || "");

  const push = (item) => {
    actions.push({
      id: item.id,
      type: item.type || item.id,
      priority: item.priority,
      icon: item.icon,
      titleAr: item.titleAr,
      descriptionAr: item.descriptionAr,
      actionLabel: item.actionLabel,
      actionUrl: item.actionUrl,
      title: item.titleAr,
      description: item.descriptionAr,
      to: item.actionUrl,
      cta: item.actionLabel,
    });
  };

  if (!subscription) {
    push({
      id: "no-sub",
      type: "no_subscription",
      priority: 1,
      icon: "◆",
      titleAr: "اختر باقة اشتراك",
      descriptionAr: "لا يوجد اشتراك نشط — ابدأ باختيار الباقة المناسبة.",
      actionUrl: "/plans",
      actionLabel: "عرض الباقات",
    });
  }

  if (payment === "pending" && activation !== "company_approved") {
    push({
      id: "payment-pending",
      type: "payment_pending",
      priority: 1,
      icon: "◍",
      titleAr: "إكمال الدفع",
      descriptionAr: "الدفع قيد المعالجة أو لم يُستكمل بعد.",
      actionUrl: "/plans",
      actionLabel: "إكمال الدفع",
    });
  }

  if (activation === "company_pending" || reason === "company_activation_pending") {
    push({
      id: "company-pending",
      type: "company_activation_pending",
      priority: 2,
      icon: "◎",
      titleAr: "موافقة الإدارة",
      descriptionAr: "بانتظار موافقة الإدارة قبل بدء استلام الطلبات.",
      actionUrl: "/dashboard/freelancer/settings",
      actionLabel: "مراجعة الحساب",
    });
  }

  if (reason === "expired" || status === "expired") {
    push({
      id: "sub-expired",
      type: "subscription_expired",
      priority: 1,
      icon: "⏱",
      titleAr: "تجديد الاشتراك",
      descriptionAr: "انتهت صلاحية اشتراكك — جدّد للعودة للمعرض.",
      actionUrl: "/plans",
      actionLabel: "تجديد",
    });
  }

  const expiryUrgency =
    status === "active" && subscription?.expiryDate
      ? formatExpiryUrgency(subscription.expiryDate, nowMs)
      : null;
  if (expiryUrgency) {
    push({
      id: "sub-expiring",
      type: "subscription_expiring",
      priority: 3,
      icon: "⏳",
      titleAr: expiryUrgency.headline,
      descriptionAr: expiryUrgency.sub,
      actionUrl: "/plans",
      actionLabel: "مراجعة الباقات",
    });
  }

  const revisionCount = Number(counts.revisionRequired || 0);
  if (revisionCount > 0) {
    const revOrder = recentOrders.find(
      (o) =>
        o?.clientRevisionNote &&
        ["in_progress", "ready_for_work", "pending_client_review"].includes(String(o?.orderStatus || "")),
    );
    push({
      id: "revision",
      type: "revision_required",
      priority: 2,
      icon: "✎",
      titleAr: `تعديلات مطلوبة (${revisionCount})`,
      descriptionAr: revOrder
        ? `طلب #${revOrder.orderCode || revOrder.id} يحتاج مراجعة وتسليماً محدثاً.`
        : "لديك طلبات تحتاج تعديلاً — راجعها في طلباتي.",
      actionUrl: revOrder
        ? `/dashboard/freelancer/my-orders/${revOrder.id}`
        : "/dashboard/freelancer/my-orders?status=revision_required",
      actionLabel: "متابعة التعديل",
    });
  }

  const courseAgg = aggregateCourses(courses);
  if (courseAgg.pendingFinalTest > 0) {
    const testCourse =
      courses.find((c) => isCourseFinalTestPending(c)) || courses.find((c) => !isCourseCompleted(c));
    const courseId = testCourse?.id;
    push({
      id: "final-test",
      type: "final_test_pending",
      priority: 2,
      icon: "▶",
      titleAr: `اختبار نهائي بانتظارك (${courseAgg.pendingFinalTest})`,
      descriptionAr: testCourse
        ? `أكمل الاختبار النهائي لدورة «${testCourse.title || "الدورة"}».`
        : "أكمل الاختبار النهائي لإنهاء الدورة.",
      actionUrl: courseId ? `/dashboard/freelancer/courses/${courseId}` : "/dashboard/freelancer/courses",
      actionLabel: "إكمال الاختبار",
    });
  }

  const openClaimStatuses = ["pending", "requires_in_person_review"];
  const openReview = claims.filter((c) => openClaimStatuses.includes(String(c?.status || "")));
  if (openReview.length > 0) {
    push({
      id: "claims-review",
      type: "claims_under_review",
      priority: 3,
      icon: "◍",
      titleAr: `مطالبات قيد المراجعة (${openReview.length})`,
      descriptionAr: "مطالباتك المالية بانتظار موافقة الإدارة.",
      actionUrl: "/dashboard/freelancer/financial-claims",
      actionLabel: "عرض المحفظة",
    });
  }

  const acceptedPayout = claims.filter((c) => {
    const st = String(c?.status || "");
    const rem = Number(c?.remainingAmount || 0);
    return st === "accepted" && rem > 0.000001;
  });
  if (acceptedPayout.length > 0) {
    push({
      id: "claims-accepted-payout",
      type: "claims_accepted_payout",
      priority: 3,
      icon: "◍",
      titleAr: `مطالبات مقبولة بانتظار الصرف (${acceptedPayout.length})`,
      descriptionAr: "مبالغ مقبولة ولم تُصرف بالكامل بعد — راجع المحفظة.",
      actionUrl: "/dashboard/freelancer/financial-claims",
      actionLabel: "عرض المحفظة",
    });
  }

  const priorityRank = { 1: 0, 2: 1, 3: 2 };
  return actions.sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)).slice(0, 5);
}

function computeRemainingDays(expiryDate, nowMs = Date.now()) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - nowMs) / 86400000);
}

module.exports = {
  aggregateFinancialClaims,
  aggregateCourses,
  buildPendingActions,
  computeActiveWorkloadCount,
  computeRemainingDays,
  formatExpiryUrgency,
  getEligibilityMessageAr,
  isFreePlan,
};
