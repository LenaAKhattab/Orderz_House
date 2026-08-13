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
  normalApplicationTokenRefundPercentage: 100,
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
  /** Phase B4 active product flag (Token auction uses priorityBiddingEnabled — LEGACY_DEPRECATED). */
  priorityApplicationBoostEnabled: false,
  /** Phase B5 Article Applications (independent; default OFF). */
  articleApplicationsEnabled: false,
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
  fairDistributionLookbackDays: 30,
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
  bidCreditsEnabled: false,
  bidCreditPurchasesEnabled: false,
  marketplaceCommissionEnabled: false,
  cashMembershipPaymentsEnabled: false,
  eliteEngineEnabled: false,
  verificationBonusesEnabled: false,

  // Phase E3 — Normal Order Admin limits (defaults match migration 155)
  normalOrderMinValueJod: 1,
  normalOrderMaxValueJod: 10000,
  normalOrderMinTargetApplicants: 1,
  normalOrderMaxTargetApplicants: 200,
  normalOrderDefaultTargetApplicants: 10,
  normalOrderMinBidCost: 1,
  normalOrderMaxBidCost: 20,
  normalOrderDefaultBidCost: 1,
  normalOrderMinApplicationPeriodHours: 1,
  normalOrderMaxApplicationPeriodHours: 720,
  normalOrderDefaultApplicationPeriodHours: 72,
  normalOrderMinExecutionDurationHours: 1,
  normalOrderMaxExecutionDurationHours: 2160,
  normalOrderDefaultExecutionDurationHours: 72,
  normalOrderDeadlineIncompleteTargetPolicy: "continue_with_received",
  normalOrderRefundClientCancelBeforeSelection: "full",
  normalOrderRefundSystemCancel: "full",
  normalOrderRefundDeadlineNoSelection: "full",
  normalOrderRefundNoFreelancerSelected: "full",
  normalOrderRefundFreelancerWithdrawal: "none",
  normalOrderRefundRejectedApplication: "none",
  normalOrderRefundLosingApplicant: "none",
  normalOrderRefundPostAwardCancel: "none",
  normalOrderBusinessTimezone: "Asia/Amman",
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
  "fairDistributionLookbackDays",
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

/**
 * Current product phase: only 100% normal-application refund is approved.
 * Partial percentages remain blocked until a non-100 rounding policy is defined
 * (FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED). DB column + snapshot architecture stay.
 */
const CURRENT_NORMAL_APPLICATION_REFUND_PERCENTAGE_ONLY = 100;

function assertNormalApplicationTokenRefundPercentageCurrentPolicy(value) {
  const n = assertPercent("normalApplicationTokenRefundPercentage", value);
  if (n !== CURRENT_NORMAL_APPLICATION_REFUND_PERCENTAGE_ONLY) {
    throw createAppError(
      "normalApplicationTokenRefundPercentage must be 100 until a non-100 refund rounding policy is approved.",
      400,
      {
        exposeToClient: true,
        publicCode: "FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED",
      },
    );
  }
  return n;
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
    priorityApplicationBoostEnabled:
      row.priority_application_boost_enabled == null
        ? false
        : isTruthyFlag(row.priority_application_boost_enabled),
    articleApplicationsEnabled:
      row.article_applications_enabled == null
        ? false
        : isTruthyFlag(row.article_applications_enabled),
    bidCreditPurchasesEnabled:
      row.bid_credit_purchases_enabled == null
        ? false
        : isTruthyFlag(row.bid_credit_purchases_enabled),
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
    fairDistributionLookbackDays:
      row.fair_distribution_lookback_days != null
        ? Number(row.fair_distribution_lookback_days)
        : 30,
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
    bidCreditsEnabled:
      row.bid_credits_enabled == null ? false : isTruthyFlag(row.bid_credits_enabled),
    marketplaceCommissionEnabled: isTruthyFlag(row.marketplace_commission_enabled),
    cashMembershipPaymentsEnabled: isTruthyFlag(row.cash_membership_payments_enabled),
    eliteEngineEnabled: isTruthyFlag(row.elite_engine_enabled),
    verificationBonusesEnabled: isTruthyFlag(row.verification_bonuses_enabled),

    normalOrderMinValueJod:
      row.normal_order_min_value_jod != null
        ? Number(row.normal_order_min_value_jod)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMinValueJod,
    normalOrderMaxValueJod:
      row.normal_order_max_value_jod != null
        ? Number(row.normal_order_max_value_jod)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMaxValueJod,
    normalOrderMinTargetApplicants:
      row.normal_order_min_target_applicants != null
        ? Number(row.normal_order_min_target_applicants)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMinTargetApplicants,
    normalOrderMaxTargetApplicants:
      row.normal_order_max_target_applicants != null
        ? Number(row.normal_order_max_target_applicants)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMaxTargetApplicants,
    normalOrderDefaultTargetApplicants:
      row.normal_order_default_target_applicants != null
        ? Number(row.normal_order_default_target_applicants)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderDefaultTargetApplicants,
    normalOrderMinBidCost:
      row.normal_order_min_bid_cost != null
        ? Number(row.normal_order_min_bid_cost)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMinBidCost,
    normalOrderMaxBidCost:
      row.normal_order_max_bid_cost != null
        ? Number(row.normal_order_max_bid_cost)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMaxBidCost,
    normalOrderDefaultBidCost:
      row.normal_order_default_bid_cost != null
        ? Number(row.normal_order_default_bid_cost)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderDefaultBidCost,
    normalOrderMinApplicationPeriodHours:
      row.normal_order_min_application_period_hours != null
        ? Number(row.normal_order_min_application_period_hours)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMinApplicationPeriodHours,
    normalOrderMaxApplicationPeriodHours:
      row.normal_order_max_application_period_hours != null
        ? Number(row.normal_order_max_application_period_hours)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMaxApplicationPeriodHours,
    normalOrderDefaultApplicationPeriodHours:
      row.normal_order_default_application_period_hours != null
        ? Number(row.normal_order_default_application_period_hours)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderDefaultApplicationPeriodHours,
    normalOrderMinExecutionDurationHours:
      row.normal_order_min_execution_duration_hours != null
        ? Number(row.normal_order_min_execution_duration_hours)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMinExecutionDurationHours,
    normalOrderMaxExecutionDurationHours:
      row.normal_order_max_execution_duration_hours != null
        ? Number(row.normal_order_max_execution_duration_hours)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderMaxExecutionDurationHours,
    normalOrderDefaultExecutionDurationHours:
      row.normal_order_default_execution_duration_hours != null
        ? Number(row.normal_order_default_execution_duration_hours)
        : MARKETPLACE_ECONOMY_DEFAULTS.normalOrderDefaultExecutionDurationHours,
    normalOrderDeadlineIncompleteTargetPolicy:
      row.normal_order_deadline_incomplete_target_policy ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderDeadlineIncompleteTargetPolicy,
    normalOrderRefundClientCancelBeforeSelection:
      row.normal_order_refund_client_cancel_before_selection ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundClientCancelBeforeSelection,
    normalOrderRefundSystemCancel:
      row.normal_order_refund_system_cancel ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundSystemCancel,
    normalOrderRefundDeadlineNoSelection:
      row.normal_order_refund_deadline_no_selection ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundDeadlineNoSelection,
    normalOrderRefundNoFreelancerSelected:
      row.normal_order_refund_no_freelancer_selected ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundNoFreelancerSelected,
    normalOrderRefundFreelancerWithdrawal:
      row.normal_order_refund_freelancer_withdrawal ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundFreelancerWithdrawal,
    normalOrderRefundRejectedApplication:
      row.normal_order_refund_rejected_application ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundRejectedApplication,
    normalOrderRefundLosingApplicant:
      row.normal_order_refund_losing_applicant ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundLosingApplicant,
    normalOrderRefundPostAwardCancel:
      row.normal_order_refund_post_award_cancel ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderRefundPostAwardCancel,
    normalOrderBusinessTimezone:
      row.normal_order_business_timezone ||
      MARKETPLACE_ECONOMY_DEFAULTS.normalOrderBusinessTimezone,

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
    bidCreditsEnabled: Boolean(settings.bidCreditsEnabled),
    bidCreditPurchasesEnabled: Boolean(settings.bidCreditPurchasesEnabled),
    marketplaceCommissionEnabled: Boolean(settings.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(settings.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(settings.eliteEngineEnabled),
    verificationBonusesEnabled: Boolean(settings.verificationBonusesEnabled),
    priorityBiddingEnabled: Boolean(settings.priorityBiddingEnabled),
    priorityApplicationBoostEnabled: Boolean(settings.priorityApplicationBoostEnabled),
    articleApplicationsEnabled: Boolean(settings.articleApplicationsEnabled),
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
    assertNormalApplicationTokenRefundPercentageCurrentPolicy(v),
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

  assign("priorityBiddingEnabled", (v) => {
    const enabled = coerceBool(v);
    // Phase B7A: legacy auction cannot be re-enabled via Admin API.
    if (enabled === true) {
      throw createAppError(
        "This economy engine cannot be enabled.",
        409,
        {
          exposeToClient: true,
          publicCode: "PRIORITY_BIDDING_ENGINE_DEPRECATED",
        },
      );
    }
    return false;
  });
  assign("priorityApplicationBoostEnabled", (v) => coerceBool(v));
  assign("articleApplicationsEnabled", (v) => coerceBool(v));
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
  assign("fairDistributionLookbackDays", (v) =>
    assertIntInRange("fairDistributionLookbackDays", v, { min: 1, max: 3650 }),
  );
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

  assign("workTokensEnabled", (v) => {
    const enabled = coerceBool(v);
    // Phase B7A: Work Tokens engine cannot be re-enabled; Bids use bidCreditsEnabled.
    if (enabled === true) {
      throw createAppError(
        "This economy engine cannot be enabled.",
        409,
        {
          exposeToClient: true,
          publicCode: "WORK_TOKENS_ENGINE_DEPRECATED",
        },
      );
    }
    return false;
  });
  assign("bidCreditsEnabled", (v) => coerceBool(v));
  assign("bidCreditPurchasesEnabled", (v) => coerceBool(v));
  assign("marketplaceCommissionEnabled", (v) => coerceBool(v));
  assign("cashMembershipPaymentsEnabled", (v) => coerceBool(v));
  assign("eliteEngineEnabled", (v) => coerceBool(v));
  assign("verificationBonusesEnabled", (v) => {
    const enabled = coerceBool(v);
    // Phase B7B: verification Work Token rewards cannot be re-enabled.
    if (enabled === true) {
      throw createAppError(
        "This economy engine cannot be enabled.",
        409,
        {
          exposeToClient: true,
          publicCode: "VERIFICATION_WORK_TOKEN_REWARDS_DEPRECATED",
        },
      );
    }
    return false;
  });

  // Phase E3 Normal Order Admin limits
  assign("normalOrderMinValueJod", (v) =>
    assertMoneyPositive("normalOrderMinValueJod", v, { max: 1_000_000 }),
  );
  assign("normalOrderMaxValueJod", (v) =>
    assertMoneyPositive("normalOrderMaxValueJod", v, { max: 1_000_000 }),
  );
  assign("normalOrderMinTargetApplicants", (v) =>
    assertIntInRange("normalOrderMinTargetApplicants", v, { min: 1, max: 10000 }),
  );
  assign("normalOrderMaxTargetApplicants", (v) =>
    assertIntInRange("normalOrderMaxTargetApplicants", v, { min: 1, max: 10000 }),
  );
  assign("normalOrderDefaultTargetApplicants", (v) =>
    assertIntInRange("normalOrderDefaultTargetApplicants", v, { min: 1, max: 10000 }),
  );
  assign("normalOrderMinBidCost", (v) =>
    assertIntInRange("normalOrderMinBidCost", v, { min: 1, max: 1000 }),
  );
  assign("normalOrderMaxBidCost", (v) =>
    assertIntInRange("normalOrderMaxBidCost", v, { min: 1, max: 1000 }),
  );
  assign("normalOrderDefaultBidCost", (v) =>
    assertIntInRange("normalOrderDefaultBidCost", v, { min: 1, max: 1000 }),
  );
  assign("normalOrderMinApplicationPeriodHours", (v) =>
    assertIntInRange("normalOrderMinApplicationPeriodHours", v, { min: 1, max: 8760 }),
  );
  assign("normalOrderMaxApplicationPeriodHours", (v) =>
    assertIntInRange("normalOrderMaxApplicationPeriodHours", v, { min: 1, max: 8760 }),
  );
  assign("normalOrderDefaultApplicationPeriodHours", (v) =>
    assertIntInRange("normalOrderDefaultApplicationPeriodHours", v, { min: 1, max: 8760 }),
  );
  assign("normalOrderMinExecutionDurationHours", (v) =>
    assertIntInRange("normalOrderMinExecutionDurationHours", v, { min: 1, max: 87600 }),
  );
  assign("normalOrderMaxExecutionDurationHours", (v) =>
    assertIntInRange("normalOrderMaxExecutionDurationHours", v, { min: 1, max: 87600 }),
  );
  assign("normalOrderDefaultExecutionDurationHours", (v) =>
    assertIntInRange("normalOrderDefaultExecutionDurationHours", v, { min: 1, max: 87600 }),
  );
  assign("normalOrderDeadlineIncompleteTargetPolicy", (v) =>
    assertEnum("normalOrderDeadlineIncompleteTargetPolicy", v, [
      "continue_with_received",
      "cancel_and_refund",
      "require_admin_review",
    ]),
  );
  const refundModes = ["full", "none"];
  assign("normalOrderRefundClientCancelBeforeSelection", (v) =>
    assertEnum("normalOrderRefundClientCancelBeforeSelection", v, refundModes),
  );
  assign("normalOrderRefundSystemCancel", (v) =>
    assertEnum("normalOrderRefundSystemCancel", v, refundModes),
  );
  assign("normalOrderRefundDeadlineNoSelection", (v) =>
    assertEnum("normalOrderRefundDeadlineNoSelection", v, refundModes),
  );
  assign("normalOrderRefundNoFreelancerSelected", (v) =>
    assertEnum("normalOrderRefundNoFreelancerSelected", v, refundModes),
  );
  assign("normalOrderRefundFreelancerWithdrawal", (v) =>
    assertEnum("normalOrderRefundFreelancerWithdrawal", v, refundModes),
  );
  assign("normalOrderRefundRejectedApplication", (v) =>
    assertEnum("normalOrderRefundRejectedApplication", v, refundModes),
  );
  assign("normalOrderRefundLosingApplicant", (v) =>
    assertEnum("normalOrderRefundLosingApplicant", v, refundModes),
  );
  assign("normalOrderRefundPostAwardCancel", (v) =>
    assertEnum("normalOrderRefundPostAwardCancel", v, refundModes),
  );
  assign("normalOrderBusinessTimezone", (v) => {
    const s = String(v || "").trim();
    if (!s || s.length > 64) {
      throw createAppError("Invalid normalOrderBusinessTimezone.", 400, { exposeToClient: true });
    }
    return s;
  });

  if (next.normalOrderMaxValueJod < next.normalOrderMinValueJod) {
    throw createAppError("normalOrderMaxValueJod must be >= min.", 400, { exposeToClient: true });
  }
  if (next.normalOrderMaxTargetApplicants < next.normalOrderMinTargetApplicants) {
    throw createAppError("normalOrderMaxTargetApplicants must be >= min.", 400, {
      exposeToClient: true,
    });
  }
  if (
    next.normalOrderDefaultTargetApplicants < next.normalOrderMinTargetApplicants ||
    next.normalOrderDefaultTargetApplicants > next.normalOrderMaxTargetApplicants
  ) {
    throw createAppError("normalOrderDefaultTargetApplicants out of Admin range.", 400, {
      exposeToClient: true,
    });
  }
  if (next.normalOrderMaxBidCost < next.normalOrderMinBidCost) {
    throw createAppError("normalOrderMaxBidCost must be >= min.", 400, { exposeToClient: true });
  }
  if (
    next.normalOrderDefaultBidCost < next.normalOrderMinBidCost ||
    next.normalOrderDefaultBidCost > next.normalOrderMaxBidCost
  ) {
    throw createAppError("normalOrderDefaultBidCost out of Admin range.", 400, {
      exposeToClient: true,
    });
  }

  assertPriorityBidBounds(next);

  // Phase 7 v1: HYBRID numeric weighting is not approved — fail closed.
  if (next.assignmentStrategy === "HYBRID" || next.priorityBidAssignmentStrategy === "HYBRID") {
    throw createAppError(
      "HYBRID Fair Distribution weighting policy is not defined for Phase 7 v1.",
      409,
      {
        exposeToClient: true,
        publicCode: "FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED",
      },
    );
  }

  return next;
}

async function hasFairDistributionLookbackColumn(client) {
  const { rows } = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_economy_settings'
        AND column_name = 'fair_distribution_lookback_days'
      LIMIT 1`,
  );
  return Boolean(rows[0]);
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
    // Migration 142 adds lookback column — omit until applied so Admin updates stay safe.
    const lookbackReady = await hasFairDistributionLookbackColumn(client);
    const lookbackSql = lookbackReady ? `fair_distribution_lookback_days = $33,` : "";
    const params = [
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
    ];
    if (lookbackReady) {
      params.push(next.fairDistributionLookbackDays);
    }
    params.push(
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
    );
    // When lookback column missing, shift $33+ down by one (fairness_weight becomes $33).
    const p = (n) => (lookbackReady ? n : n - 1);
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
         ${lookbackSql}
         fairness_weight = $${p(34)},
         token_weight = $${p(35)},
         performance_weight = $${p(36)},
         recency_weight = $${p(37)},
         workload_weight = $${p(38)},
         eligible_loss_priority_effect = $${p(39)},
         award_reset_policy = $${p(40)},
         decline_priority_effect = $${p(41)},
         freelancer_cancel_priority_effect = $${p(42)},
         work_tokens_enabled = $${p(43)},
         marketplace_commission_enabled = $${p(44)},
         cash_membership_payments_enabled = $${p(45)},
         elite_engine_enabled = $${p(46)},
         verification_bonuses_enabled = $${p(47)},
         updated_by_user_id = $${p(48)},
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      params,
    );
    // Phase B1/B4 additive flags (columns may be absent pre-migration).
    if (await hasEconomyFlagColumn(client, "bid_credits_enabled")) {
      await client.query(
        `UPDATE marketplace_economy_settings
            SET bid_credits_enabled = $2, updated_at = NOW()
          WHERE id = $1`,
        [SETTINGS_ID, Boolean(next.bidCreditsEnabled)],
      );
    }
    if (await hasEconomyFlagColumn(client, "priority_application_boost_enabled")) {
      await client.query(
        `UPDATE marketplace_economy_settings
            SET priority_application_boost_enabled = $2, updated_at = NOW()
          WHERE id = $1`,
        [SETTINGS_ID, Boolean(next.priorityApplicationBoostEnabled)],
      );
    }
    if (await hasEconomyFlagColumn(client, "article_applications_enabled")) {
      await client.query(
        `UPDATE marketplace_economy_settings
            SET article_applications_enabled = $2, updated_at = NOW()
          WHERE id = $1`,
        [SETTINGS_ID, Boolean(next.articleApplicationsEnabled)],
      );
    }
    if (await hasEconomyFlagColumn(client, "bid_credit_purchases_enabled")) {
      await client.query(
        `UPDATE marketplace_economy_settings
            SET bid_credit_purchases_enabled = $2, updated_at = NOW()
          WHERE id = $1`,
        [SETTINGS_ID, Boolean(next.bidCreditPurchasesEnabled)],
      );
    }

    // Phase E3 Normal Order Admin limits (columns absent pre-155 → skip).
    if (await hasEconomyFlagColumn(client, "normal_order_default_bid_cost")) {
      await client.query(
        `UPDATE marketplace_economy_settings SET
           normal_order_min_value_jod = $2,
           normal_order_max_value_jod = $3,
           normal_order_min_target_applicants = $4,
           normal_order_max_target_applicants = $5,
           normal_order_default_target_applicants = $6,
           normal_order_min_bid_cost = $7,
           normal_order_max_bid_cost = $8,
           normal_order_default_bid_cost = $9,
           normal_order_min_application_period_hours = $10,
           normal_order_max_application_period_hours = $11,
           normal_order_default_application_period_hours = $12,
           normal_order_min_execution_duration_hours = $13,
           normal_order_max_execution_duration_hours = $14,
           normal_order_default_execution_duration_hours = $15,
           normal_order_deadline_incomplete_target_policy = $16,
           normal_order_refund_client_cancel_before_selection = $17,
           normal_order_refund_system_cancel = $18,
           normal_order_refund_deadline_no_selection = $19,
           normal_order_refund_no_freelancer_selected = $20,
           normal_order_refund_freelancer_withdrawal = $21,
           normal_order_refund_rejected_application = $22,
           normal_order_refund_losing_applicant = $23,
           normal_order_refund_post_award_cancel = $24,
           normal_order_business_timezone = $25,
           updated_at = NOW()
         WHERE id = $1`,
        [
          SETTINGS_ID,
          next.normalOrderMinValueJod,
          next.normalOrderMaxValueJod,
          next.normalOrderMinTargetApplicants,
          next.normalOrderMaxTargetApplicants,
          next.normalOrderDefaultTargetApplicants,
          next.normalOrderMinBidCost,
          next.normalOrderMaxBidCost,
          next.normalOrderDefaultBidCost,
          next.normalOrderMinApplicationPeriodHours,
          next.normalOrderMaxApplicationPeriodHours,
          next.normalOrderDefaultApplicationPeriodHours,
          next.normalOrderMinExecutionDurationHours,
          next.normalOrderMaxExecutionDurationHours,
          next.normalOrderDefaultExecutionDurationHours,
          next.normalOrderDeadlineIncompleteTargetPolicy,
          next.normalOrderRefundClientCancelBeforeSelection,
          next.normalOrderRefundSystemCancel,
          next.normalOrderRefundDeadlineNoSelection,
          next.normalOrderRefundNoFreelancerSelected,
          next.normalOrderRefundFreelancerWithdrawal,
          next.normalOrderRefundRejectedApplication,
          next.normalOrderRefundLosingApplicant,
          next.normalOrderRefundPostAwardCancel,
          next.normalOrderBusinessTimezone,
        ],
      );
    }

    const { rows: finalRows } = await client.query(
      `SELECT * FROM marketplace_economy_settings WHERE id = $1`,
      [SETTINGS_ID],
    );
    await client.query("COMMIT");
    return ensureExecutionEnginesDisabledInDefaults(mapRow(finalRows[0] || updated[0]));
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

async function hasEconomyFlagColumn(client, columnName) {
  const { rows } = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'marketplace_economy_settings'
        AND column_name = $1
      LIMIT 1`,
    [columnName],
  );
  return Boolean(rows[0]);
}

function isWorkTokensEngineActive(settings) {
  return Boolean(settings?.workTokensEnabled);
}

function isBidCreditsEngineActive(settings) {
  return Boolean(settings?.bidCreditsEnabled);
}

/** Phase B6 Bid package commercial purchases (requires Bid Credits engine separately). */
function isBidCreditPurchasesEngineActive(settings) {
  return Boolean(settings?.bidCreditPurchasesEnabled);
}

/** LEGACY_DEPRECATED Phase 6 Token auction — requires WT engine. Keep OFF. */
function isPriorityBiddingEngineActive(settings) {
  return Boolean(settings?.priorityBiddingEnabled) && Boolean(settings?.workTokensEnabled);
}

/** Phase B4 active Priority Application Boost (independent of Work Tokens). */
function isPriorityApplicationBoostEngineActive(settings) {
  return Boolean(settings?.priorityApplicationBoostEnabled);
}

/** Phase B5 Article Applications (independent of Bid Credits / Priority Boost). */
function isArticleApplicationsEngineActive(settings) {
  return Boolean(settings?.articleApplicationsEnabled);
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

/**
 * Active Admin API projection — omits legacy Work Token / Priority Auction knobs.
 * Full mapRow remains for internal services and historical audit.
 */
function mapActiveEconomySettingsForAdminApi(settings) {
  const s = settings && typeof settings === "object" ? settings : {};
  return {
    platformCommissionPercentage: s.platformCommissionPercentage,
    cashProcessingFeeJod: s.cashProcessingFeeJod,
    eliteDirectOrdersPerCycle: s.eliteDirectOrdersPerCycle,
    eliteOfferDurationMinutes: s.eliteOfferDurationMinutes,
    eliteCarryForwardEnabled: Boolean(s.eliteCarryForwardEnabled),
    eliteCarryForwardDays: s.eliteCarryForwardDays,
    eliteMaximumCarryForward: s.eliteMaximumCarryForward,
    eliteDeclinesAffectCarryForward: Boolean(s.eliteDeclinesAffectCarryForward),
    priorityApplicationBoostEnabled: Boolean(s.priorityApplicationBoostEnabled),
    articleApplicationsEnabled: Boolean(s.articleApplicationsEnabled),
    bidCreditPurchasesEnabled: Boolean(s.bidCreditPurchasesEnabled),
    bidCreditsEnabled: Boolean(s.bidCreditsEnabled),
    fairWorkDistributionEnabled: Boolean(s.fairWorkDistributionEnabled),
    assignmentStrategy: s.assignmentStrategy,
    fairDistributionLookbackDays: s.fairDistributionLookbackDays,
    fairnessWeight: s.fairnessWeight,
    tokenWeight: s.tokenWeight,
    performanceWeight: s.performanceWeight,
    recencyWeight: s.recencyWeight,
    workloadWeight: s.workloadWeight,
    eligibleLossPriorityEffect: s.eligibleLossPriorityEffect,
    awardResetPolicy: s.awardResetPolicy,
    declinePriorityEffect: s.declinePriorityEffect,
    freelancerCancelPriorityEffect: s.freelancerCancelPriorityEffect,
    marketplaceCommissionEnabled: Boolean(s.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(s.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(s.eliteEngineEnabled),

    // Phase E3 — Normal Order Admin configuration (round-trip)
    normalOrderMinValueJod: s.normalOrderMinValueJod,
    normalOrderMaxValueJod: s.normalOrderMaxValueJod,
    normalOrderMinTargetApplicants: s.normalOrderMinTargetApplicants,
    normalOrderMaxTargetApplicants: s.normalOrderMaxTargetApplicants,
    normalOrderDefaultTargetApplicants: s.normalOrderDefaultTargetApplicants,
    normalOrderMinBidCost: s.normalOrderMinBidCost,
    normalOrderMaxBidCost: s.normalOrderMaxBidCost,
    normalOrderDefaultBidCost: s.normalOrderDefaultBidCost,
    normalOrderMinApplicationPeriodHours: s.normalOrderMinApplicationPeriodHours,
    normalOrderMaxApplicationPeriodHours: s.normalOrderMaxApplicationPeriodHours,
    normalOrderDefaultApplicationPeriodHours: s.normalOrderDefaultApplicationPeriodHours,
    normalOrderMinExecutionDurationHours: s.normalOrderMinExecutionDurationHours,
    normalOrderMaxExecutionDurationHours: s.normalOrderMaxExecutionDurationHours,
    normalOrderDefaultExecutionDurationHours: s.normalOrderDefaultExecutionDurationHours,
    normalOrderDeadlineIncompleteTargetPolicy: s.normalOrderDeadlineIncompleteTargetPolicy,
    normalOrderRefundClientCancelBeforeSelection: s.normalOrderRefundClientCancelBeforeSelection,
    normalOrderRefundSystemCancel: s.normalOrderRefundSystemCancel,
    normalOrderRefundDeadlineNoSelection: s.normalOrderRefundDeadlineNoSelection,
    normalOrderRefundNoFreelancerSelected: s.normalOrderRefundNoFreelancerSelected,
    normalOrderRefundFreelancerWithdrawal: s.normalOrderRefundFreelancerWithdrawal,
    normalOrderRefundRejectedApplication: s.normalOrderRefundRejectedApplication,
    normalOrderRefundLosingApplicant: s.normalOrderRefundLosingApplicant,
    normalOrderRefundPostAwardCancel: s.normalOrderRefundPostAwardCancel,
    normalOrderBusinessTimezone: s.normalOrderBusinessTimezone,

    updatedByUserId: s.updatedByUserId != null ? String(s.updatedByUserId) : null,
    updatedAt: s.updatedAt || null,
  };
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
  isBidCreditsEngineActive,
  isBidCreditPurchasesEngineActive,
  isPriorityBiddingEngineActive,
  isPriorityApplicationBoostEngineActive,
  isArticleApplicationsEngineActive,
  isFairWorkDistributionActive,
  isEliteEngineActive,
  isMarketplaceCommissionActive,
  isCashMembershipPaymentsActive,
  isVerificationBonusesEngineActive,
  isValidAssignmentStrategy,
  mapRow,
  mapActiveEconomySettingsForAdminApi,
  mergePatch,
  normalizeLegacyPatchKeys,
  CURRENT_NORMAL_APPLICATION_REFUND_PERCENTAGE_ONLY,
  assertNormalApplicationTokenRefundPercentageCurrentPolicy,
};
