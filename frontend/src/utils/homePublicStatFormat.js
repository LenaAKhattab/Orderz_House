/**
 * Format a known-valid homepage public count for display.
 * Returns empty string for invalid input — hero UI must hide the section, not show "—".
 * @param {unknown} n
 * @returns {string}
 */
export function formatHomePublicStat(n) {
  if (n == null || Number.isNaN(Number(n)) || !Number.isFinite(Number(n))) return "";
  return new Intl.NumberFormat("en-US").format(Math.trunc(Number(n)));
}
