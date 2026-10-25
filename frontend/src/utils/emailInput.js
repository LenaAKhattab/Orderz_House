/**
 * Canonical email input handling for auth forms (login, register, forgot/reset password).
 * Mirrors backend `utils/emailNormalization.js`: strip only unintended *boundary* characters,
 * lowercase, then validate. Internal characters are never removed.
 */

// Whitespace (incl. NBSP) plus invisible characters that copy/paste, autofill and RTL keyboards
// add around an address: zero-width chars, LRM/RLM, bidi embeddings/isolates, word joiner, BOM.
const INVISIBLE = "\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF";
const BOUNDARY_RE = new RegExp(`^[\\s${INVISIBLE}]+|[\\s${INVISIBLE}]+$`, "g");
const INVISIBLE_RE = new RegExp(`[${INVISIBLE}]`);
const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {unknown} raw */
export function normalizeEmailInput(raw) {
  return String(raw ?? "")
    .replace(BOUNDARY_RE, "")
    .toLowerCase();
}

/** Syntax check on an already-normalized value (backend `isEmail` stays authoritative). */
export function isValidEmailSyntax(email) {
  const value = String(email ?? "");
  if (!value || value.length > 254 || INVISIBLE_RE.test(value)) return false;
  return EMAIL_SYNTAX_RE.test(value);
}
