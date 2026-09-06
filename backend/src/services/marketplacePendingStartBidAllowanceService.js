/**
 * Marketplace-M4.1 / M4.2 — package Bid entitlement while purchased_pending_start.
 *
 * Product:
 * - "عرض متاح" = plan.monthlyBidAllowance (package total normal Bids).
 * - "عروض يوميًا" = plan.dailyBidSpendLimit (daily application cap).
 * - pending-start grants the SAME package total (not an arbitrary smaller bonus).
 * - used Bids count against that package; term start must NOT double-grant.
 * - Priority Bid remains active-only (not unlocked here).
 * - granting Bids does NOT start paid_term_starts_at.
 */

const { createAppError } = require("../utils/AppError");
const {
  isPurchasedPendingStartStatus,
} = require("../utils/marketplaceMembershipPendingStart");
const {
  E1_PLAN_SPECS,
} = require("../constants/marketplaceMembershipPlans");
const accounting = require("./marketplaceBidCreditAccountingService");

/** Expiry cushion while waiting for first real order (days). Realigned on term start. */
const PENDING_START_ALLOWANCE_TTL_DAYS = 90;

function buildPendingStartAllowanceIdempotencyKey(membershipId) {
  return `pending_start_app_allowance:membership:${Number(membershipId)}`.slice(0, 180);
}

function buildPendingStartAllowanceAdoptKey(membershipId, cycleId) {
  return `pending_start_app_allowance_adopt:membership:${Number(membershipId)}:cycle:${Number(cycleId)}`.slice(
    0,
    180,
  );
}

function resolvePlanMonthlyBidAllowance(plan = {}) {
  const fromPlan = Number(plan.monthlyBidAllowance);
  if (Number.isInteger(fromPlan) && fromPlan > 0) return fromPlan;
  const tier = String(plan.tierCode || plan.tier_code || "")
    .trim()
    .toLowerCase();
  const defaults = E1_PLAN_SPECS[tier];
  const fromDefaults = Number(defaults?.totalBids);
  if (Number.isInteger(fromDefaults) && fromDefaults > 0) return fromDefaults;
  return 0;
}

function resolvePlanDailyBidSpendLimit(plan = {}) {
  const fromPlan = Number(plan.dailyBidSpendLimit);
  if (Number.isInteger(fromPlan) && fromPlan >= 0) return fromPlan;
  const tier = String(plan.tierCode || plan.tier_code || "")
    .trim()
    .toLowerCase();
  const defaults = E1_PLAN_SPECS[tier];
  const fromDefaults = Number(defaults?.dailyBidLimit);
  if (Number.isInteger(fromDefaults) && fromDefaults >= 0) return fromDefaults;
  return null;
}

/**
 * Pure: pending-start total Bids = package card "عرض متاح" (monthlyBidAllowance).
 * No arbitrary smaller cap — same entitlement as active term package.
 */
function computePendingStartApplicationBidAllowance(plan = {}) {
  const amount = resolvePlanMonthlyBidAllowance(plan);
  return Math.max(0, amount);
}

/**
 * Ensure spendable Bids exist for purchased_pending_start before apply/reserve/consume.
 * Grants the full package total once (idempotent). Does not start the paid term.
 */
async function ensurePurchasedPendingStartApplicationBidAllowance({
  client,
  freelancerUserId,
  membership = null,
  plan = null,
  now = new Date(),
  actorUserId = null,
} = {}) {
  if (!client) {
    throw createAppError("ensurePurchasedPendingStartApplicationBidAllowance requires a client.", 500);
  }
  const fid = Number(freelancerUserId);
  if (!Number.isInteger(fid) || fid < 1) {
    return { granted: false, reason: "invalid_freelancer" };
  }

  let mem = membership;
  if (!mem) {
    try {
      const membershipsService = require("./marketplaceMembershipsService");
      mem = await membershipsService.resolveCurrentMarketplaceMembershipForFreelancer(fid, {
        client,
      });
    } catch (err) {
      if (err?.code === "42P01" || err?.code === "42703") {
        return { granted: false, reason: "schema_unavailable" };
      }
      throw err;
    }
  }
  if (!mem || !isPurchasedPendingStartStatus(mem.status)) {
    return { granted: false, reason: "not_purchased_pending_start" };
  }

  if (!(await require("../utils/marketplaceBidCreditsSchema").marketplaceBidCreditsSchemaReady(client))) {
    return { granted: false, reason: "bid_credits_schema_unavailable" };
  }

  let planRow = plan || mem.plan || null;
  if (!planRow) {
    try {
      const plansService = require("./marketplaceMembershipPlansService");
      planRow = await plansService.getMarketplaceMembershipPlanById(
        Number(mem.marketplacePlanId || mem.marketplace_plan_id),
        client,
      );
    } catch {
      planRow = null;
    }
  }

  const amount = computePendingStartApplicationBidAllowance(planRow || {});
  if (!(amount > 0)) {
    return { granted: false, reason: "zero_package_allowance" };
  }

  const grantedAt = now instanceof Date ? now : new Date(now);
  const expiresAt = new Date(
    grantedAt.getTime() + PENDING_START_ALLOWANCE_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const membershipId = Number(mem.id);
  const idempotencyKey = buildPendingStartAllowanceIdempotencyKey(membershipId);
  const dailyCap = resolvePlanDailyBidSpendLimit(planRow || {});

  const out = await accounting.createBidCreditGrant({
    client,
    freelancerUserId: fid,
    sourceType: "membership_daily_unlock",
    amount,
    expiresAt,
    eventType: "MEMBERSHIP_BID_GRANT",
    idempotencyKey,
    membershipId,
    cycleId: null,
    distributionMonthId: null,
    reason: "purchased_pending_start_package_bid_allowance",
    actorUserId: actorUserId != null ? Number(actorUserId) : fid,
    referenceType: "marketplace_membership",
    referenceId: String(membershipId),
    metadata: {
      phase: "M4.2",
      termStarted: false,
      priorityBidUnlocked: false,
      monthlyCycleUnlocked: false,
      packageTotalBids: amount,
      dailyBidSpendLimit: dailyCap,
      amount,
    },
    grantedAt,
  });

  return {
    granted: Boolean(out.created),
    idempotent: Boolean(out.idempotent),
    amount,
    dailyBidSpendLimit: dailyCap,
    grant: out.grant || null,
    reason: out.created ? "created" : "already_exists",
  };
}

/**
 * On first real order/article term start:
 * carry the pending-start package grant into the active cycle ledger and seed
 * distribution total_unlocked so full_cycle unlock does NOT duplicate Bids.
 *
 * Used pre-start Bids remain consumed on the same grant.
 * If a legacy smaller grant exists (M4.1 cap), remaining package Bids unlock normally.
 */
async function adoptPendingStartAllowanceIntoActiveCycle({
  client,
  membershipId,
  cycleId,
  freelancerUserId = null,
  paidTermEndsAt = null,
  now = new Date(),
  actorUserId = null,
} = {}) {
  if (!client) return { adopted: false, reason: "no_client" };
  const mid = Number(membershipId);
  const cid = Number(cycleId);
  if (!Number.isInteger(mid) || mid < 1 || !Number.isInteger(cid) || cid < 1) {
    return { adopted: false, reason: "invalid_ids" };
  }

  if (!(await require("../utils/marketplaceBidCreditsSchema").marketplaceBidCreditsSchemaReady(client))) {
    return { adopted: false, reason: "bid_credits_schema_unavailable" };
  }

  const key = buildPendingStartAllowanceIdempotencyKey(mid);
  const { rows } = await client.query(
    `SELECT *
       FROM marketplace_bid_credit_grants
      WHERE idempotency_key = $1
      LIMIT 1
      FOR UPDATE`,
    [key],
  );
  const grant = rows[0];
  if (!grant) return { adopted: false, reason: "no_pre_start_grant" };

  const grantedAmount = Number(grant.amount_granted) || 0;
  const expiresAt =
    paidTermEndsAt != null
      ? new Date(paidTermEndsAt)
      : grant.expires_at
        ? new Date(grant.expires_at)
        : new Date(now);

  await client.query(
    `UPDATE marketplace_bid_credit_grants
        SET cycle_id = COALESCE(cycle_id, $2),
            expires_at = $3,
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
      WHERE id = $1`,
    [
      grant.id,
      cid,
      expiresAt.toISOString(),
      JSON.stringify({
        phase: "M4.2",
        adoptedIntoCycleId: String(cid),
        adoptedAt: new Date(now).toISOString(),
        actorUserId: actorUserId != null ? Number(actorUserId) : null,
        freelancerUserId: freelancerUserId || grant.freelancer_user_id,
      }),
    ],
  );

  // Seed distribution month so full_cycle reconcile treats these Bids as already unlocked.
  const { rows: monthRows } = await client.query(
    `SELECT id, monthly_bid_allowance_snapshot, total_unlocked
       FROM marketplace_membership_bid_distribution_months
      WHERE cycle_id = $1
      LIMIT 1
      FOR UPDATE`,
    [cid],
  );
  const month = monthRows[0];
  if (month) {
    const packageTotal = Number(month.monthly_bid_allowance_snapshot) || 0;
    const credit = Math.min(grantedAmount, packageTotal > 0 ? packageTotal : grantedAmount);
    await client.query(
      `UPDATE marketplace_membership_bid_distribution_months
          SET total_unlocked = GREATEST(COALESCE(total_unlocked, 0), $2),
              updated_at = NOW()
        WHERE id = $1`,
      [month.id, credit],
    );
  }

  return {
    adopted: true,
    reason: "adopted",
    grantId: Number(grant.id),
    grantedAmount,
    amountConsumed: Number(grant.amount_consumed) || 0,
    cycleId: cid,
  };
}

/**
 * @deprecated M4.2 — prefer adoptPendingStartAllowanceIntoActiveCycle (no double-grant).
 * Kept for tests/callers that still revoke unused remainder.
 */
async function revokeUnusedPendingStartApplicationBidAllowance({
  client,
  membershipId,
  freelancerUserId = null,
  now = new Date(),
  actorUserId = null,
} = {}) {
  if (!client) return { revoked: 0, reason: "no_client" };
  const mid = Number(membershipId);
  if (!Number.isInteger(mid) || mid < 1) return { revoked: 0, reason: "invalid_membership" };

  if (!(await require("../utils/marketplaceBidCreditsSchema").marketplaceBidCreditsSchemaReady(client))) {
    return { revoked: 0, reason: "bid_credits_schema_unavailable" };
  }

  const key = buildPendingStartAllowanceIdempotencyKey(mid);
  const { rows } = await client.query(
    `SELECT id, freelancer_user_id, status
       FROM marketplace_bid_credit_grants
      WHERE idempotency_key = $1
      LIMIT 1`,
    [key],
  );
  const grant = rows[0];
  if (!grant) return { revoked: 0, reason: "no_pre_start_grant" };

  try {
    const out = await accounting.revokeUnusedBidCreditGrantRemainder({
      client,
      grantId: Number(grant.id),
      idempotencyKey: `pending_start_app_allowance_revoke:membership:${mid}`.slice(0, 180),
      eventType: "ADMIN_BID_ADJUSTMENT",
      reason: "pending_start_allowance_replaced_by_active_cycle",
      referenceType: "marketplace_membership",
      referenceId: String(mid),
      actorUserId,
      metadata: {
        phase: "M4.1_legacy_revoke",
        freelancerUserId: freelancerUserId || grant.freelancer_user_id,
      },
      now,
    });
    return {
      revoked: Number(out.revoked) || 0,
      reason: out.reason || "revoked",
      grant: out.grant || null,
    };
  } catch (err) {
    if (err?.statusCode === 503 || err?.code === "42703" || err?.code === "42P01") {
      return { revoked: 0, reason: "revoke_schema_unavailable", error: err };
    }
    throw err;
  }
}

module.exports = {
  PENDING_START_ALLOWANCE_TTL_DAYS,
  buildPendingStartAllowanceIdempotencyKey,
  buildPendingStartAllowanceAdoptKey,
  resolvePlanMonthlyBidAllowance,
  resolvePlanDailyBidSpendLimit,
  computePendingStartApplicationBidAllowance,
  ensurePurchasedPendingStartApplicationBidAllowance,
  adoptPendingStartAllowanceIntoActiveCycle,
  revokeUnusedPendingStartApplicationBidAllowance,
};
