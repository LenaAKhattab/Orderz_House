/**
 * LEGACY_DEPRECATED_WORK_TOKEN_MODEL — Phase A1 Work Token cycle grant.
 *
 * Phase B1 product decision: Work Tokens are deprecated on the website.
 * Active membership cycle activation NO LONGER calls this service.
 * Kept for historical tests / rollback audit only. Do not wire new callers.
 */

const { createAppError } = require("../utils/AppError");
const walletService = require("./marketplaceWorkTokenWalletService");

const MEMBERSHIP_CYCLE_GRANT_EVENT_TYPE = "MEMBERSHIP_CYCLE_GRANT";
const MEMBERSHIP_CYCLE_GRANT_REFERENCE_TYPE = "marketplace_membership_cycle";
const WORK_TOKEN_PRODUCT_STATUS = "DEPRECATED";

function membershipCycleGrantIdempotencyKey(cycleId) {
  return `membership_cycle_token_grant:${String(cycleId)}`;
}

/**
 * @deprecated Phase B1 — not invoked from active membership cycle activation.
 */
async function grantMembershipCycleIncludedWorkTokens({
  client,
  cycleRow,
  freelancerUserId,
  actorUserId = null,
} = {}) {
  if (!cycleRow || cycleRow.id == null) {
    throw createAppError("cycleRow is required for membership cycle token grant.", 500, {
      exposeToClient: false,
    });
  }
  const amount = Number(cycleRow.included_tokens_allowed);
  if (!Number.isInteger(amount) || amount <= 0) {
    return { skipped: true, reason: "ZERO_INCLUDED_TOKENS", amount: 0 };
  }
  const fid = Number(freelancerUserId || cycleRow.freelancer_user_id);
  if (!Number.isInteger(fid) || fid < 1) {
    throw createAppError("freelancerUserId is required for membership cycle token grant.", 400, {
      exposeToClient: true,
    });
  }

  const out = await walletService.creditWorkTokens({
    client,
    freelancerUserId: fid,
    amountTokens: amount,
    eventType: MEMBERSHIP_CYCLE_GRANT_EVENT_TYPE,
    referenceType: MEMBERSHIP_CYCLE_GRANT_REFERENCE_TYPE,
    referenceId: String(cycleRow.id),
    idempotencyKey: membershipCycleGrantIdempotencyKey(cycleRow.id),
    reason: "marketplace_membership_cycle_included_tokens",
    actorUserId,
    metadata: {
      membershipId: cycleRow.membership_id != null ? String(cycleRow.membership_id) : null,
      cycleNumber: cycleRow.cycle_number != null ? Number(cycleRow.cycle_number) : null,
      marketplacePlanId:
        cycleRow.marketplace_plan_id != null ? String(cycleRow.marketplace_plan_id) : null,
      includedTokensAllowed: amount,
      FREE_SIGNUP_WORK_TOKEN_GRANT: "NONE",
      WORK_TOKEN_PRODUCT_STATUS,
    },
  });

  return {
    ok: true,
    idempotent: Boolean(out.idempotent),
    amount,
    entry: out.entry || null,
    wallet: out.wallet || null,
  };
}

module.exports = {
  grantMembershipCycleIncludedWorkTokens,
  membershipCycleGrantIdempotencyKey,
  MEMBERSHIP_CYCLE_GRANT_REFERENCE_TYPE,
  MEMBERSHIP_CYCLE_GRANT_EVENT_TYPE,
  FREE_SIGNUP_WORK_TOKEN_GRANT: "NONE",
  MARKETPLACE_MEMBERSHIP_TOKEN_BACKFILL: "NONE",
  WORK_TOKEN_PRODUCT_STATUS,
};
