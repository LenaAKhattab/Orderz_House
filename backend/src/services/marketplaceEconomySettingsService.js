/**
 * Marketplace Economy Settings — Phase 2 configuration foundation.
 *
 * CURRENT POLICY (this table/service) vs HISTORICAL TRANSACTION SNAPSHOT (future):
 * When engines activate, order/membership/ledger records MUST snapshot at write time:
 * - work_token_value_jod
 * - normal_application_tokens_per_order_jod / normal_application_token_refund_percentage
 * - priority_bid duration/min/max/strategy (when auction resolves)
 * - platform_commission_percentage / cash_processing_fee_jod
 * - verification bonus amounts when granted
 * - Elite entitlement policy values when issued
 * - fair assignment strategy + weights used at decision time
 *
 * REAL ECONOMIC ORDERS ONLY — never apply these policies to fake/training orders.
 * Sources may include customer / FAZ3AT / admin / other authorized real workflows.
 *
 * Priority Bid ≠ normal application:
 * - Priority Bid amount is chosen by the Freelancer (auction).
 * - Priority Bid losers RELEASE 100% reserved Tokens (never normal refund %).
 * - Wallet must support AVAILABLE / RESERVED / CONSUMED (not deduct-then-refund).
 *
 * Phase 2: configuration only — no wallets, auctions, fairness execution, Elite, commission, or cash.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  ASSIGNMENT_STRATEGIES,
  AWARD_RESET_POLICIES,
  ELIGIBLE_LOSS_EFFECTS,
  DECLINE_PRIORITY_EFFECTS,
  CANCEL_PRIORITY_EFFECTS,
  DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,
  isValidAssignmentStrategy,
} = require("../constants/marketplaceEconomy");

const SETTINGS_ID = 1;

/** Documented defaults — must match migration 135 seed/defaults. */
const MARKETPLACE_ECONOMY_DEFAULTS = Object.freeze({
  workTokenValueJod: 0.1,
  normalApplicationTokensPerOrderJod: 1,
  normalApplicationTokenRefundPercentage: 70,
  platformCommissionPercentage: 30,
  cashProcessingFeeJod: 5,
  identityVerificationBonusEnabled: true,
  identityVerificationBonusTokens: 10,
  payoutMethodVerificationBonusEnabled: true,
  payoutMethodVerificationBonusTokens: 10,
  eliteDirectOrdersPerCycle: 1,
  eliteOfferDurationMinutes: 10,
  eliteCarryForwardEnabled: true,
  eliteCarryForwardDays: 7,
  eliteMaximumCarryForward: 1,
  eliteDeclinesAffectCarryForward: false,

  priorityBiddingEnabled: false,
  priorityBidDurationMinutes: 30,
  priorityBidMinimumTokens: 1,
  priorityBidMaximumTokens: null,
  priorityBidShowHighest: true,
  priorityBidShowPosition: false,
  priorityBidAllowIncrease: true,
  priorityBidAllowDecrease: false,
  priorityBidAllowWithdrawal: false,
  priorityBidWithdrawalReleasesTokens: true,
  priorityBidWithdrawalReturnsUse: false,
  priorityBidReturnUseOnOrderCancel: true,
  priorityBidAutoAssignmentEnabled: true,
  priorityBidAssignmentStrategy: DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,

  fairWorkDistributionEnabled: false,
  assignmentStrategy: DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,
  fairnessWeight: 0,
  tokenWeight: 100,
  performanceWeight: 0,
  recencyWeight: 0,
  workloadWeight: 0,
  eligibleLossPriorityEffect: "INCREASE_PRIORITY",
  awardResetPolicy: "RESET_TO_ZERO",
  declinePriorityEffect: "NO_BOOST",
  freelancerCancelPriorityEffect: "NO_BOOST",

  workTokensEnabled: false,
  marketplaceCommissionEnabled: false,
  cashMembershipPaymentsEnabled: false,
  eliteEngineEnabled: false,
  verificationBonusesEnabled: false,
});

/** Values that must be snapshotted onto future financial/ledger/assignment rows. */
const MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS = Object.freeze([
  "workTokenValueJod",
  "normalApplicationTokensPerOrderJod",
  "normalApplicationTokenRefundPercentage",
  "platformCommissionPercentage",
  "cashProcessingFeeJod",
  "identityVerificationBonusTokens",
  "payoutMethodVerificationBonusTokens",
  "eliteDirectOrdersPerCycle",
  "eliteOfferDurationMinutes",
  "eliteCarryForwardDays",
  "eliteMaximumCarryForward",
  "priorityBidDurationMinutes",
  "priorityBidMinimumTokens",
  "priorityBidMaximumTokens",
  "priorityBidAssignmentStrategy",
  "assignmentStrategy",
  "fairnessWeight",
  "tokenWeight",
  "performanceWeight",
  "recencyWeight",
  "workloadWeight",
  "awardResetPolicy",
]);

/**
 * Dependencies that must exist before enabling Priority Bid / fairness engines in production.
 * Flagged for roadmap — do not fake with users.tokens.
 */
const MARKETPLACE_ECONOMY_ENGINE_DEPENDENCIES = Object.freeze({
  priorityBid: Object.freeze([
    "freelancer_marketplace_memberships",
    "marketplace_membership_cycles",
    "work_token_wallet (AVAILABLE/RESERVED/CONSUMED)",
    "work_token_ledger (PRIORITY_BID_RESERVE|INCREASE|RELEASE|CONSUME)",
    "priority auction tables + persistent end_at",
    "resolution worker/cron (DB timestamps, not setTimeout)",
  ]),
  fairWorkDistribution: Object.freeze([
    "fairness aggregate stats (category-aware)",
    "immutable assignment decision snapshots",
    "Admin explainability APIs (never Freelancer)",
  ]),
});

function toFiniteNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1" || value === "true";
}

function coerceBool(value) {
  if (typeof value === "boolean") return value;
  if (value === true || value === "true" || value === 1 || value === "1" || value === "t") return true;
  if (value === false || value === "false" || value === 0 || value === "0" || value === "f") return false;
  return Boolean(value);
}

function roundMoney3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function assertMoneyPositive(field, value, { max = 1000 } = {}) {
  const n = toFiniteNumber(value);
  if (n == null || n <= 0 || n > max) {
    throw createAppError(`${field} must be a positive amount (max ${max}).`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_MONEY",
    });
  }
  return roundMoney3(n);
}

function assertMoneyNonNegative(field, value, { max = 100000 } = {}) {
  const n = toFiniteNumber(value);
  if (n == null || n < 0 || n > max) {
    throw createAppError(`${field} must be >= 0 (max ${max}).`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_MONEY",
    });
  }
  return roundMoney3(n);
}

function assertPercent(field, value) {
  const n = toFiniteNumber(value);
  if (n == null || n < 0 || n > 100) {
    throw createAppError(`${field} must be between 0 and 100.`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_PERCENTAGE",
    });
  }
  return Math.round(n * 100) / 100;
}

function assertIntInRange(field, value, { min = 0, max = 1000000 } = {}) {
  const n = toFiniteNumber(value);
  if (n == null || !Number.isInteger(n) || n < min || n > max) {
    throw createAppError(`${field} must be an integer between ${min} and ${max}.`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_INTEGER",
    });
  }
  return n;
}

function assertNullableIntInRange(field, value, { min = 1, max = 100000000 } = {}) {
  if (value === null || value === undefined || value === "") return null;
  return assertIntInRange(field, value, { min, max });
}

function assertEnum(field, value, allowed) {
  const v = String(value || "").trim();
  if (!allowed.includes(v)) {
    throw createAppError(`${field} must be one of: ${allowed.join(", ")}.`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_ENUM",
    });
  }
  return v;
}

function mapRow(row) {
  if (!row) return { ...MARKETPLACE_ECONOMY_DEFAULTS };
  return {
    workTokenValueJod: Number(row.work_token_value_jod),
    normalApplicationTokensPerOrderJod: Number(row.normal_application_tokens_per_order_jod),
    normalApplicationTokenRefundPercentage: Number(row.normal_application_token_refund_percentage),
    platformCommissionPercentage: Number(row.platform_commission_percentage),
    cashProcessingFeeJod: Number(row.cash_processing_fee_jod),
    identityVerificationBonusEnabled: isTruthyFlag(row.identity_verification_bonus_enabled),
    identityVerificationBonusTokens: Number(row.identity_verification_bonus_tokens),
    payoutMethodVerificationBonusEnabled: isTruthyFlag(row.payout_method_verification_bonus_enabled),
    payoutMethodVerificationBonusTokens: Number(row.payout_method_verification_bonus_tokens),
    eliteDirectOrdersPerCycle: Number(row.elite_direct_orders_per_cycle),
    eliteOfferDurationMinutes: Number(row.elite_offer_duration_minutes),
    eliteCarryForwardEnabled: isTruthyFlag(row.elite_carry_forward_enabled),
    eliteCarryForwardDays: Number(row.elite_carry_forward_days),
    eliteMaximumCarryForward: Number(row.elite_maximum_carry_forward),
    eliteDeclinesAffectCarryForward: isTruthyFlag(row.elite_declines_affect_carry_forward),

    priorityBiddingEnabled: isTruthyFlag(row.priority_bidding_enabled),
    priorityBidDurationMinutes: Number(row.priority_bid_duration_minutes),
    priorityBidMinimumTokens: Number(row.priority_bid_minimum_tokens),
    priorityBidMaximumTokens:
      row.priority_bid_maximum_tokens == null ? null : Number(row.priority_bid_maximum_tokens),
    priorityBidShowHighest: isTruthyFlag(row.priority_bid_show_highest),
    priorityBidShowPosition: isTruthyFlag(row.priority_bid_show_position),
    priorityBidAllowIncrease: isTruthyFlag(row.priority_bid_allow_increase),
    priorityBidAllowDecrease: isTruthyFlag(row.priority_bid_allow_decrease),
    priorityBidAllowWithdrawal: isTruthyFlag(row.priority_bid_allow_withdrawal),
    priorityBidWithdrawalReleasesTokens: isTruthyFlag(row.priority_bid_withdrawal_releases_tokens),
    priorityBidWithdrawalReturnsUse: isTruthyFlag(row.priority_bid_withdrawal_returns_use),
    priorityBidReturnUseOnOrderCancel: isTruthyFlag(row.priority_bid_return_use_on_order_cancel),
    priorityBidAutoAssignmentEnabled: isTruthyFlag(row.priority_bid_auto_assignment_enabled),
    priorityBidAssignmentStrategy:
      row.priority_bid_assignment_strategy || DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,

    fairWorkDistributionEnabled: isTruthyFlag(row.fair_work_distribution_enabled),
    assignmentStrategy: row.assignment_strategy || DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,
    fairnessWeight: Number(row.fairness_weight),
    tokenWeight: Number(row.token_weight),
    performanceWeight: Number(row.performance_weight),
    recencyWeight: Number(row.recency_weight),
    workloadWeight: Number(row.workload_weight),
    eligibleLossPriorityEffect: row.eligible_loss_priority_effect || "INCREASE_PRIORITY",
    awardResetPolicy: row.award_reset_policy || "RESET_TO_ZERO",
    declinePriorityEffect: row.decline_priority_effect || "NO_BOOST",
    freelancerCancelPriorityEffect: row.freelancer_cancel_priority_effect || "NO_BOOST",

    workTokensEnabled: isTruthyFlag(row.work_tokens_enabled),
    marketplaceCommissionEnabled: isTruthyFlag(row.marketplace_commission_enabled),
    cashMembershipPaymentsEnabled: isTruthyFlag(row.cash_membership_payments_enabled),
    eliteEngineEnabled: isTruthyFlag(row.elite_engine_enabled),
    verificationBonusesEnabled: isTruthyFlag(row.verification_bonuses_enabled),
    updatedByUserId: row.updated_by_user_id != null ? String(row.updated_by_user_id) : null,
    updatedAt: row.updated_at || null,
  };
}

/**
 * REAL ECONOMIC ORDER gate for future callers.
 * Fake/training must never invoke marketplace economy execution.
 * Customer-created is NOT the only valid real source.
 */
function assertMarketplaceEconomyRealOrdersOnly(context = {}) {
  const source = String(context.orderSource || context.source || "").toLowerCase();
  if (
    source === "fake" ||
    source === "training" ||
    context.isFake === true ||
    context.isTraining === true ||
    context.kind === "fake"
  ) {
    throw createAppError(
      "Marketplace economy applies to REAL economic orders only (never fake/training).",
      403,
      {
        exposeToClient: true,
        publicCode: "MARKETPLACE_ECONOMY_REAL_ORDERS_ONLY",
      },
    );
  }
}

/**
 * Normalize legacy Phase 2 patch keys that incorrectly implied Priority Bid formula.
 * bidTokensPerOrderJod / applicationTokenRefundPercentage → normal application only.
 */
function normalizeLegacyPatchKeys(patch = {}) {
  const next = { ...patch };
  if (next.normalApplicationTokensPerOrderJod === undefined && next.bidTokensPerOrderJod !== undefined) {
    next.normalApplicationTokensPerOrderJod = next.bidTokensPerOrderJod;
  }
  if (
    next.normalApplicationTokenRefundPercentage === undefined &&
    next.applicationTokenRefundPercentage !== undefined
  ) {
    next.normalApplicationTokenRefundPercentage = next.applicationTokenRefundPercentage;
  }
  delete next.bidTokensPerOrderJod;
  delete next.applicationTokenRefundPercentage;
  return next;
}

function ensureExecutionEnginesDisabledInDefaults(settings) {
  return {
    ...settings,
    workTokensEnabled: Boolean(settings.workTokensEnabled),
    marketplaceCommissionEnabled: Boolean(settings.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(settings.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(settings.eliteEngineEnabled),
    verificationBonusesEnabled: Boolean(settings.verificationBonusesEnabled),
    priorityBiddingEnabled: Boolean(settings.priorityBiddingEnabled),
    fairWorkDistributionEnabled: Boolean(settings.fairWorkDistributionEnabled),
  };
}

function assertPriorityBidBounds(settings) {
  if (
    settings.priorityBidMaximumTokens != null &&
    settings.priorityBidMaximumTokens < settings.priorityBidMinimumTokens
  ) {
    throw createAppError("priorityBidMaximumTokens must be >= priorityBidMinimumTokens.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_PRIORITY_BID_BOUNDS",
    });
  }
}

async function ensureSettingsRow(client) {
  const runner = client || pool;
  await runner.query(
    `INSERT INTO marketplace_economy_settings (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [SETTINGS_ID],
  );
}

async function getMarketplaceEconomySettings(client) {
  const runner = client || pool;
  await ensureSettingsRow(runner);
  const { rows } = await runner.query(
    `SELECT * FROM marketplace_economy_settings WHERE id = $1 LIMIT 1`,
    [SETTINGS_ID],
  );
  return ensureExecutionEnginesDisabledInDefaults(mapRow(rows[0]));
}

function mergePatch(current, rawPatch = {}) {
  const patch = normalizeLegacyPatchKeys(rawPatch);
  const next = { ...current };
  const assign = (key, transform) => {
    if (patch[key] === undefined) return;
    next[key] = transform ? transform(patch[key]) : patch[key];
  };

  assign("workTokenValueJod", (v) => assertMoneyPositive("workTokenValueJod", v));
  assign("normalApplicationTokensPerOrderJod", (v) =>
    assertMoneyPositive("normalApplicationTokensPerOrderJod", v),
  );
  assign("normalApplicationTokenRefundPercentage", (v) =>
    assertPercent("normalApplicationTokenRefundPercentage", v),
  );
  assign("platformCommissionPercentage", (v) => assertPercent("platformCommissionPercentage", v));
  assign("cashProcessingFeeJod", (v) => assertMoneyNonNegative("cashProcessingFeeJod", v));
  assign("identityVerificationBonusEnabled", (v) => coerceBool(v));
  assign("identityVerificationBonusTokens", (v) =>
    assertIntInRange("identityVerificationBonusTokens", v, { min: 0, max: 1_000_000 }),
  );
  assign("payoutMethodVerificationBonusEnabled", (v) => coerceBool(v));
  assign("payoutMethodVerificationBonusTokens", (v) =>
    assertIntInRange("payoutMethodVerificationBonusTokens", v, { min: 0, max: 1_000_000 }),
  );
  assign("eliteDirectOrdersPerCycle", (v) =>
    assertIntInRange("eliteDirectOrdersPerCycle", v, { min: 0, max: 1000 }),
  );
  assign("eliteOfferDurationMinutes", (v) =>
    assertIntInRange("eliteOfferDurationMinutes", v, { min: 1, max: 10080 }),
  );
  assign("eliteCarryForwardEnabled", (v) => coerceBool(v));
  assign("eliteCarryForwardDays", (v) =>
    assertIntInRange("eliteCarryForwardDays", v, { min: 0, max: 3650 }),
  );
  assign("eliteMaximumCarryForward", (v) =>
    assertIntInRange("eliteMaximumCarryForward", v, { min: 0, max: 1000 }),
  );
  assign("eliteDeclinesAffectCarryForward", (v) => coerceBool(v));

  assign("priorityBiddingEnabled", (v) => coerceBool(v));
  assign("priorityBidDurationMinutes", (v) =>
    assertIntInRange("priorityBidDurationMinutes", v, { min: 1, max: 10080 }),
  );
  assign("priorityBidMinimumTokens", (v) =>
    assertIntInRange("priorityBidMinimumTokens", v, { min: 1, max: 100000000 }),
  );
  assign("priorityBidMaximumTokens", (v) =>
    assertNullableIntInRange("priorityBidMaximumTokens", v, { min: 1, max: 100000000 }),
  );
  assign("priorityBidShowHighest", (v) => coerceBool(v));
  assign("priorityBidShowPosition", (v) => coerceBool(v));
  assign("priorityBidAllowIncrease", (v) => coerceBool(v));
  assign("priorityBidAllowDecrease", (v) => coerceBool(v));
  assign("priorityBidAllowWithdrawal", (v) => coerceBool(v));
  assign("priorityBidWithdrawalReleasesTokens", (v) => coerceBool(v));
  assign("priorityBidWithdrawalReturnsUse", (v) => coerceBool(v));
  assign("priorityBidReturnUseOnOrderCancel", (v) => coerceBool(v));
  assign("priorityBidAutoAssignmentEnabled", (v) => coerceBool(v));
  assign("priorityBidAssignmentStrategy", (v) =>
    assertEnum("priorityBidAssignmentStrategy", v, ASSIGNMENT_STRATEGIES),
  );

  assign("fairWorkDistributionEnabled", (v) => coerceBool(v));
  assign("assignmentStrategy", (v) => assertEnum("assignmentStrategy", v, ASSIGNMENT_STRATEGIES));
  assign("fairnessWeight", (v) => assertPercent("fairnessWeight", v));
  assign("tokenWeight", (v) => assertPercent("tokenWeight", v));
  assign("performanceWeight", (v) => assertPercent("performanceWeight", v));
  assign("recencyWeight", (v) => assertPercent("recencyWeight", v));
  assign("workloadWeight", (v) => assertPercent("workloadWeight", v));
  assign("eligibleLossPriorityEffect", (v) =>
    assertEnum("eligibleLossPriorityEffect", v, ELIGIBLE_LOSS_EFFECTS),
  );
  assign("awardResetPolicy", (v) => assertEnum("awardResetPolicy", v, AWARD_RESET_POLICIES));
  assign("declinePriorityEffect", (v) =>
    assertEnum("declinePriorityEffect", v, DECLINE_PRIORITY_EFFECTS),
  );
  assign("freelancerCancelPriorityEffect", (v) =>
    assertEnum("freelancerCancelPriorityEffect", v, CANCEL_PRIORITY_EFFECTS),
  );

  assign("workTokensEnabled", (v) => coerceBool(v));
  assign("marketplaceCommissionEnabled", (v) => coerceBool(v));
  assign("cashMembershipPaymentsEnabled", (v) => coerceBool(v));
  assign("eliteEngineEnabled", (v) => coerceBool(v));
  assign("verificationBonusesEnabled", (v) => coerceBool(v));

  assertPriorityBidBounds(next);
  return next;
}

/**
 * Atomic merge-patch update of the singleton settings row.
 * @param {{ actorUserId?: number|string, patch: object }} input
 */
async function updateMarketplaceEconomySettings({ actorUserId, patch }) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw createAppError("Invalid settings patch.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_PATCH",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSettingsRow(client);
    const { rows } = await client.query(
      `SELECT * FROM marketplace_economy_settings WHERE id = $1 FOR UPDATE`,
      [SETTINGS_ID],
    );
    const current = mapRow(rows[0]);
    const next = mergePatch(current, patch);

    const { rows: updated } = await client.query(
      `UPDATE marketplace_economy_settings SET
         work_token_value_jod = $2,
         normal_application_tokens_per_order_jod = $3,
         normal_application_token_refund_percentage = $4,
         platform_commission_percentage = $5,
         cash_processing_fee_jod = $6,
         identity_verification_bonus_enabled = $7,
         identity_verification_bonus_tokens = $8,
         payout_method_verification_bonus_enabled = $9,
         payout_method_verification_bonus_tokens = $10,
         elite_direct_orders_per_cycle = $11,
         elite_offer_duration_minutes = $12,
         elite_carry_forward_enabled = $13,
         elite_carry_forward_days = $14,
         elite_maximum_carry_forward = $15,
         elite_declines_affect_carry_forward = $16,
         priority_bidding_enabled = $17,
         priority_bid_duration_minutes = $18,
         priority_bid_minimum_tokens = $19,
         priority_bid_maximum_tokens = $20,
         priority_bid_show_highest = $21,
         priority_bid_show_position = $22,
         priority_bid_allow_increase = $23,
         priority_bid_allow_decrease = $24,
         priority_bid_allow_withdrawal = $25,
         priority_bid_withdrawal_releases_tokens = $26,
         priority_bid_withdrawal_returns_use = $27,
         priority_bid_return_use_on_order_cancel = $28,
         priority_bid_auto_assignment_enabled = $29,
         priority_bid_assignment_strategy = $30,
         fair_work_distribution_enabled = $31,
         assignment_strategy = $32,
         fairness_weight = $33,
         token_weight = $34,
         performance_weight = $35,
         recency_weight = $36,
         workload_weight = $37,
         eligible_loss_priority_effect = $38,
         award_reset_policy = $39,
         decline_priority_effect = $40,
         freelancer_cancel_priority_effect = $41,
         work_tokens_enabled = $42,
         marketplace_commission_enabled = $43,
         cash_membership_payments_enabled = $44,
         elite_engine_enabled = $45,
         verification_bonuses_enabled = $46,
         updated_by_user_id = $47,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        SETTINGS_ID,
        next.workTokenValueJod,
        next.normalApplicationTokensPerOrderJod,
        next.normalApplicationTokenRefundPercentage,
        next.platformCommissionPercentage,
        next.cashProcessingFeeJod,
        next.identityVerificationBonusEnabled,
        next.identityVerificationBonusTokens,
        next.payoutMethodVerificationBonusEnabled,
        next.payoutMethodVerificationBonusTokens,
        next.eliteDirectOrdersPerCycle,
        next.eliteOfferDurationMinutes,
        next.eliteCarryForwardEnabled,
        next.eliteCarryForwardDays,
        next.eliteMaximumCarryForward,
        next.eliteDeclinesAffectCarryForward,
        next.priorityBiddingEnabled,
        next.priorityBidDurationMinutes,
        next.priorityBidMinimumTokens,
        next.priorityBidMaximumTokens,
        next.priorityBidShowHighest,
        next.priorityBidShowPosition,
        next.priorityBidAllowIncrease,
        next.priorityBidAllowDecrease,
        next.priorityBidAllowWithdrawal,
        next.priorityBidWithdrawalReleasesTokens,
        next.priorityBidWithdrawalReturnsUse,
        next.priorityBidReturnUseOnOrderCancel,
        next.priorityBidAutoAssignmentEnabled,
        next.priorityBidAssignmentStrategy,
        next.fairWorkDistributionEnabled,
        next.assignmentStrategy,
        next.fairnessWeight,
        next.tokenWeight,
        next.performanceWeight,
        next.recencyWeight,
        next.workloadWeight,
        next.eligibleLossPriorityEffect,
        next.awardResetPolicy,
        next.declinePriorityEffect,
        next.freelancerCancelPriorityEffect,
        next.workTokensEnabled,
        next.marketplaceCommissionEnabled,
        next.cashMembershipPaymentsEnabled,
        next.eliteEngineEnabled,
        next.verificationBonusesEnabled,
        actorUserId != null ? Number(actorUserId) : null,
      ],
    );
    await client.query("COMMIT");
    return ensureExecutionEnginesDisabledInDefaults(mapRow(updated[0]));
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

function isWorkTokensEngineActive(settings) {
  return Boolean(settings?.workTokensEnabled);
}

function isPriorityBiddingEngineActive(settings) {
  return Boolean(settings?.priorityBiddingEnabled) && Boolean(settings?.workTokensEnabled);
}

function isFairWorkDistributionActive(settings) {
  return Boolean(settings?.fairWorkDistributionEnabled);
}

function isEliteEngineActive(settings) {
  return Boolean(settings?.eliteEngineEnabled);
}

function isMarketplaceCommissionActive(settings) {
  return Boolean(settings?.marketplaceCommissionEnabled);
}

function isCashMembershipPaymentsActive(settings) {
  return Boolean(settings?.cashMembershipPaymentsEnabled);
}

function isVerificationBonusesEngineActive(settings) {
  return Boolean(settings?.verificationBonusesEnabled);
}

/**
 * Priority Bid loser release is always 100% of reserved Tokens.
 * Normal application refund % must never be used here.
 */
function getPriorityBidLoserReleasePercentage() {
  return 100;
}

module.exports = {
  SETTINGS_ID,
  MARKETPLACE_ECONOMY_DEFAULTS,
  MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS,
  MARKETPLACE_ECONOMY_ENGINE_DEPENDENCIES,
  getMarketplaceEconomySettings,
  updateMarketplaceEconomySettings,
  assertMarketplaceEconomyRealOrdersOnly,
  getPriorityBidLoserReleasePercentage,
  isWorkTokensEngineActive,
  isPriorityBiddingEngineActive,
  isFairWorkDistributionActive,
  isEliteEngineActive,
  isMarketplaceCommissionActive,
  isCashMembershipPaymentsActive,
  isVerificationBonusesEngineActive,
  isValidAssignmentStrategy,
  mapRow,
  mergePatch,
  normalizeLegacyPatchKeys,
};
