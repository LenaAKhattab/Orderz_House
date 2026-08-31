/**
 * Courses-Gating-01 — marketplace plan tier eligibility for freelancer courses.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { isSpecialOfferMembershipTier } = require("../constants/marketplaceMembershipPlans");
const marketplaceMembershipsService = require("./marketplaceMembershipsService");

const UPGRADE_PATH = "/dashboard/freelancer/plans";
const DEFAULT_COURSE_REQUIRED_TIER_CODE = "silver";

const COURSE_REQUIRED_TIER_CODES = Object.freeze(["starter", "silver", "pro", "elite"]);

const COURSE_TIER_RANK = Object.freeze({
  starter: 1,
  silver: 2,
  pro: 3,
  elite: 4,
  special_offer: 2,
  free: 1,
  start: 2,
  active: 3,
  pay_as_you_work: 1,
});

function normalizeCourseRequiredTierCode(raw) {
  const code = String(raw || DEFAULT_COURSE_REQUIRED_TIER_CODE).trim().toLowerCase();
  if (COURSE_REQUIRED_TIER_CODES.includes(code)) return code;
  return DEFAULT_COURSE_REQUIRED_TIER_CODE;
}

function normalizeMembershipTierForCourses(raw) {
  if (raw == null || raw === "") return null;
  const code = String(raw).trim().toLowerCase();
  if (isSpecialOfferMembershipTier(code)) return "silver";
  if (COURSE_REQUIRED_TIER_CODES.includes(code)) return code;
  if (code === "free" || code === "pay_as_you_work") return "starter";
  if (code === "start") return "silver";
  if (code === "active") return "pro";
  return null;
}

function tierRank(tierCode) {
  const normalized = normalizeMembershipTierForCourses(tierCode);
  if (!normalized) return 0;
  return COURSE_TIER_RANK[normalized] ?? 0;
}

function isRequiredMembershipTrainingCourse(courseId, requiredTrainingCourseId) {
  const cid = Number(courseId);
  const rid = Number(requiredTrainingCourseId);
  if (!Number.isInteger(cid) || cid < 1 || !Number.isInteger(rid) || rid < 1) return false;
  return cid === rid;
}

async function getRequiredMembershipTrainingCourseId(client = null) {
  const db = client || pool;
  try {
    const { rows } = await db.query(
      `SELECT marketplace_membership_required_course_id AS course_id
         FROM marketplace_economy_settings
        WHERE id = 1
        LIMIT 1`,
    );
    const id = rows[0]?.course_id;
    return id != null && Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
  } catch (err) {
    if (err && err.code === "42703") return null;
    throw err;
  }
}

async function resolveFreelancerEffectiveTierCode(freelancerUserId, options = {}) {
  const membership = await marketplaceMembershipsService.resolveCurrentMarketplaceMembershipForFreelancer(
    freelancerUserId,
    options,
  );
  if (!membership?.plan?.tierCode) return null;
  return normalizeMembershipTierForCourses(membership.plan.tierCode);
}

async function buildFreelancerCourseAccessContext(freelancerUserId, options = {}) {
  const [currentTierCode, requiredTrainingCourseId] = await Promise.all([
    resolveFreelancerEffectiveTierCode(freelancerUserId, options),
    options.requiredTrainingCourseId !== undefined
      ? Promise.resolve(options.requiredTrainingCourseId)
      : getRequiredMembershipTrainingCourseId(options.client),
  ]);
  return { currentTierCode, requiredTrainingCourseId };
}

/**
 * Pure evaluation when context is preloaded (used in list + unit tests).
 */
function evaluateCoursePlanAccessWithContext({ course, context }) {
  const courseId = course?.id ?? course?.courseId;
  const requiredTierCode = normalizeCourseRequiredTierCode(
    course?.requiredTierCode ?? course?.required_tier_code,
  );
  const { currentTierCode, requiredTrainingCourseId } = context || {};

  if (isRequiredMembershipTrainingCourse(courseId, requiredTrainingCourseId)) {
    return {
      canAccess: true,
      isLockedByPlan: false,
      requiredTierCode,
      currentTierCode: currentTierCode ?? null,
      lockReason: null,
      upgradeRequired: false,
      upgradePath: UPGRADE_PATH,
    };
  }

  const requiredRank = tierRank(requiredTierCode);
  const currentRank = tierRank(currentTierCode);
  const canAccess = currentRank >= requiredRank && requiredRank > 0;
  const isLockedByPlan = !canAccess;

  return {
    canAccess,
    isLockedByPlan,
    requiredTierCode,
    currentTierCode: currentTierCode ?? null,
    lockReason: isLockedByPlan ? "COURSE_PLAN_UPGRADE_REQUIRED" : null,
    upgradeRequired: isLockedByPlan,
    upgradePath: UPGRADE_PATH,
  };
}

async function evaluateCoursePlanAccess({ freelancerUserId, course, context = null, client = null }) {
  const ctx =
    context ||
    (await buildFreelancerCourseAccessContext(freelancerUserId, {
      client,
    }));
  return evaluateCoursePlanAccessWithContext({ course, context: ctx });
}

function buildCoursePlanUpgradeError(access) {
  return createAppError("هذه الدورة متاحة لباقات أعلى.", 403, {
    exposeToClient: true,
    publicCode: "COURSE_PLAN_UPGRADE_REQUIRED",
    meta: {
      requiredTierCode: access.requiredTierCode,
      currentTierCode: access.currentTierCode,
      upgradePath: UPGRADE_PATH,
    },
  });
}

async function assertFreelancerCoursePlanAccess({ freelancerUserId, course, client = null, context = null }) {
  const access = await evaluateCoursePlanAccess({
    freelancerUserId,
    course,
    context,
    client,
  });
  if (!access.canAccess) {
    throw buildCoursePlanUpgradeError(access);
  }
  return access;
}

module.exports = {
  UPGRADE_PATH,
  DEFAULT_COURSE_REQUIRED_TIER_CODE,
  COURSE_REQUIRED_TIER_CODES,
  COURSE_TIER_RANK,
  normalizeCourseRequiredTierCode,
  normalizeMembershipTierForCourses,
  tierRank,
  isRequiredMembershipTrainingCourse,
  getRequiredMembershipTrainingCourseId,
  resolveFreelancerEffectiveTierCode,
  buildFreelancerCourseAccessContext,
  evaluateCoursePlanAccessWithContext,
  evaluateCoursePlanAccess,
  assertFreelancerCoursePlanAccess,
  buildCoursePlanUpgradeError,
};
