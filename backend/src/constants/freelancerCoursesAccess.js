/**
 * Freelancer LMS course access — Starter/Trial vs paid marketplace tiers.
 */

const { FREELANCER_ACTIVATION_PAID_TIER_CODES } = require("./freelancerActivationEngine");

const FREELANCER_COURSE_UPGRADE_ROUTE = "/dashboard/freelancer/plans";

const FREELANCER_COURSE_LOCKED_COPY_AR = Object.freeze({
  badge: "يتطلب اشتراك",
  message: "يجب الاشتراك بإحدى الخطط للوصول إلى هذه الدورة.",
  cta: "اشترك بإحدى الخطط",
});

const FREELANCER_FREE_ONBOARDING_ARTICLE_COURSE = Object.freeze({
  title: "كيفية إنشاء مقال",
  description: "فيديو قصير يشرح كيفية إنشاء مقال خطوة بخطوة.",
  lessonTitle: "كيفية إنشاء مقال",
  youtubeUrl: "https://youtu.be/Ivp6fji1uSY",
});

function hasFreelancerPaidCourseEntitlement(tierCode) {
  return FREELANCER_ACTIVATION_PAID_TIER_CODES.includes(String(tierCode || "").trim().toLowerCase());
}

/**
 * @param {{
 *   requiresPaidMembership?: boolean,
 *   hasAssignment?: boolean,
 *   tierCode?: string|null,
 * }} input
 */
function resolveFreelancerCourseAccess(input = {}) {
  const requiresPaidMembership = Boolean(input.requiresPaidMembership);
  const hasAssignment = Boolean(input.hasAssignment);
  const tierCode = input.tierCode != null ? String(input.tierCode) : null;
  const hasPaidEntitlement = hasFreelancerPaidCourseEntitlement(tierCode);

  if (!requiresPaidMembership) {
    return {
      isLocked: false,
      canAccess: true,
      requiresPaidMembership: false,
      lockReason: null,
      upgradeRoute: FREELANCER_COURSE_UPGRADE_ROUTE,
      copyAr: null,
    };
  }

  if (hasPaidEntitlement || hasAssignment) {
    return {
      isLocked: false,
      canAccess: true,
      requiresPaidMembership: true,
      lockReason: null,
      upgradeRoute: FREELANCER_COURSE_UPGRADE_ROUTE,
      copyAr: null,
    };
  }

  return {
    isLocked: true,
    canAccess: false,
    requiresPaidMembership: true,
    lockReason: "COURSE_SUBSCRIPTION_REQUIRED",
    upgradeRoute: FREELANCER_COURSE_UPGRADE_ROUTE,
    copyAr: { ...FREELANCER_COURSE_LOCKED_COPY_AR },
  };
}

module.exports = {
  FREELANCER_COURSE_UPGRADE_ROUTE,
  FREELANCER_COURSE_LOCKED_COPY_AR,
  FREELANCER_FREE_ONBOARDING_ARTICLE_COURSE,
  hasFreelancerPaidCourseEntitlement,
  resolveFreelancerCourseAccess,
};
