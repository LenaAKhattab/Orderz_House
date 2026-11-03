import { readStoredLocale } from "../../../i18n/localePreference.js";
import { pickIntlTag } from "../../../i18n/intlLocale.js";

/** Latin digits; Arabic / English keep en-US grouping, German / Dutch / Romanian use their own separators. */
export function formatMoney(value, locale = readStoredLocale()) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(pickIntlTag(locale, { ar: "en-US", en: "en-US" }), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Currency before amount (e.g. `JOD 44`) for clearer LTR price chips in RTL layouts */
export function formatMoneyJod(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `JOD ${formatMoney(value)}`;
}

/** Bidding range with currency first, e.g. `JOD 10 – 20` */
export function formatMoneyJodRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  return `JOD ${formatMoney(min)} – ${formatMoney(max)}`;
}

/**
 * Arabic UI keeps the Jordanian Arabic format (Latin digits); English UI gets an English date;
 * German / Dutch / Romanian get their own date format.
 * @param {string} [locale] UI locale (defaults to the saved preference)
 */
function dateLocale(locale = readStoredLocale()) {
  return pickIntlTag(locale, { ar: "ar-JO-u-nu-latn", en: "en-GB" });
}

/** @param {string} [locale] optional UI locale (defaults to the saved preference) */
export function formatJoDate(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "medium" }).format(d);
}

/** @param {string} [locale] optional UI locale (defaults to the saved preference) */
export function formatJoDateTime(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(d);
}
