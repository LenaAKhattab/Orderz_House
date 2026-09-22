/**
 * Legacy Freelancer business/member ID helpers.
 * For LEGACY_INVITE freelancers, member ID = Jordanian national ID.
 * Never log the full value.
 */

const { createPublicApiError } = require("./publicApiError");

const NATIONAL_ID_RE = /^\d{10}$/;
const DUPLICATE_NATIONAL_ID_AR = "يوجد فريلانسر مسجل مسبقًا بهذا الرقم الوطني.";
const INVALID_NATIONAL_ID_AR = "الرقم الوطني غير صالح. يجب أن يكون 10 أرقام.";

/**
 * Strip spaces/dashes; keep digits only for canonical form.
 */
function normalizeNationalId(raw) {
  if (raw == null) return null;
  const digits = String(raw).trim().replace(/\D/g, "");
  return digits || null;
}

function isValidJordanNationalId(normalized) {
  return typeof normalized === "string" && NATIONAL_ID_RE.test(normalized);
}

/**
 * Normalize + validate Jordanian national ID (10 digits).
 * @throws public API error on invalid format when value is present
 */
function normalizeAndValidateNationalId(raw, { required = false } = {}) {
  if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
    if (required) {
      throw createPublicApiError(INVALID_NATIONAL_ID_AR, 400, "VALIDATION_ERROR");
    }
    return null;
  }
  const normalized = normalizeNationalId(raw);
  if (!isValidJordanNationalId(normalized)) {
    throw createPublicApiError(INVALID_NATIONAL_ID_AR, 400, "VALIDATION_ERROR");
  }
  return normalized;
}

/**
 * Mask for list views: first 4 + stars + last 2.
 * Example style: 2001298136 → 2001******36 (at least 6 middle stars).
 */
function maskFreelancerMemberId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length <= 6) return "*".repeat(Math.max(4, s.length));
  const head = s.slice(0, 4);
  const tail = s.slice(-2);
  const midLen = Math.max(6, s.length - 6);
  return `${head}${"*".repeat(midLen)}${tail}`;
}

function isLegacyMemberIdUniqueViolation(err) {
  if (!err || err.code !== "23505") return false;
  const c = String(err.constraint || err.detail || err.message || "");
  return c.includes("users_legacy_freelancer_member_id_uidx") || c.includes("freelancer_member_id");
}

function duplicateNationalIdError() {
  return createPublicApiError(DUPLICATE_NATIONAL_ID_AR, 409, "LEGACY_NATIONAL_ID_EXISTS");
}

/** Smoke / internal test markers — exclude from production backfill. */
function isSmokeOrInternalLegacyAccount({ email, internalReference, metadata } = {}) {
  const hay = [
    email,
    internalReference,
    metadata && typeof metadata === "object" ? JSON.stringify(metadata) : metadata,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  if (!hay) return false;
  return (
    hay.includes("SMOKE_LEGACY_INTERNAL") ||
    hay.includes("SMOKE_LEGACY") ||
    hay.includes("LEGACY FREELANCER STAGING SMOKE") ||
    /SMOKE.*LEGACY|LEGACY.*SMOKE/.test(hay)
  );
}

module.exports = {
  NATIONAL_ID_RE,
  DUPLICATE_NATIONAL_ID_AR,
  INVALID_NATIONAL_ID_AR,
  normalizeNationalId,
  isValidJordanNationalId,
  normalizeAndValidateNationalId,
  maskFreelancerMemberId,
  isLegacyMemberIdUniqueViolation,
  duplicateNationalIdError,
  isSmokeOrInternalLegacyAccount,
};
