/**
 * Adapter: existing بيت المونة workflow × Marketplace Membership + unified Bid wallet.
 * Does not replace pantryService winner/assignment/delivery logic.
 * Consume Bids on successful pantry_bids insert (not Article reservation).
 * Runtime states: LEGACY (flag off) | INTEGRATED (flag+engine+schema) | PAUSED (fail-closed).
 * Flag ON + Bid engine OFF never falls back to free legacy apply.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL,
  PANTRY_BID_REFUND_RESTORES_DAILY_CAP,
  PANTRY_VALID_APPLICATION_STATUSES,
  PANTRY_MEMBERSHIP_BID_ERROR_CODES,
  pantryApplyBlockMessage,
  resolvePantryRefundMode,
  resolvePantryApplicationBidCost,
  resolvePantryProjectValue,
  resolvePantryMembershipBidIntegrationState,
  PANTRY_INTEGRATION_MODES,
} = require("../constants/pantryMembershipBid");
const { evaluateProjectValueEligibility } = require("./marketplaceMembershipEligibilityService");
const { isBenefitUsableStatus } = require("../constants/marketplaceMemberships");
const {
  getMarketplaceEconomySettings,
  isBidCreditsEngineActive,
} = require("./marketplaceEconomySettingsService");
const {
  NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS,
} = require("../constants/marketplaceBidCredits");
const accounting = require("./marketplaceBidCreditAccountingService");
const { marketplaceBidCreditsSchemaReady } = require("../utils/marketplaceBidCreditsSchema");

let pantryEconomySchemaCache = null;

async function pantryEconomySchemaReady(db = pool) {
  if (pantryEconomySchemaCache === true) return true;
  if (pantryEconomySchemaCache === false) return false;
  try {
    const { rows } = await db.query(
      `SELECT
         to_regclass('public.pantry_application_bid_credit_economics') AS econ,
         to_regclass('public.freelancer_starter_pantry_opportunity') AS starter,
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'pantry_requests'
              AND column_name = 'application_bid_cost'
         ) AS has_cost_col`,
    );
    pantryEconomySchemaCache =
      Boolean(rows[0]?.econ) && Boolean(rows[0]?.starter) && Boolean(rows[0]?.has_cost_col);
  } catch {
    pantryEconomySchemaCache = false;
  }
  return pantryEconomySchemaCache;
}

function clearPantryEconomySchemaCache() {
  pantryEconomySchemaCache = null;
}

/**
 * Canonical runtime resolver. Schema presence is never sufficient.
 * LEGACY / INTEGRATED / PAUSED. Flag ON + engine OFF = PAUSED (no legacy fallback).
 */
async function getPantryMembershipBidIntegrationState(db = pool) {
  let pantryMembershipBidIntegrationEnabled = false;
  let bidCreditsEnabled = false;
  let settingsReadable = true;
  try {
    const settings = await getMarketplaceEconomySettings(db);
    pantryMembershipBidIntegrationEnabled = Boolean(settings?.pantryMembershipBidIntegrationEnabled);
    bidCreditsEnabled = isBidCreditsEngineActive(settings);
  } catch {
    settingsReadable = false;
  }

  let runtimeReady = true;
  if (settingsReadable && pantryMembershipBidIntegrationEnabled) {
    try {
      runtimeReady =
        (await pantryEconomySchemaReady(db)) && (await marketplaceBidCreditsSchemaReady(db));
    } catch {
      runtimeReady = false;
    }
  }

  return resolvePantryMembershipBidIntegrationState({
    pantryMembershipBidIntegrationEnabled,
    bidCreditsEnabled,
    runtimeReady,
    settingsReadable,
  });
}

async function isPantryMembershipBidIntegrationActive(db = pool) {
  const state = await getPantryMembershipBidIntegrationState(db);
  return state.active;
}

function throwPantryIntegrationPaused() {
  httpPantryBlock(
    PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_INTEGRATION_TEMPORARILY_UNAVAILABLE,
    503,
  );
}

async function assertIntegratedPantryRuntimeReady(client) {
  const state = await getPantryMembershipBidIntegrationState(client);
  if (state.mode === PANTRY_INTEGRATION_MODES.INTEGRATED) {
    if (!(await pantryEconomySchemaReady(client)) || !(await marketplaceBidCreditsSchemaReady(client))) {
      throwPantryIntegrationPaused();
    }
    return state;
  }
  throwPantryIntegrationPaused();
}

function httpPantryBlock(code, status, message, meta) {
  const err = createAppError(message || pantryApplyBlockMessage(code, meta), status, {
    exposeToClient: true,
    publicCode: code,
  });
  if (meta) err.meta = meta;
  throw err;
}

function parseEligibleTiers(raw) {
  if (raw == null || raw === "") return null;
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = String(raw)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(arr) || !arr.length) return null;
  const cleaned = arr.map((t) => String(t || "").toLowerCase()).filter(Boolean);
  return cleaned.length ? cleaned : null;
}

async function countValidPantryApplicants(client, requestId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c
       FROM pantry_bids
      WHERE pantry_request_id = $1
        AND status = ANY($2::text[])`,
    [Number(requestId), PANTRY_VALID_APPLICATION_STATUSES],
  );
  return Number(rows[0]?.c) || 0;
}

function applicantCapacityView(requestRow, currentCount) {
  const target =
    requestRow?.target_applicant_count != null ? Number(requestRow.target_applicant_count) : null;
  const current = Number(currentCount) || 0;
  const remaining =
    target != null && Number.isInteger(target) ? Math.max(0, target - current) : null;
  return {
    currentApplicantCount: current,
    targetApplicantCount: target,
    remainingApplicantSlots: remaining,
    applicationsClosedAt: requestRow?.applications_closed_at || null,
    applicationsCloseReason: requestRow?.applications_close_reason || null,
  };
}

async function loadUsableMembershipPlan(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT p.tier_code, p.project_min_value_jod, p.max_real_order_value_jod,
            p.unlimited_real_order_value, m.status
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
      WHERE m.freelancer_user_id = $1
        AND m.is_current = TRUE
      LIMIT 1`,
    [Number(freelancerUserId)],
  );
  const row = rows[0];
  if (!row || !isBenefitUsableStatus(row.status)) return null;
  return {
    tierCode: String(row.tier_code || "").toLowerCase(),
    projectMinValueJod: row.project_min_value_jod != null ? Number(row.project_min_value_jod) : 1,
    maxRealOrderValueJod:
      row.max_real_order_value_jod != null ? Number(row.max_real_order_value_jod) : null,
    unlimitedRealOrderValue: Boolean(row.unlimited_real_order_value),
  };
}

async function isStarterOpportunityConsumed(client, freelancerUserId) {
  if (!(await isPantryMembershipBidIntegrationActive(client))) return false;
  if (!(await pantryEconomySchemaReady(client))) return false;
  const { rows } = await client.query(
    `SELECT consumed_at FROM freelancer_starter_pantry_opportunity
      WHERE freelancer_user_id = $1 LIMIT 1`,
    [Number(freelancerUserId)],
  );
  return Boolean(rows[0]?.consumed_at);
}

async function consumeStarterOpportunity({ client, freelancerUserId, pantryRequestId, pantryBidId }) {
  const state = await getPantryMembershipBidIntegrationState(client);
  if (state.mode === PANTRY_INTEGRATION_MODES.LEGACY) {
    return { consumed: false, skipped: true, reason: "legacy_mode" };
  }
  if (state.mode !== PANTRY_INTEGRATION_MODES.INTEGRATED) {
    throwPantryIntegrationPaused();
  }
  if (!(await pantryEconomySchemaReady(client))) {
    throwPantryIntegrationPaused();
  }
  const { rows } = await client.query(
    `INSERT INTO freelancer_starter_pantry_opportunity (
       freelancer_user_id, consumed_at, pantry_request_id, pantry_bid_id, updated_at
     ) VALUES ($1, NOW(), $2, $3, NOW())
     ON CONFLICT (freelancer_user_id)
     DO UPDATE SET
       consumed_at = NOW(),
       pantry_request_id = EXCLUDED.pantry_request_id,
       pantry_bid_id = EXCLUDED.pantry_bid_id,
       updated_at = NOW()
     WHERE freelancer_starter_pantry_opportunity.consumed_at IS NULL
     RETURNING *`,
    [Number(freelancerUserId), Number(pantryRequestId), Number(pantryBidId)],
  );
  if (!rows[0]) {
    httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_STARTER_OPPORTUNITY_USED, 409);
  }
  return { consumed: true, skipped: false };
}

function evaluatePantryEligibility({ requestRow, membershipPlan, starterConsumed, now = new Date() }) {
  const bidCost = resolvePantryApplicationBidCost(requestRow);
  const reasons = [];
  if (!membershipPlan) {
    reasons.push({
      code: PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_MEMBERSHIP_REQUIRED,
      message: pantryApplyBlockMessage(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_MEMBERSHIP_REQUIRED),
    });
    return { eligible: false, bidCost, reasons, starterOpportunityRemaining: 0 };
  }

  const tier = membershipPlan.tierCode;
  const pantryTiers = parseEligibleTiers(
    requestRow.eligible_tier_codes ?? requestRow.eligibleTierCodes,
  );
  if (pantryTiers && !pantryTiers.includes(tier)) {
    reasons.push({
      code: PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_PLAN_NOT_ELIGIBLE,
      message: pantryApplyBlockMessage(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_PLAN_NOT_ELIGIBLE),
    });
  }

  const projectValue = resolvePantryProjectValue(requestRow);
  if (projectValue != null) {
    const valueGate = evaluateProjectValueEligibility(membershipPlan, projectValue);
    if (!valueGate.eligible) {
      reasons.push({
        code: PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_PROJECT_VALUE_BLOCKED,
        message: pantryApplyBlockMessage(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_PROJECT_VALUE_BLOCKED),
        meta: valueGate,
      });
    }
  }

  const isStarter = tier === "starter";
  let starterRemaining = STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL;
  if (isStarter) {
    if (starterConsumed) {
      starterRemaining = 0;
      reasons.push({
        code: PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_STARTER_OPPORTUNITY_USED,
        message: pantryApplyBlockMessage(
          PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_STARTER_OPPORTUNITY_USED,
        ),
      });
    }
  } else {
    starterRemaining = null;
  }

  if (requestRow.applications_closed_at) {
    reasons.push({
      code: PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATIONS_CLOSED,
      message: pantryApplyBlockMessage(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATIONS_CLOSED),
    });
  }
  const deadline = requestRow.application_deadline_at || requestRow.applicationDeadlineAt;
  if (deadline && new Date(deadline) <= new Date(now)) {
    reasons.push({
      code: PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATION_DEADLINE_PASSED,
      message: pantryApplyBlockMessage(
        PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATION_DEADLINE_PASSED,
      ),
    });
  }

  return {
    eligible: reasons.length === 0,
    bidCost,
    reasons,
    isStarter,
    starterOpportunityRemaining: starterRemaining,
    projectValue,
    tierCode: tier,
  };
}

async function maybeStampDeadlineClose(client, requestRow, { now = new Date() } = {}) {
  if (!requestRow?.application_deadline_at) return requestRow;
  if (requestRow.applications_closed_at) return requestRow;
  if (new Date(requestRow.application_deadline_at) > new Date(now)) return requestRow;
  const { rows } = await client.query(
    `UPDATE pantry_requests
        SET applications_closed_at = COALESCE(applications_closed_at, $2::timestamptz),
            applications_close_reason = COALESCE(applications_close_reason, 'deadline_reached'),
            updated_at = NOW()
      WHERE id = $1
        AND applications_closed_at IS NULL
        AND status = 'open_for_bids'
      RETURNING *`,
    [Number(requestRow.id), new Date(now).toISOString()],
  );
  return rows[0] || requestRow;
}

async function assertPantryAcceptsApplications(client, requestRow, { now = new Date() } = {}) {
  if (String(requestRow.status) !== "open_for_bids") {
    httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATIONS_CLOSED, 409);
  }
  const stamped = await maybeStampDeadlineClose(client, requestRow, { now });
  if (stamped.applications_closed_at) {
    const reason = stamped.applications_close_reason;
    if (reason === "deadline_reached") {
      httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATION_DEADLINE_PASSED, 409);
    }
    httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATIONS_CLOSED, 409);
  }
  if (
    stamped.application_deadline_at &&
    new Date(stamped.application_deadline_at) <= new Date(now)
  ) {
    httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICATION_DEADLINE_PASSED, 409);
  }
  const target =
    stamped.target_applicant_count != null ? Number(stamped.target_applicant_count) : null;
  if (target != null && Number.isInteger(target)) {
    const count = await countValidPantryApplicants(client, stamped.id);
    if (count >= target) {
      httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICANT_TARGET_REACHED, 409);
    }
  }
  return stamped;
}

async function maybeAutoClosePantryOnTargetReached(client, requestRow, { now = new Date() } = {}) {
  const target =
    requestRow.target_applicant_count != null ? Number(requestRow.target_applicant_count) : null;
  if (target == null || !Number.isInteger(target)) {
    return { closed: false };
  }
  const count = await countValidPantryApplicants(client, requestRow.id);
  if (count < target) return { closed: false, currentApplicantCount: count };
  const { rows } = await client.query(
    `UPDATE pantry_requests
        SET applications_closed_at = COALESCE(applications_closed_at, $2::timestamptz),
            applications_close_reason = COALESCE(applications_close_reason, 'target_reached'),
            updated_at = NOW()
      WHERE id = $1
        AND applications_closed_at IS NULL
        AND status = 'open_for_bids'
      RETURNING *`,
    [Number(requestRow.id), new Date(now).toISOString()],
  );
  return { closed: Boolean(rows[0]), currentApplicantCount: count, request: rows[0] || null };
}

async function assertMembershipAndPantryEligibility(client, freelancerUserId, requestRow, { now } = {}) {
  const eligibility = require("./marketplaceMembershipEligibilityService");
  try {
    await eligibility.assertMarketplaceVerificationComplete(client, freelancerUserId);
  } catch (err) {
    if (
      err?.publicCode === "MEMBERSHIP_VERIFICATION_REQUIRED" ||
      err?.publicCode === "MEMBERSHIP_VERIFICATION_FEE_REQUIRED" ||
      err?.publicCode === "MEMBERSHIP_VERIFICATION_FEE_UNAVAILABLE"
    ) {
      httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_VERIFICATION_REQUIRED, 403);
    }
    throw err;
  }

  let membershipPlan = null;
  try {
    membershipPlan = await loadUsableMembershipPlan(client, freelancerUserId);
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") membershipPlan = null;
    else throw err;
  }

  const starterConsumed =
    membershipPlan?.tierCode === "starter"
      ? await isStarterOpportunityConsumed(client, freelancerUserId)
      : false;
  const evaluated = evaluatePantryEligibility({
    requestRow,
    membershipPlan,
    starterConsumed,
    now,
  });
  if (!evaluated.eligible) {
    const first = evaluated.reasons[0];
    httpPantryBlock(first.code, 403, first.message, first.meta);
  }
  return { membershipPlan, evaluated };
}

async function assertSpendableBidsIfEngineOn(client, freelancerUserId, requestRow, { now = new Date() } = {}) {
  const settings = await getMarketplaceEconomySettings(client);
  if (!isBidCreditsEngineActive(settings)) {
    throwPantryIntegrationPaused();
  }
  if (!(await marketplaceBidCreditsSchemaReady(client))) {
    throwPantryIntegrationPaused();
  }
  const bidCost = resolvePantryApplicationBidCost(requestRow);
  const available = await accounting.sumAvailableBidCredits({
    client,
    freelancerUserId: Number(freelancerUserId),
    now,
  });
  if (available < bidCost) {
    httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_INSUFFICIENT_BIDS, 409, null, {
      required: bidCost,
    });
  }
  return { skipped: false, available, bidCost };
}

async function chargePantryApplicationBids({
  client,
  freelancerUserId,
  pantryRequestId,
  pantryBidId,
  requestRow,
  actorUserId,
  now = new Date(),
}) {
  const settings = await getMarketplaceEconomySettings(client);
  const bidCost = resolvePantryApplicationBidCost(requestRow);
  if (!isBidCreditsEngineActive(settings)) {
    throwPantryIntegrationPaused();
  }
  if (!(await marketplaceBidCreditsSchemaReady(client)) || !(await pantryEconomySchemaReady(client))) {
    throwPantryIntegrationPaused();
  }

  const existing = await client.query(
    `SELECT * FROM pantry_application_bid_credit_economics
      WHERE pantry_bid_id = $1
      LIMIT 1`,
    [Number(pantryBidId)],
  );
  if (existing.rows[0]?.charge_status === "charged") {
    return {
      charged: false,
      skipped: true,
      reason: "already_charged",
      bidCreditCost: Number(existing.rows[0].bid_credit_cost) || bidCost,
    };
  }

  const dailySpend = require("./marketplaceMembershipDailyBidSpendService");
  try {
    await dailySpend.assertAndConsumeDailyBidSpend({
      client,
      freelancerUserId: Number(freelancerUserId),
      amount: bidCost,
      now,
    });
  } catch (dailyErr) {
    if (dailyErr?.code === "42P01") {
      throwPantryIntegrationPaused();
    } else if (dailyErr?.publicCode === "MEMBERSHIP_DAILY_BID_LIMIT_REACHED") {
      httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_DAILY_BID_LIMIT, 409);
    } else {
      throw dailyErr;
    }
  }

  const idempotencyKey = `pantry_application_bid_consume:bid:${Number(pantryBidId)}`;
  let consume;
  try {
    consume = await accounting.consumeBidCreditsFefo({
      client,
      freelancerUserId: Number(freelancerUserId),
      amount: bidCost,
      idempotencyKey,
      referenceType: "pantry_bid",
      referenceId: String(pantryBidId),
      reason: "pantry_application_bid_consume",
      actorUserId: actorUserId != null ? Number(actorUserId) : Number(freelancerUserId),
      eventType: "PANTRY_APPLICATION_BID_CONSUME",
      metadata: {
        pantryRequestId: String(pantryRequestId),
        pantryBidId: String(pantryBidId),
        bidCreditCost: bidCost,
      },
      now,
    });
  } catch (err) {
    if (err?.publicCode === "INSUFFICIENT_BID_CREDITS") {
      httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_INSUFFICIENT_BIDS, 409, null, {
        required: bidCost,
      });
    }
    throw err;
  }

  const allocations = consume.allocations || consume.fefoAllocations || [];
  try {
    await client.query(
      `INSERT INTO pantry_application_bid_credit_economics (
         pantry_bid_id, pantry_request_id, freelancer_user_id, bid_credit_cost,
         charge_status, refund_status, consume_ledger_entry_id, primary_grant_id,
         idempotency_key, fefo_allocations, charged_at
       ) VALUES ($1,$2,$3,$4,'charged','none',$5,$6,$7,$8::jsonb,NOW())
       ON CONFLICT (pantry_bid_id) DO NOTHING`,
      [
        Number(pantryBidId),
        Number(pantryRequestId),
        Number(freelancerUserId),
        bidCost,
        consume.entry?.id || consume.ledgerEntryId || null,
        allocations[0]?.grantId || null,
        idempotencyKey,
        JSON.stringify(allocations),
      ],
    );
  } catch (econErr) {
    if (econErr?.code !== "42P10" && econErr?.code !== "42703") throw econErr;
    await client.query(
      `INSERT INTO pantry_application_bid_credit_economics (
         pantry_bid_id, pantry_request_id, freelancer_user_id, bid_credit_cost,
         charge_status, refund_status, consume_ledger_entry_id, primary_grant_id,
         idempotency_key, fefo_allocations, charged_at
       ) VALUES ($1,$2,$3,$4,'charged','none',$5,$6,$7,$8::jsonb,NOW())
       ON CONFLICT (pantry_request_id, freelancer_user_id) DO NOTHING`,
      [
        Number(pantryBidId),
        Number(pantryRequestId),
        Number(freelancerUserId),
        bidCost,
        consume.entry?.id || consume.ledgerEntryId || null,
        allocations[0]?.grantId || null,
        idempotencyKey,
        JSON.stringify(allocations),
      ],
    );
  }

  return {
    charged: true,
    skipped: false,
    bidCreditCost: bidCost,
    consumed: consume.consumed,
    allocations,
  };
}

/**
 * After INSERT into pantry_bids inside the locked txn.
 * Overflow uses count > target so the last valid slot is kept.
 * Charge / daily / starter all run after overflow; any throw rolls the txn back.
 */
async function finalizePantryApplicationAfterInsert({
  client,
  requestRow,
  freelancerUserId,
  pantryBidId,
  now = new Date(),
}) {
  await assertIntegratedPantryRuntimeReady(client);
  const count = await countValidPantryApplicants(client, requestRow.id);
  const target =
    requestRow.target_applicant_count != null ? Number(requestRow.target_applicant_count) : null;
  if (target != null && Number.isInteger(target) && count > target) {
    httpPantryBlock(PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_APPLICANT_TARGET_REACHED, 409);
  }

  const charge = await chargePantryApplicationBids({
    client,
    freelancerUserId,
    pantryRequestId: requestRow.id,
    pantryBidId,
    requestRow,
    actorUserId: freelancerUserId,
    now,
  });

  let membershipPlan = null;
  try {
    membershipPlan = await loadUsableMembershipPlan(client, freelancerUserId);
  } catch (err) {
    if (err?.code !== "42P01" && err?.code !== "42703") throw err;
  }

  let starterConsumed = false;
  if (membershipPlan?.tierCode === "starter") {
    const starter = await consumeStarterOpportunity({
      client,
      freelancerUserId,
      pantryRequestId: requestRow.id,
      pantryBidId,
    });
    starterConsumed = Boolean(starter.consumed);
  }

  const closeOut = await maybeAutoClosePantryOnTargetReached(client, requestRow, { now });
  return {
    charge,
    starterConsumed,
    closeOut,
    capacity: applicantCapacityView(closeOut.request || requestRow, count),
  };
}

async function stampAssignedIntakeClosed(client, requestId, { now = new Date() } = {}) {
  const state = await getPantryMembershipBidIntegrationState(client);
  if (state.mode === PANTRY_INTEGRATION_MODES.LEGACY) {
    return { closed: false, skipped: true, reason: "legacy_mode" };
  }
  if (!(await pantryEconomySchemaReady(client))) {
    return { closed: false, skipped: true, reason: "schema_not_ready" };
  }
  await client.query(
    `UPDATE pantry_requests
        SET applications_closed_at = COALESCE(applications_closed_at, $2::timestamptz),
            applications_close_reason = COALESCE(applications_close_reason, 'assigned'),
            updated_at = NOW()
      WHERE id = $1
        AND applications_closed_at IS NULL`,
    [Number(requestId), new Date(now).toISOString()],
  );
  return { closed: true };
}

async function buildFreelancerPantryApplyView(client, requestRow, freelancerUserId, { now = new Date() } = {}) {
  const bidCost = resolvePantryApplicationBidCost(requestRow);
  let membershipPlan = null;
  try {
    membershipPlan = await loadUsableMembershipPlan(client, freelancerUserId);
  } catch (err) {
    if (err?.code !== "42P01" && err?.code !== "42703") throw err;
  }
  const starterConsumed =
    membershipPlan?.tierCode === "starter"
      ? await isStarterOpportunityConsumed(client, freelancerUserId)
      : false;
  const evaluated = evaluatePantryEligibility({
    requestRow,
    membershipPlan,
    starterConsumed,
    now,
  });
  const count = await countValidPantryApplicants(client, requestRow.id);
  const capacity = applicantCapacityView(requestRow, count);
  const first = evaluated.reasons[0] || null;
  return {
    applicationBidCost: bidCost,
    applicantCapacity: capacity,
    applyEligible: evaluated.eligible,
    applyBlockCode: first?.code || null,
    applyBlockMessage: first ? pantryApplyBlockMessage(first.code, { required: bidCost }) : null,
    starterOpportunity:
      membershipPlan?.tierCode === "starter"
        ? {
            total: STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL,
            remaining: evaluated.starterOpportunityRemaining,
            available: evaluated.starterOpportunityRemaining === 1,
            used: starterConsumed,
            labelAvailable: "فرصة بيت المونة متاحة",
            labelHint: "متاحة لمرة واحدة بعد توثيق الحساب",
            labelUsed: "فرصة بيت المونة الخاصة بباقة STARTER مستخدمة",
          }
        : null,
    eligibleTierCodes: parseEligibleTiers(requestRow.eligible_tier_codes),
  };
}

async function refundOnePantryEconomics({ client, locked, reason, actorUserId, now = new Date() }) {
  if (locked.refund_status === "refunded") {
    return { refunded: false, idempotent: true, refundQty: Number(locked.bid_credit_cost) || 0 };
  }
  if (locked.charge_status !== "charged") {
    return { refunded: false, skipped: true, reason: "not_charged" };
  }
  const allocations = Array.isArray(locked.fefo_allocations) ? locked.fefo_allocations : [];
  const totalQty =
    Number(locked.bid_credit_cost) || allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
  const refundKey =
    locked.refund_idempotency_key ||
    `pantry_application_bid_refund:${Number(locked.pantry_request_id)}:freelancer:${Number(locked.freelancer_user_id)}`;
  const instant = new Date(now);

  let restoredTotal = 0;
  const restoreDetails = [];
  for (const slice of allocations) {
    const grantId = Number(slice.grantId || slice.grant_id);
    const amount = Number(slice.amount);
    if (!Number.isInteger(grantId) || grantId < 1 || !Number.isInteger(amount) || amount < 1) continue;
    const { rows: grantRows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
      [grantId],
    );
    const grant = grantRows[0];
    if (!grant || new Date(grant.expires_at) <= instant) continue;
    const { rows: updatedGrant } = await client.query(
      `UPDATE marketplace_bid_credit_grants
          SET amount_consumed = amount_consumed - $2,
              status = CASE
                WHEN status IN ('exhausted', 'active')
                  AND (amount_granted - (amount_consumed - $2) - amount_expired) > 0
                THEN 'active'
                ELSE status
              END,
              exhausted_at = CASE
                WHEN (amount_granted - (amount_consumed - $2) - amount_expired) > 0 THEN NULL
                ELSE exhausted_at
              END,
              updated_at = NOW()
        WHERE id = $1 AND amount_consumed >= $2
        RETURNING *`,
      [grant.id, amount],
    );
    if (!updatedGrant[0]) continue;
    restoredTotal += amount;
    restoreDetails.push({ grantId: String(grant.id), amount });
  }

  const compensatingQty = totalQty - restoredTotal;
  let refundMode = "same_bucket_restore";
  let compensatingGrantId = null;
  if (compensatingQty > 0) {
    refundMode = restoredTotal === 0 ? "compensating_grant_30d" : "mixed_restore_and_compensating";
    const expiresAt = new Date(
      instant.getTime() + NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS * 86400000,
    );
    const created = await accounting.createBidCreditGrant({
      client,
      freelancerUserId: locked.freelancer_user_id,
      sourceType: "pantry_application_refund",
      amount: compensatingQty,
      expiresAt,
      eventType: "PANTRY_APPLICATION_BID_REFUND",
      idempotencyKey: `${refundKey}:comp`,
      reason,
      actorUserId,
      referenceType: "pantry_application_bid_credit_economics",
      referenceId: String(locked.id),
      metadata: { pantryRequestId: String(locked.pantry_request_id), totalQty, compensatingQty },
      grantedAt: instant,
    });
    compensatingGrantId = created.grant?.id ? Number(created.grant.id) : null;
  }

  const { rows: ledgerRows } = await client.query(
    `INSERT INTO marketplace_bid_credit_ledger_entries (
       freelancer_user_id, grant_id, event_type, amount, direction,
       reference_type, reference_id, idempotency_key, reason, actor_user_id, metadata
     ) VALUES (
       $1, $2, 'PANTRY_APPLICATION_BID_REFUND', $3, 1,
       'pantry_application_bid_credit_economics', $4, $5, $6, $7, $8::jsonb
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      locked.freelancer_user_id,
      restoreDetails[0] ? Number(restoreDetails[0].grantId) : compensatingGrantId,
      totalQty,
      String(locked.id),
      refundKey,
      reason,
      actorUserId || null,
      JSON.stringify({ totalQty, restoreDetails, compensatingQty, refundMode }),
    ],
  );

  const { rows: marked } = await client.query(
    `UPDATE pantry_application_bid_credit_economics
        SET refund_status = 'refunded',
            refund_mode = $2,
            refund_ledger_entry_id = COALESCE($3, refund_ledger_entry_id),
            compensating_grant_id = COALESCE($4, compensating_grant_id),
            refund_idempotency_key = COALESCE(refund_idempotency_key, $5),
            refunded_at = COALESCE(refunded_at, NOW()),
            updated_at = NOW()
      WHERE id = $1 AND charge_status = 'charged' AND refund_status = 'none'
      RETURNING *`,
    [
      Number(locked.id),
      refundMode,
      ledgerRows[0]?.id || null,
      compensatingGrantId,
      refundKey,
    ],
  );
  if (!marked[0]) return { refunded: false, idempotent: true, refundQty: totalQty };

  void PANTRY_BID_REFUND_RESTORES_DAILY_CAP;

  try {
    const notificationService = require("./notificationService");
    await notificationService.createIfNotExists(
      {
        recipientUserId: Number(locked.freelancer_user_id),
        recipientRole: "freelancer",
        type: "pantry.bid.refunded",
        title: "تم استرجاع العروض المتاحة",
        message: `تم استرجاع ${totalQty} عرضاً متاحاً بعد إغلاق طلب بيت المونة دون إسناد.`,
        entityType: "pantry_request",
        entityId: Number(locked.pantry_request_id),
        link: "/dashboard/freelancer/pantry",
        priority: "high",
        metadata: { refundQty: totalQty, reason },
      },
      `pantry_app_bid_refund_${locked.pantry_request_id}_${locked.freelancer_user_id}`,
      client,
    );
  } catch {
    /* ignore */
  }

  return { refunded: true, idempotent: false, refundQty: totalQty };
}

async function refundChargedPantryApplicationsForOutcome({
  client,
  pantryRequestId,
  outcomeKey,
  actorUserId = null,
  reason = null,
}) {
  const mode = resolvePantryRefundMode(outcomeKey);
  if (mode !== "full") return { refundedCount: 0, skipped: true, mode };
  const state = await getPantryMembershipBidIntegrationState(client);
  if (state.mode === PANTRY_INTEGRATION_MODES.LEGACY) {
    return { refundedCount: 0, skipped: true, reason: "legacy_mode", mode };
  }
  if (!(await pantryEconomySchemaReady(client))) return { refundedCount: 0, schemaReady: false };
  const { rows } = await client.query(
    `SELECT * FROM pantry_application_bid_credit_economics
      WHERE pantry_request_id = $1 AND charge_status = 'charged' AND refund_status = 'none'
      FOR UPDATE`,
    [Number(pantryRequestId)],
  );
  let refundedCount = 0;
  for (const locked of rows) {
    // eslint-disable-next-line no-await-in-loop
    const out = await refundOnePantryEconomics({
      client,
      locked,
      reason: reason || outcomeKey,
      actorUserId,
    });
    if (out.refunded) refundedCount += 1;
  }
  return { refundedCount, mode };
}

module.exports = {
  pantryEconomySchemaReady,
  clearPantryEconomySchemaCache,
  getPantryMembershipBidIntegrationState,
  isPantryMembershipBidIntegrationActive,
  throwPantryIntegrationPaused,
  assertIntegratedPantryRuntimeReady,
  parseEligibleTiers,
  countValidPantryApplicants,
  applicantCapacityView,
  evaluatePantryEligibility,
  assertPantryAcceptsApplications,
  maybeAutoClosePantryOnTargetReached,
  maybeStampDeadlineClose,
  finalizePantryApplicationAfterInsert,
  assertMembershipAndPantryEligibility,
  assertSpendableBidsIfEngineOn,
  stampAssignedIntakeClosed,
  buildFreelancerPantryApplyView,
  refundChargedPantryApplicationsForOutcome,
  resolvePantryRefundMode,
  consumeStarterOpportunity,
  isStarterOpportunityConsumed,
  loadUsableMembershipPlan,
  STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL,
  PANTRY_BID_REFUND_RESTORES_DAILY_CAP,
  PANTRY_MEMBERSHIP_BID_ERROR_CODES,
};
