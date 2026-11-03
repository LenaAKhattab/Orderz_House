import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";
import { tPlural } from "../i18n/plural.js";

const AP = "platformUtils.applicants";

/** Shown to guests instead of numeric applicant / bidder counts on public pool UI (Arabic, legacy export). */
export const GUEST_APPLICANTS_MESSAGE = pt(`${AP}.guestMessage`, undefined, "ar");

export const GUEST_APPLICANTS_MESSAGE_LONG = pt(`${AP}.guestMessageLong`, undefined, "ar");

/**
 * Fallback copy (when the caller passes no label) is Arabic unless `locale` is given, and follows German / Dutch /
 * Romanian UIs.
 *
 * @param {unknown} count
 * @param {{ isAuthenticated?: boolean, emptyLabel?: string, guestMessage?: string, locale?: string }} [opts]
 * @returns {string}
 */
export function formatApplicantsCountValue(
  count,
  { isAuthenticated = false, emptyLabel, guestMessage, locale = localeFromEnFlag(false) } = {},
) {
  if (!isAuthenticated) return guestMessage || pt(`${AP}.guestMessage`, undefined, locale);
  const n = Math.max(0, Number(count) || 0);
  return n > 0 ? String(n) : emptyLabel || pt(`${AP}.empty`, undefined, locale);
}

/**
 * Full label for list rows, e.g. "3 applicants".
 * @param {unknown} count
 * @param {{ isAuthenticated?: boolean, guestMessage?: string, applicantSingular?: string, applicantPlural?: string, locale?: string }} [opts]
 * @returns {string}
 */
export function formatApplicantsCountLabel(
  count,
  { isAuthenticated = false, guestMessage, applicantSingular, applicantPlural, locale = localeFromEnFlag(false) } = {},
) {
  if (!isAuthenticated) return guestMessage || pt(`${AP}.guestMessage`, undefined, locale);
  const n = Math.max(0, Number(count) || 0);
  if (!applicantSingular && !applicantPlural) {
    return tPlural((key, values) => pt(key, values, locale), locale, `${AP}.count`, n);
  }
  // Caller-provided labels keep the historical singular / plural pairing.
  const singular = applicantSingular || pt(`${AP}.singular`, undefined, locale);
  const plural = applicantPlural || pt(`${AP}.plural`, undefined, locale);
  return `${n} ${n === 1 ? singular : plural}`;
}
