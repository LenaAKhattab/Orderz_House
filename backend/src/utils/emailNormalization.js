/**
 * Canonical email input normalization for auth endpoints (mirrors frontend `utils/emailInput.js`).
 *
 * Copy/paste, autofill and RTL keyboards can add characters that `trim()` keeps (zero-width spaces,
 * LRM/RLM, bidi embeddings/isolates, word joiner, BOM) while validator's `isEmail` still accepts them.
 * They are never part of a real address, so they are removed wherever they appear (whitespace only at
 * the ends), then the address is lowercased.
 *
 * Accounts registered before this normalization may have such characters stored in users.email
 * (66 Production rows on 2026-10-27). Lookups compare against the stored address with those characters
 * removed — see sqlEmailEquals — so those users still match what they type or paste.
 *
 * Character classes are built from code points (no escape sequences in source or SQL text).
 */

const INVISIBLE_CODE_POINTS = (() => {
  const codes = [0xfeff];
  for (let c = 0x200b; c <= 0x200f; c += 1) codes.push(c);
  for (let c = 0x202a; c <= 0x202e; c += 1) codes.push(c);
  for (let c = 0x2060; c <= 0x2064; c += 1) codes.push(c);
  for (let c = 0x2066; c <= 0x2069; c += 1) codes.push(c);
  return codes;
})();

const INVISIBLE_CHARS = INVISIBLE_CODE_POINTS.map((c) => String.fromCharCode(c)).join("");
const INVISIBLE_GLOBAL_RE = new RegExp(`[${INVISIBLE_CHARS}]`, "g");
const INVISIBLE_RE = new RegExp(`[${INVISIBLE_CHARS}]`);
/** PostgreSQL bracket expression for the same set (contains no quotes or backslashes). */
const PG_INVISIBLE_CLASS = `[${INVISIBLE_CHARS}]`;

/** @param {unknown} raw */
function normalizeEmailInput(raw) {
  return String(raw ?? "")
    .replace(INVISIBLE_GLOBAL_RE, "")
    .trim()
    .toLowerCase();
}

/** @param {unknown} value */
function hasInvisibleEmailChars(value) {
  return INVISIBLE_RE.test(String(value ?? ""));
}

/**
 * SQL predicate: stored email equals the parameter case-insensitively, ignoring invisible characters
 * stored by older registrations. The first branch keeps the plain lower(email) match.
 * @param {string} column e.g. "email" or "u.email"
 * @param {string} param e.g. "$1"
 */
function sqlEmailEquals(column, param) {
  return `(lower(${column}::text) = lower(${param}::text) OR lower(regexp_replace(${column}::text, '${PG_INVISIBLE_CLASS}', '', 'g')) = lower(${param}::text))`;
}

module.exports = { normalizeEmailInput, hasInvisibleEmailChars, sqlEmailEquals, PG_INVISIBLE_CLASS };
