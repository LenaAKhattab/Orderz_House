/**
 * Decimal-safe JOD → Bid pool calculation (Phase D1).
 * Uses integer milli-JOD (3 decimal places) — no floating-point money math.
 */
const { createAppError } = require("./AppError");
const { BID_POOL_ERROR_CODES } = require("../constants/marketplaceBidDistributionPools");

const JOD_MILLIS_PER_UNIT = 1000;

/**
 * Parse a JOD major amount to integer milli-JOD.
 * Accepts number or decimal string. Max 3 fractional digits.
 */
function parseJodToMillis(value, { label = "amount", minExclusive = false, publicCode = BID_POOL_ERROR_CODES.INVALID_POOL_BUDGET } = {}) {
  const raw = value == null ? "" : String(value).trim();
  if (/^\d+\.\d{4,}$/.test(raw)) {
    throw createAppError(`${label} may have at most 3 decimal places.`, 400, {
      exposeToClient: true,
      publicCode,
    });
  }
  if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
    throw createAppError(`${label} is not a valid JOD amount.`, 400, {
      exposeToClient: true,
      publicCode,
    });
  }
  const [wholePart, fracPart = ""] = raw.split(".");
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole) || whole < 0) {
    throw createAppError(`${label} is out of range.`, 400, {
      exposeToClient: true,
      publicCode,
    });
  }
  const fracPadded = `${fracPart}000`.slice(0, 3);
  const frac = Number(fracPadded);
  const millis = whole * JOD_MILLIS_PER_UNIT + frac;
  if (minExclusive && millis <= 0) {
    throw createAppError(`${label} must be greater than 0.`, 400, {
      exposeToClient: true,
      publicCode,
    });
  }
  if (!Number.isSafeInteger(millis)) {
    throw createAppError(`${label} is out of safe integer range.`, 400, {
      exposeToClient: true,
      publicCode,
    });
  }
  return millis;
}

function millisToJodString(millis) {
  const n = Number(millis);
  if (!Number.isInteger(n) || n < 0) {
    throw createAppError("Invalid milli-JOD amount.", 500);
  }
  const whole = Math.floor(n / JOD_MILLIS_PER_UNIT);
  const frac = String(n % JOD_MILLIS_PER_UNIT).padStart(3, "0");
  return `${whole}.${frac}`;
}

/**
 * totalBids = floor(budget / unitPrice)
 * monetaryRemainder = budget - totalBids * unitPrice
 * BID_POOL_TOTAL_SOURCE = SERVER_CALCULATION
 */
function calculatePoolBidsFromBudget({ budgetJod, bidUnitPriceJod }) {
  const budgetMillis = parseJodToMillis(budgetJod, {
    label: "budgetJod",
    minExclusive: true,
    publicCode: BID_POOL_ERROR_CODES.INVALID_POOL_BUDGET,
  });
  const unitMillis = parseJodToMillis(bidUnitPriceJod, {
    label: "bidUnitPriceJod",
    minExclusive: true,
    publicCode: BID_POOL_ERROR_CODES.INVALID_BID_UNIT_PRICE,
  });
  const totalBids = Math.floor(budgetMillis / unitMillis);
  if (!Number.isSafeInteger(totalBids) || totalBids < 1) {
    throw createAppError("Budget is too small to create at least 1 Bid at this unit price.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.POOL_TOTAL_BIDS_ZERO,
    });
  }
  const usedMillis = totalBids * unitMillis;
  if (!Number.isSafeInteger(usedMillis)) {
    throw createAppError("Pool monetary product is out of safe integer range.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.INVALID_POOL_BUDGET,
    });
  }
  const remainderMillis = budgetMillis - usedMillis;
  return {
    totalBids,
    budgetJod: millisToJodString(budgetMillis),
    bidUnitPriceJod: millisToJodString(unitMillis),
    monetaryRemainderJod: millisToJodString(remainderMillis),
    budgetMillis,
    unitMillis,
    usedMillis,
    remainderMillis,
  };
}

/**
 * Unused Bids that should return to the pool from one allocation/grant.
 * Consumed and revoked Bids never return. Already-returned amounts excluded (idempotent).
 * Canonical: max(0, allocated - consumed - revoked - returned)
 * Do NOT use amount_expired as a second pool credit — expiry removes Freelancer usability;
 * pool return restores inventory once via this formula.
 */
function calculateUnusedBidsToReturn({
  allocatedBids,
  amountConsumed,
  amountRevoked = 0,
  returnedBids = 0,
  amountReserved = 0,
}) {
  const allocated = Number(allocatedBids) || 0;
  const consumed = Number(amountConsumed) || 0;
  const revoked = Number(amountRevoked) || 0;
  const returned = Number(returnedBids) || 0;
  // E2: active reservations are still committed to Freelancer Article work —
  // do not return reserved Bids to Admin Pool until release/consume resolves.
  const reserved = Number(amountReserved) || 0;
  return Math.max(0, allocated - consumed - revoked - returned - reserved);
}

module.exports = {
  JOD_MILLIS_PER_UNIT,
  parseJodToMillis,
  millisToJodString,
  calculatePoolBidsFromBudget,
  calculateUnusedBidsToReturn,
};
