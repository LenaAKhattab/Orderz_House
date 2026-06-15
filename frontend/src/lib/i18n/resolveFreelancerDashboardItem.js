import { getLocaleField } from "./getLocalizedField";

/** Known pending-action ids → i18n key roots. */
const ACTION_I18N = {
  "no-sub": {
    title: "freelancerDashboard.pendingActions.choosePlan.title",
    description: "freelancerDashboard.pendingActions.choosePlan.description",
    cta: "freelancerDashboard.pendingActions.choosePlan.cta",
    actionLabel: "freelancerDashboard.pendingActions.choosePlan.cta",
  },
  "payment-pending": {
    title: "freelancerDashboard.pendingActions.completePayment.title",
    description: "freelancerDashboard.pendingActions.completePayment.description",
    cta: "freelancerDashboard.pendingActions.completePayment.cta",
    actionLabel: "freelancerDashboard.pendingActions.completePayment.cta",
  },
  "company-pending": {
    title: "freelancerDashboard.pendingActions.companyApproval.title",
    description: "freelancerDashboard.pendingActions.companyApproval.description",
    cta: "freelancerDashboard.pendingActions.companyApproval.cta",
    actionLabel: "freelancerDashboard.pendingActions.companyApproval.cta",
  },
  "sub-expired": {
    title: "freelancerDashboard.pendingActions.renewSubscription.title",
    description: "freelancerDashboard.pendingActions.renewSubscription.description",
    cta: "freelancerDashboard.pendingActions.renewSubscription.cta",
    actionLabel: "freelancerDashboard.pendingActions.renewSubscription.cta",
  },
  "sub-expiring": {
    cta: "freelancerDashboard.pendingActions.reviewPlans.cta",
    actionLabel: "freelancerDashboard.pendingActions.reviewPlans.cta",
  },
  revision: {
    title: "freelancerDashboard.pendingActions.revisionRequired.title",
    description: "freelancerDashboard.pendingActions.revisionRequired.descriptionWithOrder",
    descriptionGeneric: "freelancerDashboard.pendingActions.revisionRequired.descriptionGeneric",
    cta: "freelancerDashboard.pendingActions.revisionRequired.cta",
    actionLabel: "freelancerDashboard.pendingActions.revisionRequired.cta",
  },
  "final-test": {
    title: "freelancerDashboard.pendingActions.finalTest.title",
    description: "freelancerDashboard.pendingActions.finalTest.descriptionWithCourse",
    descriptionGeneric: "freelancerDashboard.pendingActions.finalTest.descriptionGeneric",
    descriptionActivation: "freelancerDashboard.pendingActions.finalTest.descriptionActivation",
    descriptionActivationGeneric: "freelancerDashboard.pendingActions.finalTest.descriptionActivationGeneric",
    cta: "freelancerDashboard.pendingActions.finalTest.cta",
    actionLabel: "freelancerDashboard.pendingActions.finalTest.cta",
    secondaryCta: "freelancerDashboard.pendingActions.finalTest.viewCourse",
  },
  "courses-pending": {
    title: "freelancerDashboard.pendingActions.coursesPending.title",
    description: "freelancerDashboard.pendingActions.coursesPending.description",
    cta: "freelancerDashboard.pendingActions.coursesPending.cta",
    actionLabel: "freelancerDashboard.pendingActions.coursesPending.cta",
    secondaryCta: "freelancerDashboard.actions.viewCourse",
  },
  "claims-review": {
    title: "freelancerDashboard.pendingActions.claimsReview.title",
    description: "freelancerDashboard.pendingActions.claimsReview.description",
    cta: "freelancerDashboard.pendingActions.claimsReview.cta",
    actionLabel: "freelancerDashboard.pendingActions.claimsReview.cta",
  },
  "claims-accepted-payout": {
    title: "freelancerDashboard.pendingActions.claimsAcceptedPayout.title",
    description: "freelancerDashboard.pendingActions.claimsAcceptedPayout.description",
    cta: "freelancerDashboard.pendingActions.claimsAcceptedPayout.cta",
    actionLabel: "freelancerDashboard.pendingActions.claimsAcceptedPayout.cta",
  },
};

/** Smart insight ids from dashboard-summary API. */
const INSIGHT_I18N = {
  "profile-incomplete": {
    title: "freelancerDashboard.apiInsights.profileIncomplete.title",
    description: "freelancerDashboard.apiInsights.profileIncomplete.description",
    actionLabel: "freelancerDashboard.apiInsights.profileIncomplete.actionLabel",
  },
  "revisions-pending": {
    title: "freelancerDashboard.apiInsights.revisionsPending.title",
    description: "freelancerDashboard.apiInsights.revisionsPending.description",
    actionLabel: "freelancerDashboard.apiInsights.revisionsPending.actionLabel",
  },
  "course-progress": {
    title: "freelancerDashboard.apiInsights.courseProgress.title",
    description: "freelancerDashboard.apiInsights.courseProgress.description",
    actionLabel: "freelancerDashboard.apiInsights.courseProgress.actionLabel",
  },
  "final-test": {
    title: "freelancerDashboard.apiInsights.finalTest.title",
    description: "freelancerDashboard.apiInsights.finalTest.description",
    actionLabel: "freelancerDashboard.apiInsights.finalTest.actionLabel",
  },
  "delivery-excellent": {
    title: "freelancerDashboard.apiInsights.deliveryExcellent.title",
    description: "freelancerDashboard.apiInsights.deliveryExcellent.description",
  },
  "sub-expiring": {
    title: "freelancerDashboard.apiInsights.subExpiring.title",
    description: "freelancerDashboard.apiInsights.subExpiring.description",
    actionLabel: "freelancerDashboard.apiInsights.subExpiring.actionLabel",
  },
  "add-portfolio": {
    title: "freelancerDashboard.apiInsights.addPortfolio.title",
    description: "freelancerDashboard.apiInsights.addPortfolio.description",
    actionLabel: "freelancerDashboard.apiInsights.addPortfolio.actionLabel",
  },
  "start-first-order": {
    title: "freelancerDashboard.apiInsights.startFirstOrder.title",
    description: "freelancerDashboard.apiInsights.startFirstOrder.description",
    actionLabel: "freelancerDashboard.apiInsights.startFirstOrder.actionLabel",
  },
  "reviews-strong": {
    title: "freelancerDashboard.apiInsights.reviewsStrong.title",
    description: "freelancerDashboard.apiInsights.reviewsStrong.description",
    actionLabel: "freelancerDashboard.apiInsights.reviewsStrong.actionLabel",
  },
  "claims-hint": {
    title: "freelancerDashboard.apiInsights.claimsHint.title",
    description: "freelancerDashboard.apiInsights.claimsHint.description",
    actionLabel: "freelancerDashboard.apiInsights.claimsHint.actionLabel",
  },
  "review-analytics": {
    title: "freelancerDashboard.apiInsights.reviewAnalytics.title",
    description: "freelancerDashboard.apiInsights.reviewAnalytics.description",
    actionLabel: "freelancerDashboard.apiInsights.reviewAnalytics.actionLabel",
  },
};

function resolveActionId(id) {
  const raw = String(id || "");
  if (raw.startsWith("pending-")) return raw.slice("pending-".length);
  return raw;
}

function lookupI18nMap(item) {
  const id = String(item?.id || "");
  const actionId = resolveActionId(id);
  if (ACTION_I18N[actionId]) return ACTION_I18N[actionId];
  if (INSIGHT_I18N[id]) return INSIGHT_I18N[id];
  if (id.startsWith("review-analytics-")) return INSIGHT_I18N["review-analytics"];
  return null;
}

function pickDescriptionKey(item, map) {
  const id = resolveActionId(item?.id || "");
  const variant = item?.descriptionVariant;
  if (variant && map?.[variant]) return map[variant];
  if (id === "final-test") {
    if (item?.descriptionKey) return null;
    if (item?.isActivationBanner) {
      if (item?.i18nParams?.course && map?.descriptionActivation) return map.descriptionActivation;
      if (map?.descriptionActivationGeneric) return map.descriptionActivationGeneric;
    }
    if (item?.i18nParams?.course && map?.description) return map.description;
    return map?.descriptionGeneric || map?.description;
  }
  if (id === "revision") {
    if (variant === "descriptionGeneric" && map?.descriptionGeneric) return map.descriptionGeneric;
    if (item?.i18nParams?.code && map?.description) return map.description;
    return map?.descriptionGeneric || map?.description;
  }
  return map?.description;
}

function translateKey(t, key, params) {
  if (!key) return "";
  const count = params?.count;
  if (count != null && Number(count) !== 1) {
    const pluralKey = `${key}_plural`;
    const plural = t(pluralKey, params);
    if (plural !== pluralKey) return plural;
  }
  return t(key, params);
}

function legacyLocaleField(item, field, locale) {
  const strict = getLocaleField(item, field, locale);
  if (strict) return strict;
  if (locale === "ar") {
    const legacyAr = item?.[`${field}Ar`];
    if (legacyAr != null && String(legacyAr).trim() !== "") return String(legacyAr);
    const raw = item?.[field];
    return raw != null ? String(raw) : "";
  }
  return "";
}

/**
 * Attach i18n interpolation params from dashboard summary for API insight/action rows.
 * @param {Record<string, unknown>} item
 * @param {Record<string, unknown> | null | undefined} summary
 * @param {string} locale
 * @param {(key: string) => string} t
 */
export function enrichFreelancerDashboardItem(item, summary, locale, t) {
  if (!item) return item;

  const params = { ...(item.i18nParams && typeof item.i18nParams === "object" ? item.i18nParams : {}) };
  const counts = summary?.orders?.counts ?? {};
  const courses = summary?.courses?.loadState === "ok" ? summary.courses : null;
  const reviews = summary?.reviews ?? null;
  const performance = summary?.performance ?? null;
  const profileCompletion = summary?.profileCompletion ?? null;
  const id = String(item.id || "");

  if (id === "profile-incomplete" && profileCompletion?.percentage != null) {
    params.percent = profileCompletion.percentage;
  }
  if (id === "revisions-pending" || id === "revision" || id === "pending-revision") {
    params.count = Number(counts.revisionRequired) || params.count || 0;
  }
  if (id === "final-test" || id === "pending-final-test") {
    params.count = Number(courses?.pendingFinalTest) || params.count || 0;
    if (!params.course) {
      const testCourse = courses?.latestInProgressCourse || courses?.continueCourse;
      const courseTitle = getLocaleField(testCourse, "title", locale);
      if (courseTitle) params.course = courseTitle;
    }
  }
  if (id === "course-progress") {
    const course = courses?.latestInProgressCourse || courses?.continueCourse;
    if (course?.progress?.percentage != null) params.percent = course.progress.percentage;
    const courseTitle = getLocaleField(course, "title", locale);
    if (courseTitle) params.course = courseTitle;
  }
  if (id === "delivery-excellent" && performance?.onTimeDeliveryPercent != null) {
    params.percent = performance.onTimeDeliveryPercent;
  }
  if (id === "reviews-strong" && reviews) {
    if (reviews.averageRating != null) params.rating = reviews.averageRating;
    if (reviews.totalReviews != null) params.count = reviews.totalReviews;
  }
  if ((id === "claims-review" || id === "pending-claims-review") && params.count == null) {
    params.count = Number(summary?.earnings?.openClaimsCount) || 0;
  }

  return { ...item, i18nParams: params };
}

/**
 * Resolve visible text for dashboard actions, insights, and banners.
 */
export function resolveFreelancerDashboardItem(item, field, t, locale = "ar") {
  if (!item) return "";

  const params = item.i18nParams && typeof item.i18nParams === "object" ? item.i18nParams : undefined;
  const fieldKey = `${field}Key`;
  if (item[fieldKey]) return translateKey(t, String(item[fieldKey]), params);

  if (field === "description" && item.descriptionText != null && String(item.descriptionText).trim() !== "") {
    return String(item.descriptionText);
  }

  const map = lookupI18nMap(item);
  if (map) {
    let key = field === "description" ? pickDescriptionKey(item, map) : map[field];
    if (!key && field === "cta" && map.actionLabel) key = map.actionLabel;
    if (key) return translateKey(t, key, params);
  }

  return legacyLocaleField(item, field, locale);
}
