/**
 * Phase E1 — Marketplace Membership activation requests.
 * Paid period starts ONLY on company approval (approved_at).
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const eligibility = require("./marketplaceMembershipEligibilityService");
const membershipsService = require("./marketplaceMembershipsService");
const plansService = require("./marketplaceMembershipPlansService");
const {
  PAID_MEMBERSHIP_PERIOD_START,
} = require("../constants/marketplaceMembershipPlans");

async function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  const client = await pool.connect();
  return { client, release: true, ownTxn: true };
}

function mapRequest(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    freelancerUserId: Number(row.freelancer_user_id),
    marketplacePlanId: Number(row.marketplace_plan_id),
    status: row.status,
    paymentRecordedAt: row.payment_recorded_at,
    trainingCompletedAt: row.training_completed_at,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    approvedByUserId: row.approved_by_user_id != null ? Number(row.approved_by_user_id) : null,
    rejectedAt: row.rejected_at,
    rejectedByUserId: row.rejected_by_user_id != null ? Number(row.rejected_by_user_id) : null,
    rejectionReason: row.rejection_reason || null,
    activatedMembershipId:
      row.activated_membership_id != null ? Number(row.activated_membership_id) : null,
    periodStartRule: PAID_MEMBERSHIP_PERIOD_START,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Freelancer requests activation after verification + training ("ابدأ اشتراكي").
 * Does NOT start membership duration. Status = pending until company approves.
 */
async function createActivationRequest({
  freelancerUserId,
  marketplacePlanId,
  paymentRecordedAt = null,
  now = new Date(),
} = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await eligibility.assertMarketplaceVerificationComplete(client, freelancerUserId);

    const plan = await plansService.getMarketplaceMembershipPlanById(marketplacePlanId, client);
    if (!plan || !plan.isActive) {
      throw createAppError("Marketplace plan not found or inactive.", 404, {
        exposeToClient: true,
        publicCode: "MARKETPLACE_PLAN_NOT_FOUND",
      });
    }

    const isStarter = String(plan.tierCode).toLowerCase() === "starter" || plan.isOneTimeStarter;
    if (isStarter) {
      // Starter: free path activates immediately (no company queue) via activateStarterMembership.
      throw createAppError(
        "Starter activates directly after verification; use Starter activation endpoint.",
        400,
        { exposeToClient: true, publicCode: "STARTER_USES_DIRECT_ACTIVATION" },
      );
    }

    const training = await eligibility.assertPaidTrainingComplete(client, freelancerUserId);

    const { rows } = await client.query(
      `INSERT INTO marketplace_membership_activation_requests (
         freelancer_user_id, marketplace_plan_id, status,
         payment_recorded_at, training_completed_at, requested_at
       ) VALUES ($1, $2, 'pending', $3, $4, $5)
       RETURNING *`,
      [
        Number(freelancerUserId),
        Number(marketplacePlanId),
        paymentRecordedAt ? new Date(paymentRecordedAt).toISOString() : null,
        training.completedAt,
        new Date(now).toISOString(),
      ],
    );
    await client.query("COMMIT");
    return mapRequest(rows[0]);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (err && err.code === "23505") {
      throw createAppError("A pending activation request already exists for this plan.", 409, {
        exposeToClient: true,
        publicCode: "ACTIVATION_REQUEST_ALREADY_PENDING",
      });
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Company approval — ONLY this sets activated_at / expires_at / cycle / Bid grant.
 */
async function approveActivationRequest({
  requestId,
  actorUserId,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(null);
  try {
    if (ownTxn) await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM marketplace_membership_activation_requests WHERE id = $1 FOR UPDATE`,
      [Number(requestId)],
    );
    const req = rows[0];
    if (!req) {
      throw createAppError("Activation request not found.", 404, {
        exposeToClient: true,
        publicCode: "ACTIVATION_REQUEST_NOT_FOUND",
      });
    }
    if (req.status !== "pending") {
      throw createAppError("Activation request is not pending.", 409, {
        exposeToClient: true,
        publicCode: "ACTIVATION_REQUEST_NOT_PENDING",
      });
    }

    await eligibility.assertMarketplaceVerificationComplete(client, req.freelancer_user_id);

    const approvalInstant = new Date(now);
    // Period starts at company approval — payment_recorded_at is preserved separately.
    const activated = await membershipsService.createAndActivateMarketplaceMembership({
      freelancerUserId: req.freelancer_user_id,
      marketplacePlanId: req.marketplace_plan_id,
      source: "admin",
      actorUserId,
      now: approvalInstant,
      paidTermStartsAt: approvalInstant,
      client,
    });
    const membershipId = Number(activated.membership?.id || activated.id);

    const { rows: updated } = await client.query(
      `UPDATE marketplace_membership_activation_requests
          SET status = 'approved',
              approved_at = $2,
              approved_by_user_id = $3,
              activated_membership_id = $4,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        req.id,
        approvalInstant.toISOString(),
        actorUserId != null ? Number(actorUserId) : null,
        membershipId,
      ],
    );

    if (ownTxn) await client.query("COMMIT");
    return {
      request: mapRequest(updated[0]),
      membership: activated.membership || activated,
      currentCycle: activated.currentCycle || null,
      periodStart: PAID_MEMBERSHIP_PERIOD_START,
      paymentRecordedAt: req.payment_recorded_at,
    };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

async function rejectActivationRequest({
  requestId,
  actorUserId,
  reason = null,
  now = new Date(),
} = {}) {
  const { rows } = await pool.query(
    `UPDATE marketplace_membership_activation_requests
        SET status = 'rejected',
            rejected_at = $2,
            rejected_by_user_id = $3,
            rejection_reason = $4,
            updated_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [
      Number(requestId),
      new Date(now).toISOString(),
      actorUserId != null ? Number(actorUserId) : null,
      reason,
    ],
  );
  if (!rows[0]) {
    throw createAppError("Pending activation request not found.", 404, {
      exposeToClient: true,
      publicCode: "ACTIVATION_REQUEST_NOT_FOUND",
    });
  }
  return mapRequest(rows[0]);
}

/**
 * Starter: verification → immediate activate (10 days, 20 Bids once). No company queue.
 */
async function activateStarterMembership({
  freelancerUserId,
  actorUserId = null,
  now = new Date(),
  skipVerification = false,
} = {}) {
  const plan = await plansService.getMarketplaceMembershipPlanByTierCode("starter");
  if (!plan || !plan.isActive) {
    throw createAppError("Starter plan is not available.", 404, {
      exposeToClient: true,
      publicCode: "STARTER_PLAN_NOT_FOUND",
    });
  }
  return membershipsService.createAndActivateMarketplaceMembership({
    freelancerUserId,
    marketplacePlanId: Number(plan.id),
    source: "system",
    actorUserId,
    now,
    paidTermStartsAt: now,
    skipVerification: Boolean(skipVerification),
  });
}

/**
 * After platform account activation:
 * - If freelancer already has a current marketplace membership (any paid/usable plan) → keep it.
 * - If none → grant free STARTER once (never supersedes an existing current membership).
 */
async function ensureMarketplaceMembershipAfterAccountActivation({
  freelancerUserId,
  actorUserId = null,
  now = new Date(),
} = {}) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    return { grantedStarter: false, keptExisting: false, membership: null };
  }

  try {
    const current = await membershipsService.resolveCurrentMarketplaceMembershipForFreelancer(uid);
    if (current) {
      return {
        grantedStarter: false,
        keptExisting: true,
        membership: current,
        tierCode: current.plan?.tierCode || current.plan?.tier_code || null,
      };
    }

    const out = await activateStarterMembership({
      freelancerUserId: uid,
      actorUserId: actorUserId != null ? Number(actorUserId) : uid,
      now,
      skipVerification: true,
    });
    return {
      grantedStarter: true,
      keptExisting: false,
      membership: out?.membership || out || null,
      tierCode: "starter",
    };
  } catch (err) {
    const code = err?.publicCode || err?.code || null;
    // Starter already used, or marketplace schema missing — account activation still succeeds.
    if (
      code === "STARTER_ENTITLEMENT_ALREADY_USED" ||
      err?.statusCode === 409 ||
      err?.code === "42P01"
    ) {
      return {
        grantedStarter: false,
        keptExisting: false,
        membership: null,
        skippedReason: code || "starter_unavailable",
      };
    }
    // eslint-disable-next-line no-console
    console.error(
      "[membership] ensureMarketplaceMembershipAfterAccountActivation failed:",
      err?.message || err,
    );
    return {
      grantedStarter: false,
      keptExisting: false,
      membership: null,
      skippedReason: code || "membership_ensure_failed",
      errorMessage: err?.message || null,
    };
  }
}

module.exports = {
  createActivationRequest,
  approveActivationRequest,
  rejectActivationRequest,
  activateStarterMembership,
  ensureMarketplaceMembershipAfterAccountActivation,
  mapRequest,
  PAID_MEMBERSHIP_PERIOD_START,
};
