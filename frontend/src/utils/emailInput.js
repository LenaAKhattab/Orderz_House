/**
 * Canonical email input handling for auth forms (login, register, forgot/reset password).
 * Mirrors backend `utils/emailNormalization.js`: invisible format characters (zero-width chars,
 * LRM/RLM, bidi embeddings/isolates, word joiner, BOM) are removed wherever they appear — they are
 * never part of a real address — surrounding whitespace is trimmed, then the address is lowercased.
 * Character classes are built from code points (no escape sequences in source).
 */

const INVISIBLE_CHARS = (() => {
  const codes = [0xfeff];
  for (let c = 0x200b; c <= 0x200f; c += 1) codes.push(c);
  for (let c = 0x202a; c <= 0x202e; c += 1) codes.push(c);
  for (let c = 0x2060; c <= 0x2064; c += 1) codes.push(c);
  for (let c = 0x2066; c <= 0x2069; c += 1) codes.push(c);
  return codes.map((c) => String.fromCharCode(c)).join("");
})();
const INVISIBLE_GLOBAL_RE = new RegExp(`[${INVISIBLE_CHARS}]`, "g");
const INVISIBLE_RE = new RegExp(`[${INVISIBLE_CHARS}]`);
const EMAIL_SYNTAX_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {unknown} raw */
export function normalizeEmailInput(raw) {
  return String(raw ?? "")
    .replace(INVISIBLE_GLOBAL_RE, "")
    .trim()
    .toLowerCase();
}

/** Syntax check on an already-normalized value (backend `isEmail` stays authoritative). */
export function isValidEmailSyntax(email) {
  const value = String(email ?? "");
  if (!value || value.length > 254 || INVISIBLE_RE.test(value)) return false;
  return EMAIL_SYNTAX_RE.test(value);
}
