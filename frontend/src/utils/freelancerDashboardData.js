import {
  isOrderzhouseFreePlan,
  ORDERZHOUSE_PLANS_BY_ID,
} from "../constants/orderzhousePlansCatalog";

export function formatMoneyJod(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export function formatJoDateMedium(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

export function formatTimeRemainingAr(expiryDate, nowMs = Date.now()) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;
  const diffMs = exp.getTime() - nowMs;
  if (diffMs < 0) return { expired: true, days: 0, hours: 0, minutes: 0, text: "الاشتراك منتهي" };

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const nf = new Intl.NumberFormat("en-US");
  const parts = [];
  if (days > 0) parts.push(`${nf.format(days)} يوم`);
  if (hours > 0 || days > 0) parts.push(`${nf.format(hours)} ساعة`);
  if (days === 0 && hours === 0 && minutes > 0) parts.push(`${nf.format(minutes)} دقيقة`);
  return { expired: false, days, hours, minutes, text: `متبقي ${parts.join(" و ")}` };
}

/** Human headline for subscription expiring within 7 days. */
export function formatExpiryUrgency(expiryDate, nowMs = Date.now()) {
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

export function getPlanOrderValueRangeLabel(subscription) {
  const planId = Number(subscription?.planId ?? subscription?.plan?.id);
  const catalog = ORDERZHOUSE_PLANS_BY_ID[planId];
  if (!catalog) return null;
  if (isOrderzhouseFreePlan(planId)) {
    return "تدريبية: 3–7 د.أ (الطلبات الحقيقية تتطلب ترقية)";
  }
  const min = catalog.minOrderValue ?? catalog.orderValueMinJod;
  const max = catalog.maxOrderValue ?? catalog.orderValueMaxJod;
  if (min != null && max != null) return `من ${min} إلى ${max} د.أ`;
  if (min != null) return `من ${min} د.أ وأكثر`;
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
    total: courses.length,
    inProgress,
    notStarted,
    completed,
    pendingFinalTest,
    continueCourse: continueCourse || courses.find((c) => !isCourseCompleted(c)) || null,
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

export function buildFreelancerStatusHeadline({ eligibility, subscription, nowMs = Date.now() }) {
  const reason = String(eligibility?.reason || "");
  const eligible = Boolean(eligibility?.eligible);
  const payment = String(subscription?.paymentStatus || "");
  const activation = String(subscription?.activationStatus || "");
  const status = String(subscription?.status || "");
  const freePlan = isOrderzhouseFreePlan(subscription?.planId ?? subscription?.plan);

  if (!subscription) {
    return { tone: "warning", headline: "لم يُفعَّل اشتراكك بعد", sub: "اختر باقة للبدء على المنصة." };
  }

  if (reason === "expired" || status === "expired") {
    return { tone: "danger", headline: "اشتراكك منتهي", sub: "جدّد الاشتراك لاستقبال طلبات جديدة." };
  }

  if (payment === "pending" && activation !== "company_approved") {
    return { tone: "warning", headline: "أكمل الدفع لتفعيل الحساب", sub: "لا يمكن استقبال طلبات من المعرض قبل إتمام الدفع." };
  }

  if (activation === "company_pending" || reason === "company_activation_pending") {
    return {
      tone: "warning",
      headline: "الاشتراك بانتظار تفعيل الشركة",
      sub: "تم استلام الدفع أو طلبك قيد المراجعة — أكمل زيارة الشركة عند الحاجة.",
    };
  }

  const expiryUrgency =
    status === "active" && subscription?.expiryDate
      ? formatExpiryUrgency(subscription.expiryDate, nowMs)
      : null;
  if (expiryUrgency) {
    return { tone: "warning", headline: expiryUrgency.headline, sub: expiryUrgency.sub };
  }

  if (eligible && freePlan) {
    return {
      tone: "info",
      headline: "يمكنك استكشاف الطلبات المتاحة في المعرض",
      sub: "الطلبات الحقيقية في المعرض تتطلب ترقية الاشتراك.",
    };
  }

  if (eligible && status === "assigned_not_started") {
    return {
      tone: "success",
      headline: "يمكنك استقبال أول طلب",
      sub: "يبدأ عدّ مدة الاشتراك عند قبول أول طلب.",
    };
  }

  if (eligible) {
    return {
      tone: "success",
      headline: "يمكنك استقبال الطلبات",
      sub: "حسابك مؤهل للتقديم على الطلبات المتاحة وفق باقتك.",
    };
  }

  return {
    tone: "neutral",
    headline: "لا يمكنك استقبال طلبات حالياً",
    sub: "راجع تفاصيل الاشتراك أدناه.",
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
      title: "اختر باقة اشتراك",
      description: "لا يوجد اشتراك نشط — ابدأ باختيار الباقة المناسبة.",
      to: "/plans",
      cta: "عرض الباقات",
    });
  }

  if (payment === "pending" && activation !== "company_approved") {
    actions.push({
      id: "payment-pending",
      priority: 1,
      icon: "◍",
      title: "إكمال الدفع",
      description: "الدفع قيد المعالجة أو لم يُستكمل بعد.",
      to: "/plans",
      cta: "إكمال الدفع",
    });
  }

  if (activation === "company_pending" || reason === "company_activation_pending") {
    actions.push({
      id: "company-pending",
      priority: 2,
      icon: "◎",
      title: "تفعيل الشركة",
      description: "حسابك بانتظار تفعيل الشركة بعد الدفع أو الزيارة.",
      to: "/dashboard/freelancer/settings",
      cta: "مراجعة الحساب",
    });
  }

  if (reason === "expired" || status === "expired") {
    actions.push({
      id: "sub-expired",
      priority: 1,
      icon: "⏱",
      title: "تجديد الاشتراك",
      description: "انتهت صلاحية اشتراكك — جدّد للعودة للمعرض.",
      to: "/plans",
      cta: "تجديد",
    });
  }

  const expiryUrgency =
    status === "active" && subscription?.expiryDate
      ? formatExpiryUrgency(subscription.expiryDate, nowMs)
      : null;
  if (expiryUrgency) {
    actions.push({
      id: "sub-expiring",
      priority: 3,
      icon: "⏳",
      title: expiryUrgency.headline,
      description: expiryUrgency.sub,
      to: "/plans",
      cta: "مراجعة الباقات",
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
      title: `تعديلات مطلوبة (${revisionCount})`,
      description: revOrder
        ? `طلب #${revOrder.orderCode || revOrder.id} يحتاج مراجعة وتسليماً محدثاً.`
        : "لديك طلبات تحتاج تعديلاً — راجعها في طلباتي.",
      to: revOrder
        ? `/dashboard/freelancer/my-orders/${revOrder.id}`
        : "/dashboard/freelancer/my-orders?status=revision_required",
      cta: "متابعة التعديل",
    });
  }

  const courseAgg = aggregateCourses(courses);
  if (courseAgg.pendingFinalTest > 0) {
    const testCourse =
      courses.find((c) => isCourseFinalTestPending(c)) || courseAgg.continueCourse;
    actions.push({
      id: "final-test",
      priority: 2,
      icon: "▶",
      title: `اختبار نهائي بانتظارك (${courseAgg.pendingFinalTest})`,
      description: testCourse
        ? `أكمل الاختبار النهائي لدورة «${testCourse.title || "الدورة"}».`
        : "أكمل الاختبار النهائي لإنهاء الدورة.",
      to: testCourse ? `/dashboard/freelancer/courses/${testCourse.id}` : "/dashboard/freelancer/courses",
      cta: "إكمال الاختبار",
    });
  }

  const openClaimStatuses = ["pending", "requires_in_person_review"];
  const openReview = claims.filter((c) => openClaimStatuses.includes(String(c?.status || "")));
  if (openReview.length > 0) {
    actions.push({
      id: "claims-review",
      priority: 3,
      icon: "◍",
      title: `مطالبات قيد المراجعة (${openReview.length})`,
      description: "مطالباتك المالية بانتظار موافقة الإدارة.",
      to: "/dashboard/freelancer/financial-claims",
      cta: "عرض المحفظة",
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
      title: `مطالبات مقبولة بانتظار الصرف (${acceptedPayout.length})`,
      description: "مبالغ مقبولة ولم تُصرف بالكامل بعد — راجع المحفظة.",
      to: "/dashboard/freelancer/financial-claims",
      cta: "عرض المحفظة",
    });
  }

  const priorityRank = { 1: 0, 2: 1, 3: 2 };
  return actions.sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9)).slice(0, 5);
}
