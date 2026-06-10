/**
 * Profile completion, trust score, insights, achievements — pure logic + light composition.
 */

const { formatExpiryUrgency } = require("./freelancerDashboardAggregates");

const PROFILE_ITEMS = [
  { key: "avatar", weight: 12, labelAr: "صورة شخصية", settingsPath: "/dashboard/freelancer/settings" },
  { key: "bio", weight: 12, labelAr: "نبذة تعريفية", settingsPath: "/dashboard/freelancer/settings" },
  { key: "professionalTitle", weight: 10, labelAr: "المسمى المهني", settingsPath: "/dashboard/freelancer/settings" },
  { key: "skills", weight: 12, labelAr: "المهارات", settingsPath: "/dashboard/freelancer/settings" },
  { key: "portfolio", weight: 14, labelAr: "معرض الأعمال / روابط", settingsPath: "/dashboard/freelancer/settings" },
  { key: "phone", weight: 10, labelAr: "رقم الهاتف", settingsPath: "/dashboard/freelancer/settings" },
  { key: "completedCourse", weight: 10, labelAr: "إنهاء دورة تدريبية", settingsPath: "/dashboard/freelancer/courses" },
  { key: "completedOrder", weight: 12, labelAr: "إكمال طلب واحد على الأقل", settingsPath: "/dashboard/freelancer/my-orders" },
  { key: "payoutInfo", weight: 8, labelAr: "بيانات السحب / الفوترة", settingsPath: "/dashboard/freelancer/settings" },
];

function hasText(v) {
  return Boolean(String(v || "").trim());
}

function hasSkills(skills) {
  if (Array.isArray(skills)) return skills.filter((s) => hasText(s)).length > 0;
  if (skills && typeof skills === "object") return Object.keys(skills).length > 0;
  return hasText(skills);
}

function hasPortfolio(userRow) {
  return (
    hasText(userRow?.portfolio_url) ||
    hasText(userRow?.behance_url) ||
    hasText(userRow?.website_url) ||
    hasText(userRow?.github_url)
  );
}

function evaluateProfileItem(key, ctx) {
  const { userRow, coursesCompleted, ordersCompleted } = ctx;
  switch (key) {
    case "avatar":
      return hasText(userRow?.avatar_url);
    case "bio":
      return hasText(userRow?.bio);
    case "professionalTitle":
      return hasText(userRow?.professional_title);
    case "skills":
      return hasSkills(userRow?.skills);
    case "portfolio":
      return hasPortfolio(userRow);
    case "phone":
      return hasText(userRow?.phone) || hasText(userRow?.whatsapp);
    case "completedCourse":
      return coursesCompleted > 0;
    case "completedOrder":
      return ordersCompleted > 0;
    case "payoutInfo":
      return (
        hasText(userRow?.preferred_withdrawal_method) ||
        hasText(userRow?.billing_name) ||
        hasText(userRow?.billing_country)
      );
    default:
      return false;
  }
}

function computeProfileCompletion(userRow, { coursesCompleted = 0, ordersCompleted = 0 } = {}) {
  const ctx = { userRow, coursesCompleted, ordersCompleted };
  let earned = 0;
  const items = [];
  const missing = [];

  for (const def of PROFILE_ITEMS) {
    const done = evaluateProfileItem(def.key, ctx);
    if (done) earned += def.weight;
    else {
      missing.push({
        key: def.key,
        labelAr: def.labelAr,
        actionUrl: def.settingsPath,
        suggestionAr: `أكمل: ${def.labelAr}`,
      });
    }
    items.push({ key: def.key, labelAr: def.labelAr, completed: done, weight: def.weight });
  }

  const percentage = Math.min(100, Math.round(earned));
  const suggestions = missing.slice(0, 4).map((m) => m.suggestionAr);

  return {
    percentage,
    items,
    missing,
    suggestions,
  };
}

const TRUST_LEVELS = [
  { min: 80, level: "expert", labelAr: "خبير" },
  { min: 60, level: "trusted", labelAr: "موثوق" },
  { min: 40, level: "professional", labelAr: "محترف" },
  { min: 20, level: "active", labelAr: "نشط" },
  { min: 0, level: "beginner", labelAr: "مبتدئ" },
];

function resolveTrustLevel(score) {
  const s = Number(score) || 0;
  for (const t of TRUST_LEVELS) {
    if (s >= t.min) return { trustLevel: t.level, trustLevelAr: t.labelAr };
  }
  return { trustLevel: "beginner", trustLevelAr: "مبتدئ" };
}

/**
 * Lightweight trust score (0–100) from real signals only.
 */
function computeReputation({
  performance = {},
  profileCompletion = {},
  eligibility = {},
  subscription = {},
  coursesSummary = {},
  earningsSummary = {},
  reviewsSummary = {},
  userRow = {},
}) {
  const factors = [];
  let score = 0;

  const completed = Number(performance.completedOrders || 0);
  const orderPts = Math.min(25, completed * 2.5);
  if (completed > 0) {
    score += orderPts;
    factors.push({ key: "completed_orders", labelAr: `${completed} طلباً مكتملاً`, impact: Math.round(orderPts) });
  }

  const completionRate = performance.completionRate;
  if (completionRate != null && performance.hasOrderHistory) {
    let crPts = 0;
    if (completionRate >= 95) crPts = 15;
    else if (completionRate >= 85) crPts = 10;
    else if (completionRate >= 70) crPts = 5;
    if (crPts > 0) {
      score += crPts;
      factors.push({
        key: "completion_rate",
        labelAr: `معدل إكمال ${completionRate}%`,
        impact: crPts,
      });
    }
  }

  if (eligibility?.eligible) {
    score += 10;
    factors.push({ key: "active_subscription", labelAr: "اشتراك نشط ومؤهل", impact: 10 });
  }

  const coursesDone = Number(coursesSummary.completed || 0);
  const coursePts = Math.min(10, coursesDone * 5);
  if (coursePts > 0) {
    score += coursePts;
    factors.push({ key: "courses", labelAr: `${coursesDone} دورة مكتملة`, impact: coursePts });
  }

  const profilePct = Number(profileCompletion.percentage || 0);
  const profilePts = Math.round((profilePct / 100) * 20);
  if (profilePts > 0) {
    score += profilePts;
    factors.push({ key: "profile", labelAr: `اكتمال الملف ${profilePct}%`, impact: profilePts });
  }

  if (userRow?.email_verified !== false) {
    score += 5;
    factors.push({ key: "email", labelAr: "البريد مؤكّد", impact: 5 });
  }

  const onTime = performance.onTimeDeliveryPercent;
  if (onTime != null && performance.completedWithDeadline >= 3) {
    let otPts = 0;
    if (onTime >= 90) otPts = 10;
    else if (onTime >= 75) otPts = 6;
    else if (onTime >= 60) otPts = 3;
    if (otPts > 0) {
      score += otPts;
      factors.push({ key: "on_time", labelAr: `التسليم في الموعد ${onTime}%`, impact: otPts });
    }
  }

  const paid = Number(earningsSummary?.paidTotalJod || 0);
  if (paid > 0) {
    const earnPts = Math.min(5, Math.floor(paid / 100));
    if (earnPts > 0) {
      score += earnPts;
      factors.push({ key: "earnings", labelAr: "مستحقات مدفوعة موثّقة", impact: earnPts });
    }
  }

  const reviewTotal = Number(reviewsSummary?.totalReviews || 0);
  const avgRating = reviewsSummary?.averageRating != null ? Number(reviewsSummary.averageRating) : null;
  if (reviewTotal > 0 && avgRating != null) {
    let reviewPts = 0;
    if (avgRating >= 4.8 && reviewTotal >= 5) reviewPts = 12;
    else if (avgRating >= 4.5 && reviewTotal >= 3) reviewPts = 10;
    else if (avgRating >= 4.0 && reviewTotal >= 2) reviewPts = 7;
    else if (reviewTotal >= 1) reviewPts = 4;

    const rec = reviewsSummary.recommendationRate;
    if (rec != null && rec >= 90 && reviewTotal >= 2) {
      reviewPts = Math.min(12, reviewPts + 2);
    }

    if (reviewPts > 0) {
      score += reviewPts;
      factors.push({
        key: "client_reviews",
        labelAr: `متوسط ${avgRating} من ${reviewTotal} تقييم`,
        impact: reviewPts,
      });
    }
  }

  score = Math.min(100, Math.round(score));
  const { trustLevel, trustLevelAr } = resolveTrustLevel(score);

  return {
    trustScore: score,
    trustLevel,
    trustLevelAr,
    factors: factors.sort((a, b) => b.impact - a.impact).slice(0, 6),
    ratingsAvailable: reviewTotal > 0,
  };
}

function buildReviewsSummary(reviewsSummary = {}) {
  if (!reviewsSummary || reviewsSummary.available === false) {
    return {
      available: false,
      averageRating: null,
      totalReviews: 0,
      recommendationRate: null,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      latestReviews: [],
      analytics: null,
      messageAr: reviewsSummary?.messageAr || "لا توجد تقييمات بعد.",
    };
  }
  const total = Number(reviewsSummary.totalReviews || 0);
  return {
    available: true,
    averageRating: reviewsSummary.averageRating,
    totalReviews: total,
    recommendationRate: reviewsSummary.recommendationRate,
    ratingDistribution: reviewsSummary.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    latestReviews: reviewsSummary.latestReviews || [],
    analytics: reviewsSummary.analytics || null,
    messageAr: total === 0 ? "لا توجد تقييمات بعد — ستظهر هنا بعد إكمال العملاء لتقييم مشاريعهم." : null,
  };
}

function buildAchievements(ctx) {
  const {
    performance = {},
    coursesSummary = {},
    profileCompletion = {},
    reputation = {},
    reviewsSummary = {},
  } = ctx;
  const list = [];
  const completed = Number(performance.completedOrders || 0);
  const onTime = performance.onTimeDeliveryPercent;

  if (completed >= 1) {
    list.push({
      id: "first_order",
      titleAr: "أول طلب مكتمل",
      descriptionAr: "أنهيت أول مشروع على المنصة.",
      achievedAt: null,
      achieved: true,
    });
  }
  if (completed >= 10) {
    list.push({
      id: "ten_orders",
      titleAr: "10 طلبات مكتملة",
      descriptionAr: "سجل إنجاز قوي في تنفيذ المشاريع.",
      achieved: true,
    });
  }
  if (Number(coursesSummary.completed || 0) >= 1) {
    list.push({
      id: "first_course",
      titleAr: "إنهاء أول دورة",
      descriptionAr: "أكملت دورة تدريبية على المنصة.",
      achieved: true,
    });
  }
  if (profileCompletion.percentage >= 100) {
    list.push({
      id: "profile_complete",
      titleAr: "ملف شخصي مكتمل",
      descriptionAr: "ملفك جاهز للعملاء والمعرض.",
      achieved: true,
    });
  }
  if (onTime != null && onTime >= 90 && performance.onTimeDeliveries >= 5) {
    list.push({
      id: "on_time_five",
      titleAr: "تسليم في الموعد",
      descriptionAr: "5 طلبات أو أكثر سُلِّمت ضمن الموعد.",
      achieved: true,
    });
  }
  if (reputation.trustScore >= 60) {
    list.push({
      id: "trusted",
      titleAr: "مستوى موثوق",
      descriptionAr: "بلغت مستوى الثقة «موثوق» أو أعلى.",
      achieved: true,
    });
  }

  if (completed > 0 && completed < 10 && !list.some((a) => a.id === "ten_orders")) {
    list.push({
      id: "ten_orders_next",
      titleAr: "10 طلبات مكتملة",
      descriptionAr: `${10 - completed} طلبات متبقية للوصول لهذا الإنجاز.`,
      achieved: false,
      progress: completed,
      target: 10,
    });
  }

  const dist = reviewsSummary?.ratingDistribution || {};
  const hasFiveStar = Number(dist[5] || 0) >= 1;
  if (hasFiveStar) {
    list.push({
      id: "first_rating",
      titleAr: "أول تقييم 5 نجوم",
      descriptionAr: "حصلت على تقييم كامل من عميل.",
      achieved: true,
    });
  } else if (Number(reviewsSummary?.totalReviews || 0) === 0) {
    list.push({
      id: "first_rating_next",
      titleAr: "أول تقييم 5 نجوم",
      descriptionAr: "أكمل مشاريعك بجودة عالية لتحصل على تقييم مميز.",
      achieved: false,
    });
  }

  return list.slice(0, 6);
}

function buildSmartInsights(ctx) {
  const {
    profileCompletion = {},
    performance = {},
    coursesSummary = {},
    subscription = {},
    eligibility = {},
    counts = {},
    earningsSummary = {},
    pendingActions = [],
    reviewsSummary = {},
    nowMs = Date.now(),
  } = ctx;

  const insights = [];
  const push = (item) => insights.push(item);

  if (profileCompletion.percentage < 80 && profileCompletion.missing?.length) {
    push({
      id: "profile-incomplete",
      priority: 1,
      type: "profile",
      titleAr: "أكمل ملفك الشخصي",
      descriptionAr: `اكتمالك ${profileCompletion.percentage}% — الملفات المكتملة تزيد فرص قبولك.`,
      actionLabel: "تحديث الملف",
      actionUrl: "/dashboard/freelancer/settings",
    });
  }

  const revision = Number(counts.revisionRequired || 0);
  if (revision > 0) {
    push({
      id: "revisions-pending",
      priority: 1,
      type: "orders",
      titleAr: "طلبات تحتاج مراجعة",
      descriptionAr: `لديك ${revision} طلباً يحتاج تعديلاً أو تسليماً محدثاً.`,
      actionLabel: "عرض التعديلات",
      actionUrl: "/dashboard/freelancer/my-orders?status=revision_required",
    });
  }

  const course = coursesSummary.latestInProgressCourse || coursesSummary.continueCourse;
  if (course?.progress?.percentage != null && course.progress.percentage >= 50 && course.progress.percentage < 100) {
    push({
      id: "course-progress",
      priority: 2,
      type: "courses",
      titleAr: "أنت قريب من إنهاء الدورة",
      descriptionAr: `أكملت ${course.progress.percentage}% من «${course.title || "دورتك"}».`,
      actionLabel: "متابعة الدورة",
      actionUrl: course.id ? `/dashboard/freelancer/courses/${course.id}` : "/dashboard/freelancer/courses",
    });
  }

  if (coursesSummary.pendingFinalTest > 0) {
    push({
      id: "final-test",
      priority: 2,
      type: "courses",
      titleAr: "اختبار نهائي بانتظارك",
      descriptionAr: `${coursesSummary.pendingFinalTest} دورة بانتظار الاختبار النهائي.`,
      actionLabel: "إكمال الاختبار",
      actionUrl: "/dashboard/freelancer/courses",
    });
  }

  const onTime = performance.onTimeDeliveryPercent;
  if (onTime != null && onTime >= 85 && performance.completedWithDeadline >= 3) {
    push({
      id: "delivery-excellent",
      priority: 3,
      type: "performance",
      titleAr: "معدّل التسليم لديك ممتاز",
      descriptionAr: `${onTime}% من طلباتك المكتملة سُلِّمت في الموعد.`,
      actionLabel: null,
      actionUrl: null,
    });
  }

  const expiry = subscription?.expiryDate
    ? formatExpiryUrgency(subscription.expiryDate, nowMs)
    : null;
  if (expiry) {
    push({
      id: "sub-expiring",
      priority: 1,
      type: "subscription",
      titleAr: expiry.headline,
      descriptionAr: expiry.sub,
      actionLabel: "مراجعة الباقات",
      actionUrl: "/dashboard/freelancer/plans",
    });
  }

  if (!hasPortfolio(ctx.userRow) && profileCompletion.percentage >= 40) {
    push({
      id: "add-portfolio",
      priority: 3,
      type: "profile",
      titleAr: "أضف أعمالاً إلى معرضك",
      descriptionAr: "اربط معرض Behance أو موقعك لبناء ثقة العملاء.",
      actionLabel: "تحديث الروابط",
      actionUrl: "/dashboard/freelancer/settings",
    });
  }

  if (performance.completedOrders === 0 && eligibility?.eligible) {
    push({
      id: "start-first-order",
      priority: 2,
      type: "growth",
      titleAr: "ابدأ أول مشروع",
      descriptionAr: "تصفح الطلبات المتاحة وابنِ سجلّك على المنصة.",
      actionLabel: "الطلبات المتاحة",
      actionUrl: "/dashboard/freelancer/orders",
    });
  }

  const reviewInsights = reviewsSummary?.analytics?.insights;
  if (Array.isArray(reviewInsights)) {
    for (const line of reviewInsights.slice(0, 2)) {
      push({
        id: `review-analytics-${line.slice(0, 12)}`,
        priority: 3,
        type: "reviews",
        titleAr: line,
        descriptionAr: "بناءً على تقييمات عملائك الموثّقة.",
        actionLabel: "عرض التقييمات",
        actionUrl: "/dashboard/freelancer/profile",
      });
    }
  }

  if (reviewsSummary?.totalReviews >= 1 && reviewsSummary?.averageRating >= 4.5) {
    push({
      id: "reviews-strong",
      priority: 3,
      type: "reviews",
      titleAr: "تقييماتك ممتازة",
      descriptionAr: `متوسط ${reviewsSummary.averageRating} من ${reviewsSummary.totalReviews} تقييم.`,
      actionLabel: "عرض التفاصيل",
      actionUrl: "/dashboard/freelancer/profile",
    });
  }

  const paid = Number(earningsSummary?.paidTotalJod || 0);
  if (paid === 0 && performance.completedOrders > 0) {
    push({
      id: "claims-hint",
      priority: 3,
      type: "earnings",
      titleAr: "تذكير: المستحقات عبر المحفظة",
      descriptionAr: "بعد إتمام المشاريع، قدّم مطالباتك المالية من قسم المحفظة.",
      actionLabel: "المحفظة",
      actionUrl: "/dashboard/freelancer/financial-claims",
    });
  }

  for (const pa of pendingActions.slice(0, 2)) {
    if (insights.some((i) => i.id === pa.id)) continue;
    if (pa.priority > 2) continue;
    push({
      id: `pending-${pa.id}`,
      priority: pa.priority,
      type: "action",
      titleAr: pa.titleAr || pa.title,
      descriptionAr: pa.descriptionAr || pa.description,
      actionLabel: pa.actionLabel || pa.cta,
      actionUrl: pa.actionUrl || pa.to,
    });
  }

  const priorityRank = { 1: 0, 2: 1, 3: 2 };
  return insights
    .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9))
    .slice(0, 5);
}

function buildGrowthBundle(ctx) {
  const profileCompletion = computeProfileCompletion(ctx.userRow, {
    coursesCompleted: Number(ctx.coursesSummary?.completed || 0),
    ordersCompleted: Number(ctx.performance?.completedOrders || 0),
  });

  const reviews = buildReviewsSummary(ctx.reviewsSummary);

  const reputation = computeReputation({
    ...ctx,
    profileCompletion,
    reviewsSummary: reviews,
  });

  const achievements = buildAchievements({ ...ctx, profileCompletion, reputation, reviewsSummary: reviews });
  const insights = buildSmartInsights({ ...ctx, profileCompletion, reviewsSummary: reviews });

  const performanceWithEarnings = {
    ...ctx.performance,
    totalEarnedJod: ctx.earningsSummary?.paidTotalJod ?? null,
    openClaimsCount: ctx.earningsSummary?.openClaimsCount ?? null,
    pendingEarnedJod: ctx.earningsSummary?.pendingTotalJod ?? null,
    clientSatisfactionAvailable: reviews.totalReviews > 0,
    averageClientRating: reviews.averageRating,
    workingHoursAvailable: false,
  };

  return {
    performance: performanceWithEarnings,
    profileCompletion,
    reputation,
    reviews,
    insights,
    achievements,
  };
}

module.exports = {
  computeProfileCompletion,
  computeReputation,
  buildReviewsSummary,
  buildAchievements,
  buildSmartInsights,
  buildGrowthBundle,
  PROFILE_ITEMS,
};
