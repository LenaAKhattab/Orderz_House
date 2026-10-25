/**
 * Canonical email input normalization for auth endpoints (mirrors frontend `utils/emailInput.js`).
 *
 * Copy/paste, autofill and RTL keyboards can wrap an address in characters that `trim()` keeps
 * (zero-width spaces, LRM/RLM, bidi embeddings/isolates, word joiner) while validator's `isEmail`
 * still accepts them — the account would then be stored or looked up with invisible characters.
 * Only *boundary* characters are stripped; anything invisible left inside the address is rejected.
 */

const INVISIBLE = "\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF";
const BOUNDARY_RE = new RegExp(`^[\\s${INVISIBLE}]+|[\\s${INVISIBLE}]+$`, "g");
const INVISIBLE_RE = new RegExp(`[${INVISIBLE}]`);

/** @param {unknown} raw */
function normalizeEmailInput(raw) {
  return String(raw ?? "")
    .replace(BOUNDARY_RE, "")
    .toLowerCase();
}

/** @param {unknown} value */
function hasInvisibleEmailChars(value) {
  return INVISIBLE_RE.test(String(value ?? ""));
}

module.exports = { normalizeEmailInput, hasInvisibleEmailChars };
