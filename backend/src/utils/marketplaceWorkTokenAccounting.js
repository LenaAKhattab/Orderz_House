/**
 * Pure Work Token accounting helpers — integer tokens only.
 * No floating-point money math. No DB access.
 */

const { createAppError } = require("./AppError");
const { WORK_TOKEN_ERROR_CODES, balanceEffectForEvent } = require("../constants/marketplaceWorkTokens");

/**
 * Parse and validate a positive integer token amount.
 * Rejects 0, negatives, NaN, Infinity, non-integers, unsafe ints.
 */
function assertPositiveTokenAmount(value, label = "amount") {
  if (typeof value === "string" && value.trim() !== "") {
    // Allow numeric strings that are exact integers
    if (!/^\d+$/.test(value.trim())) {
      throw createAppError(`${label} must be a positive integer token amount.`, 400, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
      });
    }
    value = Number(value.trim());
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw createAppError(`${label} must be a positive integer token amount.`, 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
    });
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    throw createAppError(`${label} exceeds safe integer range.`, 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
    });
  }
  return value;
}

function assertNonNegativeTokenAmount(value, label = "amount") {
  if (typeof value === "string" && value.trim() !== "" && /^\d+$/.test(value.trim())) {
    value = Number(value.trim());
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw createAppError(`${label} must be a non-negative integer token amount.`, 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
    });
  }
  return value;
}

function deltasForBalanceEffect(balanceEffect, amountTokens) {
  const amount = assertPositiveTokenAmount(amountTokens);
  switch (balanceEffect) {
    case "credit_available":
      return { availableDelta: amount, reservedDelta: 0 };
    case "reserve":
      return { availableDelta: -amount, reservedDelta: amount };
    case "release":
      return { availableDelta: amount, reservedDelta: -amount };
    case "consume_reserved":
      return { availableDelta: 0, reservedDelta: -amount };
    case "consume_available":
      return { availableDelta: -amount, reservedDelta: 0 };
    default:
      throw createAppError("Invalid Work Token balance effect.", 500, {
        publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
      });
  }
}

function applyDeltasToBalances(available, reserved, availableDelta, reservedDelta) {
  const nextAvailable = available + availableDelta;
  const nextReserved = reserved + reservedDelta;
  if (nextAvailable < 0 || nextReserved < 0) {
    throw createAppError("Insufficient Work Tokens for this operation.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
    });
  }
  return { available: nextAvailable, reserved: nextReserved };
}

/**
 * Replay ledger rows (ordered) to derive expected wallet balances.
 * Each row must include available_delta / reserved_delta (or camelCase).
 */
function deriveBalancesFromLedger(entries) {
  let available = 0;
  let reserved = 0;
  for (const row of entries) {
    const ad = Number(row.available_delta != null ? row.available_delta : row.availableDelta);
    const rd = Number(row.reserved_delta != null ? row.reserved_delta : row.reservedDelta);
    available += ad;
    reserved += rd;
    if (available < 0 || reserved < 0) {
      return {
        ok: false,
        available,
        reserved,
        reason: "negative_during_replay",
      };
    }
  }
  return { ok: true, available, reserved, reason: null };
}

function reservationIncreaseDelta(currentReserved, desiredTotal) {
  const current = assertNonNegativeTokenAmount(currentReserved, "currentReserved");
  const desired = assertPositiveTokenAmount(desiredTotal, "desiredTotal");
  if (desired < current) {
    throw createAppError(
      "Work Token reservation decrease is not allowed on this path.",
      409,
      {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
      },
    );
  }
  if (desired === current) {
    return 0;
  }
  return desired - current;
}

function mapPublicLedgerDirection(balanceEffect) {
  switch (balanceEffect) {
    case "credit_available":
    case "release":
      return "credit";
    case "reserve":
    case "consume_reserved":
    case "consume_available":
      return "debit";
    default:
      return "unknown";
  }
}

function eventTypeBalanceEffectOrThrow(eventType) {
  const effect = balanceEffectForEvent(eventType);
  if (!effect) {
    throw createAppError("Unsupported Work Token ledger event type.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  return effect;
}

module.exports = {
  assertPositiveTokenAmount,
  assertNonNegativeTokenAmount,
  deltasForBalanceEffect,
  applyDeltasToBalances,
  deriveBalancesFromLedger,
  reservationIncreaseDelta,
  mapPublicLedgerDirection,
  eventTypeBalanceEffectOrThrow,
};
