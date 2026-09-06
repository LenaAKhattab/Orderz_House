/**
 * Normalize Admin Bid Pool expiration choices into expires_at (Phase D1).
 * Source of truth is always a concrete timestamptz — never vague duration strings.
 */
const { createAppError } = require("./AppError");
const {
  BID_POOL_EXPIRATION_MODES,
  BID_POOL_ERROR_CODES,
} = require("../constants/marketplaceBidDistributionPools");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {{
 *   expirationMode: 'days'|'weeks'|'exact_datetime',
 *   expirationValue?: number|null,
 *   expiresAt?: string|Date|null,
 *   now?: Date,
 * }} opts
 * @returns {{ expiresAt: Date, expirationMode: string, expirationValue: number|null }}
 */
function resolvePoolAllocationExpiresAt({
  expirationMode,
  expirationValue = null,
  expiresAt = null,
  now = new Date(),
} = {}) {
  const mode = String(expirationMode || "").trim();
  if (!BID_POOL_EXPIRATION_MODES.includes(mode)) {
    throw createAppError("Invalid expiration mode.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.INVALID_EXPIRATION,
    });
  }
  const base = new Date(now);
  if (Number.isNaN(base.getTime())) {
    throw createAppError("Invalid now for expiration.", 500);
  }

  if (mode === "exact_datetime") {
    const exp = new Date(expiresAt);
    if (Number.isNaN(exp.getTime()) || exp <= base) {
      throw createAppError("expiresAt must be a future datetime.", 400, {
        exposeToClient: true,
        publicCode: BID_POOL_ERROR_CODES.INVALID_EXPIRATION,
      });
    }
    return { expiresAt: exp, expirationMode: mode, expirationValue: null };
  }

  const n = Number(expirationValue);
  if (!Number.isInteger(n) || n < 1 || n > 3650) {
    throw createAppError(
      mode === "weeks"
        ? "expirationValue (weeks) must be an integer from 1 to 3650."
        : "expirationValue (days) must be an integer from 1 to 3650.",
      400,
      {
        exposeToClient: true,
        publicCode: BID_POOL_ERROR_CODES.INVALID_EXPIRATION,
      },
    );
  }
  const days = mode === "weeks" ? n * 7 : n;
  const exp = new Date(base.getTime() + days * MS_PER_DAY);
  return { expiresAt: exp, expirationMode: mode, expirationValue: n };
}

module.exports = {
  resolvePoolAllocationExpiresAt,
  MS_PER_DAY,
};
