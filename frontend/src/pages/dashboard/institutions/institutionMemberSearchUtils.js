/**
 * Shared gate for institution member user search (min length / numeric id).
 * @param {string} q
 * @returns {boolean}
 */
export function shouldSearchUsers(q) {
  const trimmed = String(q || "").trim();
  if (!trimmed) return false;
  if (/^\d+$/.test(trimmed)) return trimmed.length >= 1;
  return trimmed.length >= 2;
}
