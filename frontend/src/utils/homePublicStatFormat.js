import { getActiveLocale } from "../i18n/activeLocale.js";
import { numberFormatFor } from "./localeFormat.js";

/**
 * Format a known-valid homepage public count for display.
 * Returns empty string for invalid input — hero UI must hide the section, not show "—".
 * Arabic / English keep en-US grouping; German / Dutch / Romanian use their own separators.
 * @param {unknown} n
 * @param {string} [locale] UI locale (defaults to the active one)
 * @returns {string}
 */
export function formatHomePublicStat(n, locale = getActiveLocale()) {
  if (n == null || Number.isNaN(Number(n)) || !Number.isFinite(Number(n))) return "";
  return numberFormatFor(locale).format(Math.trunc(Number(n)));
}
