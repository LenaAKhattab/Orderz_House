/**
 * Marketplace Economy Settings — Phase 2 configuration foundation.
 *
 * CURRENT POLICY (this table/service) vs HISTORICAL TRANSACTION SNAPSHOT (future):
 * When engines activate, order/membership/ledger records MUST snapshot at write time:
 * - work_token_value_jod / bid_tokens_per_order_jod
 * - application_token_refund_percentage
 * - platform_commission_percentage
 * - cash_processing_fee_jod
 * - verification bonus amounts when granted
 * - Elite entitlement policy values when issued
 *
 * REAL ORDERS ONLY — never apply these policies to fake/training orders.
 * Phase 2: no wallets, bids, refunds, Elite, commission, or cash execution.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");

const SETTINGS_ID = 1;

/** Documented defaults — must match migration 135 seed/defaults. */
const MARKETPLACE_ECONOMY_DEFAULTS = Object.freeze({
  workTokenValueJod: 0.1,
  bidTokensPerOrderJod: 1,
  applicationTokenRefundPercentage: 70,
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
  workTokensEnabled: false,
  marketplaceCommissionEnabled: false,
  cashMembershipPaymentsEnabled: false,
  eliteEngineEnabled: false,
  verificationBonusesEnabled: false,
});

/** Values that must be snapshotted onto future financial/ledger rows (not CURRENT POLICY alone). */
const MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS = Object.freeze([
  "workTokenValueJod",
  "bidTokensPerOrderJod",
  "applicationTokenRefundPercentage",
  "platformCommissionPercentage",
  "cashProcessingFeeJod",
  "identityVerificationBonusTokens",
  "payoutMethodVerificationBonusTokens",
  "eliteDirectOrdersPerCycle",
  "eliteOfferDurationMinutes",
  "eliteCarryForwardDays",
  "eliteMaximumCarryForward",
]);

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

function mapRow(row) {
  if (!row) return { ...MARKETPLACE_ECONOMY_DEFAULTS };
  return {
    workTokenValueJod: Number(row.work_token_value_jod),
    bidTokensPerOrderJod: Number(row.bid_tokens_per_order_jod),
    applicationTokenRefundPercentage: Number(row.application_token_refund_percentage),
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
 * REAL-order-only gate for future callers.
 * Fake/training code must never invoke marketplace economy execution.
 */
function assertMarketplaceEconomyRealOrdersOnly(context = {}) {
  const source = String(context.orderSource || context.source || "").toLowerCase();
  if (
    source === "fake" ||
    source === "training" ||
    context.isFake === true ||
    context.isTraining === true
  ) {
    throw createAppError("Marketplace economy applies to REAL customer-funded orders only.", 403, {
      exposeToClient: true,
      publicCode: "MARKETPLACE_ECONOMY_REAL_ORDERS_ONLY",
    });
  }
}

function ensureExecutionEnginesDisabledInDefaults(settings) {
  return {
    ...settings,
    // Phase 2 / unset migration safety: unfinished engines stay off unless explicitly enabled later
    workTokensEnabled: Boolean(settings.workTokensEnabled),
    marketplaceCommissionEnabled: Boolean(settings.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(settings.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(settings.eliteEngineEnabled),
    verificationBonusesEnabled: Boolean(settings.verificationBonusesEnabled),
  };
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

function mergePatch(current, patch = {}) {
  const next = { ...current };
  const assign = (key, transform) => {
    if (patch[key] === undefined) return;
    next[key] = transform ? transform(patch[key]) : patch[key];
  };

  assign("workTokenValueJod", (v) => assertMoneyPositive("workTokenValueJod", v));
  assign("bidTokensPerOrderJod", (v) => assertMoneyPositive("bidTokensPerOrderJod", v));
  assign("applicationTokenRefundPercentage", (v) =>
    assertPercent("applicationTokenRefundPercentage", v),
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
  assign("workTokensEnabled", (v) => coerceBool(v));
  assign("marketplaceCommissionEnabled", (v) => coerceBool(v));
  assign("cashMembershipPaymentsEnabled", (v) => coerceBool(v));
  assign("eliteEngineEnabled", (v) => coerceBool(v));
  assign("verificationBonusesEnabled", (v) => coerceBool(v));

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
         bid_tokens_per_order_jod = $3,
         application_token_refund_percentage = $4,
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
         work_tokens_enabled = $17,
         marketplace_commission_enabled = $18,
         cash_membership_payments_enabled = $19,
         elite_engine_enabled = $20,
         verification_bonuses_enabled = $21,
         updated_by_user_id = $22,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        SETTINGS_ID,
        next.workTokenValueJod,
        next.bidTokensPerOrderJod,
        next.applicationTokenRefundPercentage,
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

/** Future helpers — document intent without executing economy. */
function isWorkTokensEngineActive(settings) {
  return Boolean(settings?.workTokensEnabled);
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

module.exports = {
  SETTINGS_ID,
  MARKETPLACE_ECONOMY_DEFAULTS,
  MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS,
  getMarketplaceEconomySettings,
  updateMarketplaceEconomySettings,
  assertMarketplaceEconomyRealOrdersOnly,
  isWorkTokensEngineActive,
  isEliteEngineActive,
  isMarketplaceCommissionActive,
  isCashMembershipPaymentsActive,
  isVerificationBonusesEngineActive,
  mapRow,
  mergePatch,
};
