/**
 * Shared E.164 composition for registration phones.
 * Strips a national trunk leading 0 when country dial code is provided separately
 * (e.g. +962 + 0779… → +962779…).
 */

const { createPublicApiError } = require("./publicApiError");

function normalizePhonePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

/** Longest-first Arab dial codes used for trunk-zero cleanup of full E.164 strings. */
const ARAB_DIAL_CODES_LONGEST_FIRST = Object.freeze(
  [
    "+971",
    "+970",
    "+968",
    "+967",
    "+966",
    "+965",
    "+964",
    "+963",
    "+962",
    "+961",
    "+973",
    "+974",
    "+20",
  ].sort((a, b) => b.length - a.length),
);

/**
 * National numbers often include a domestic trunk prefix `0`.
 * When the country calling code is already known, that 0 must not appear in E.164.
 */
function stripNationalTrunkPrefix(nationalNumber) {
  const digits = String(nationalNumber || "").replace(/\D/g, "");
  if (!digits) return "";
  const stripped = digits.replace(/^0+/, "");
  return stripped || digits;
}

function stripTrunkZeroAfterDialCode(e164) {
  const normalized = normalizePhonePart(e164);
  if (!normalized.startsWith("+")) return normalized;
  for (const dial of ARAB_DIAL_CODES_LONGEST_FIRST) {
    if (normalized.startsWith(dial) && normalized.length > dial.length && normalized[dial.length] === "0") {
      return `${dial}${stripNationalTrunkPrefix(normalized.slice(dial.length))}`;
    }
  }
  return normalized;
}

/**
 * @param {string | { countryCode?: string, number?: string }} raw
 * @param {{ example?: string }} [opts]
 * @returns {string}
 */
function composeE164(raw, opts = {}) {
  const example = opts.example || "+9627xxxxxxxx";
  const invalidMessage = `رقم الجوال يجب أن يكون بالصيغة الدولية (مثال: ${example}).`;
  const phonePattern = /^\+[1-9]\d{7,14}$/;

  if (typeof raw === "string" && raw.trim().startsWith("+")) {
    const e164 = stripTrunkZeroAfterDialCode(raw);
    if (!phonePattern.test(e164)) {
      throw createPublicApiError(invalidMessage, 400, "VALIDATION_ERROR");
    }
    return e164;
  }

  const cc = normalizePhonePart(raw?.countryCode);
  const num = stripNationalTrunkPrefix(normalizePhonePart(raw?.number));
  const e164 = `${cc}${num}`;
  if (!phonePattern.test(e164)) {
    throw createPublicApiError(invalidMessage, 400, "VALIDATION_ERROR");
  }
  return e164;
}

module.exports = {
  ARAB_DIAL_CODES_LONGEST_FIRST,
  normalizePhonePart,
  stripNationalTrunkPrefix,
  stripTrunkZeroAfterDialCode,
  composeE164,
};
