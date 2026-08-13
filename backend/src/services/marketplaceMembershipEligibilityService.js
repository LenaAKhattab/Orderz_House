/**
 * Phase E1 — Marketplace Membership eligibility helpers.
 * Verification, training, project value, withdrawal, Starter recycle.
 *
 * Full account verification ("توثيق الحساب") in Orderz House =
 *   active Freelancer
 *   + email_verified
 *   + subscription activation fee current when fee engine is enabled
 *     (رسوم توثيق الحساب — one-time verification fee)
 */

const { createAppError } = require("../utils/AppError");
const { pool } = require("../config/db");
const { STARTER_WITHDRAWAL, STARTER_EARNINGS_MODE } = require("../constants/marketplaceMembershipPlans");

async function assertMarketplaceVerificationComplete(client, freelancerUserId) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT id, role, is_active, COALESCE(email_verified, FALSE) AS email_verified
       FROM users WHERE id = $1`,
    [Number(freelancerUserId)],
  );
  const user = rows[0];
  if (!user || user.role !== "freelancer" || user.is_active !== true) {
    throw createAppError("Freelancer account is not eligible for Marketplace Membership.", 403, {
      exposeToClient: true,
      publicCode: "MEMBERSHIP_FREELANCER_INVALID",
    });
  }
  if (user.email_verified !== true) {
    throw createAppError("Account verification is required before Marketplace Membership activation.", 403, {
      exposeToClient: true,
      publicCode: "MEMBERSHIP_VERIFICATION_REQUIRED",
      meta: { missing: "email_verified" },
    });
  }

  // Canonical product "توثيق الحساب" fee (subscription activation fee).
  // Fail closed if fee status cannot be resolved (missing schema / settings failure).
  let feeStatus;
  try {
    const { getActivationFeeStatus } = require("./subscriptionActivationFeeService");
    feeStatus = await getActivationFeeStatus(freelancerUserId, runner);
  } catch (feeErr) {
    throw createAppError(
      "Account verification fee status could not be confirmed. Membership activation is blocked.",
      503,
      {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_VERIFICATION_FEE_UNAVAILABLE",
        meta: { cause: feeErr?.code || feeErr?.message || "fee_status_failed" },
        cause: feeErr,
      },
    );
  }
  if (feeStatus?.enabled && feeStatus.needsPayment) {
    throw createAppError(
      "Full account verification fee must be paid before Marketplace Membership activation.",
      403,
      {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_VERIFICATION_FEE_REQUIRED",
        meta: {
          missing: "activation_fee",
          amountJod: feeStatus.amountJod,
          needsPayment: true,
        },
      },
    );
  }

  return { user, feeStatus };
}

/**
 * Paid activation training gate — FAIL CLOSED when course id unset.
 * Config: marketplace_economy_settings.marketplace_membership_required_course_id
 */
async function assertPaidTrainingComplete(client, freelancerUserId) {
  const runner = client || pool;
  let courseId = null;
  try {
    const { rows } = await runner.query(
      `SELECT marketplace_membership_required_course_id AS course_id
         FROM marketplace_economy_settings WHERE id = 1`,
    );
    courseId = rows[0]?.course_id != null ? Number(rows[0].course_id) : null;
  } catch (err) {
    if (err && err.code === "42703") {
      throw createAppError(
        "Paid membership training course is not configured (migration 153 column missing).",
        503,
        { exposeToClient: true, publicCode: "MEMBERSHIP_TRAINING_CONFIG_MISSING" },
      );
    }
    throw err;
  }

  if (!Number.isInteger(courseId) || courseId < 1) {
    throw createAppError(
      "Paid membership requires a configured training course before activation can be requested.",
      409,
      {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_TRAINING_NOT_CONFIGURED",
        meta: { configKey: "marketplace_membership_required_course_id" },
      },
    );
  }

  const { rows: done } = await runner.query(
    `SELECT completed_at FROM course_assignments
      WHERE freelancer_id = $1 AND course_id = $2 AND completed_at IS NOT NULL
      LIMIT 1`,
    [Number(freelancerUserId), courseId],
  );
  if (!done[0]) {
    throw createAppError("Required training must be completed before requesting membership activation.", 403, {
      exposeToClient: true,
      publicCode: "MEMBERSHIP_TRAINING_REQUIRED",
      meta: { courseId },
    });
  }
  return { courseId, completedAt: done[0].completed_at, configured: true };
}

function evaluateProjectValueEligibility(plan, projectValueJod) {
  const value = Number(projectValueJod);
  if (!Number.isFinite(value)) {
    return { eligible: false, reason: "INVALID_PROJECT_VALUE" };
  }
  const min = plan.projectMinValueJod != null ? Number(plan.projectMinValueJod) : 1;
  if (value < min) {
    return { eligible: false, reason: "BELOW_MIN", min, max: plan.maxRealOrderValueJod };
  }
  if (plan.unlimitedRealOrderValue) {
    return { eligible: true, reason: null, min, max: null };
  }
  const max = plan.maxRealOrderValueJod != null ? Number(plan.maxRealOrderValueJod) : null;
  if (max != null && value > max) {
    return { eligible: false, reason: "ABOVE_MAX", min, max };
  }
  return { eligible: true, reason: null, min, max };
}

function assertProjectValueEligible(plan, projectValueJod) {
  const out = evaluateProjectValueEligibility(plan, projectValueJod);
  if (!out.eligible) {
    throw createAppError("This project value is outside your Marketplace Membership eligibility.", 403, {
      exposeToClient: true,
      publicCode: "MEMBERSHIP_PROJECT_VALUE_BLOCKED",
      meta: out,
    });
  }
  return out;
}

function evaluateMembershipWithdrawalEligibility(plan) {
  if (!plan) {
    return {
      allowed: false,
      reason: "NO_ACTIVE_MEMBERSHIP",
      starterWithdrawal: STARTER_WITHDRAWAL,
      starterEarningsMode: null,
    };
  }
  const tier = String(plan.tierCode || "").toLowerCase();
  const withdrawalEnabled = plan.withdrawalEnabled !== false && tier !== "starter";
  if (!withdrawalEnabled) {
    return {
      allowed: false,
      reason: "STARTER_WITHDRAWAL_BLOCKED",
      starterWithdrawal: STARTER_WITHDRAWAL,
      starterEarningsMode: plan.starterEarningsMode || STARTER_EARNINGS_MODE,
    };
  }
  return {
    allowed: true,
    reason: null,
    starterWithdrawal: STARTER_WITHDRAWAL,
    starterEarningsMode: plan.starterEarningsMode || "standard",
  };
}

async function assertStarterNotAlreadyConsumed(client, freelancerUserId) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT m.id
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
      WHERE m.freelancer_user_id = $1
        AND p.tier_code = 'starter'
      LIMIT 1`,
    [Number(freelancerUserId)],
  );
  if (rows[0]) {
    throw createAppError("Starter membership entitlement was already used and cannot be recycled.", 409, {
      exposeToClient: true,
      publicCode: "STARTER_ENTITLEMENT_ALREADY_USED",
    });
  }
}

module.exports = {
  assertMarketplaceVerificationComplete,
  assertPaidTrainingComplete,
  evaluateProjectValueEligibility,
  assertProjectValueEligible,
  evaluateMembershipWithdrawalEligibility,
  assertStarterNotAlreadyConsumed,
};
