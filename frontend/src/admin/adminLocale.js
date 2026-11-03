import { getActiveLocale } from "../i18n/activeLocale.js";
import { isNewLocale } from "../i18n/systemContent.js";

/**
 * Admin copy that historically rendered Arabic in BOTH the Arabic and the English UI (Arabic-only helpers).
 * Arabic / English keep "ar" (unchanged output); German / Dutch / Romanian get their own locale.
 * @param {string} [locale] UI locale (defaults to the active one)
 */
export function legacyArabicUiLocale(locale = getActiveLocale()) {
  return isNewLocale(locale) ? locale : "ar";
}
