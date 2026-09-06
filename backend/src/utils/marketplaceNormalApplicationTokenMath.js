/**
 * Exact decimal → integer Work Token math for Phase 5 normal applications.
 * No IEEE-754 money accounting. Uses milliscale BigInt arithmetic.
 *
 * Cost: CEIL(budget × rate).
 * Refund: derived from economic SNAPSHOT only (never live settings).
 *   - snapshotted 100% + FULL → refund_tokens === token_cost
 *   - non-100 snapshots → FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED (no invented rule)
 */

const { createAppError } = require("./AppError");
const {
  WORK_TOKEN_ERROR_CODES,
  NORMAL_APPLICATION_REFUND_ROUNDING_FULL,
} = require("../constants/marketplaceWorkTokens");

const MILLI = 1000n;
const MICRO = 1_000_000n; // milli × milli

/**
 * Parse a positive finite money/rate value into millunits (×1000) as BigInt.
 * Accepts number or numeric string with up to 3 decimal places (extra digits rejected).
 */
function toPositiveMillis(value, label) {
  if (value === null || value === undefined || value === "") {
    throw createAppError(`${label} is required.`, 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
    });
  }
  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value <= 0) {
        throw createAppError(`${label} must be a positive amount.`, 400, {
          exposeToClient: true,
          publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
        });
      }
      const fixed = value.toFixed(3);
      if (!/^\d+\.\d{3}$/.test(fixed) || Number(fixed) !== Number(Number(fixed).toFixed(3))) {
        throw createAppError(`${label} must be a positive amount with at most 3 decimals.`, 400, {
          exposeToClient: true,
          publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
        });
      }
      return parseDecimalStringToMillis(fixed, label);
    }
    throw createAppError(`${label} must be a positive amount with at most 3 decimals.`, 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
    });
  }
  return parseDecimalStringToMillis(raw, label);
}

function parseDecimalStringToMillis(raw, label) {
  const [whole, frac = ""] = raw.split(".");
  const fracPadded = `${frac}000`.slice(0, 3);
  const millis = BigInt(whole) * MILLI + BigInt(fracPadded);
  if (millis <= 0n) {
    throw createAppError(`${label} must be greater than zero.`, 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
    });
  }
  return millis;
}

/**
 * CEIL(budgetJod × tokensPerOrderJod) → positive integer tokens.
 */
function ceilRequiredNormalApplicationTokens(budgetJod, tokensPerOrderJod) {
  const budgetMilli = toPositiveMillis(budgetJod, "orders.budget");
  const rateMilli = toPositiveMillis(tokensPerOrderJod, "normal_application_tokens_per_order_jod");
  const productMicro = budgetMilli * rateMilli;
  const tokens = (productMicro + MICRO - 1n) / MICRO;
  if (tokens < 1n) {
    throw createAppError("Calculated Work Token cost must be at least 1.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
    });
  }
  if (tokens > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw createAppError("Calculated Work Token cost exceeds safe range.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
    });
  }
  return Number(tokens);
}

/**
 * Validate economy-settings refund percentage (0–100, 2dp).
 */
function assertNormalApplicationRefundPercentage(value) {
  if (value === null || value === undefined || value === "") {
    throw createAppError("normalApplicationTokenRefundPercentage is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_PERCENTAGE",
    });
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw createAppError("normalApplicationTokenRefundPercentage must be between 0 and 100.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_PERCENTAGE",
    });
  }
  return Math.round(n * 100) / 100;
}

function isExactFullRefundPercentage(percentage) {
  return Number(percentage) === 100;
}

/**
 * Refund tokens from an immutable economic SNAPSHOT (never live settings).
 * Approved implemented rule: 100% + FULL → exact token_cost.
 * Non-100 snapshots fail closed until a future rounding policy is approved.
 */
function refundTokensFromEconomicSnapshot({ tokenCost, refundPercentage, refundRoundingRule }) {
  const cost = Number(tokenCost);
  if (!Number.isInteger(cost) || cost < 1 || cost > Number.MAX_SAFE_INTEGER) {
    throw createAppError("tokenCost must be a positive safe integer.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
    });
  }
  const pct = assertNormalApplicationRefundPercentage(refundPercentage);
  const rule = String(refundRoundingRule || "").trim();

  if (isExactFullRefundPercentage(pct) && rule === NORMAL_APPLICATION_REFUND_ROUNDING_FULL) {
    return cost;
  }

  throw createAppError(
    "Non-100% normal-application refund rounding is not approved yet.",
    409,
    {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED,
    },
  );
}

/** @deprecated Use refundTokensFromEconomicSnapshot */
function fullNormalApplicationRefundTokens(tokenCost) {
  return refundTokensFromEconomicSnapshot({
    tokenCost,
    refundPercentage: 100,
    refundRoundingRule: NORMAL_APPLICATION_REFUND_ROUNDING_FULL,
  });
}

module.exports = {
  toPositiveMillis,
  ceilRequiredNormalApplicationTokens,
  assertNormalApplicationRefundPercentage,
  isExactFullRefundPercentage,
  refundTokensFromEconomicSnapshot,
  fullNormalApplicationRefundTokens,
};
