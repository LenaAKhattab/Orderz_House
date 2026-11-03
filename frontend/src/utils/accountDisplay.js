import { localeFromEnFlag } from "../i18n/activeLocale.js";
import { pickIntlTag } from "../i18n/intlLocale.js";

/** @param {Record<string, unknown> | null | undefined} user */
export function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

/**
 * @param {unknown} value
 * @param {string} [locale] Arabic date unless a locale is given; follows German / Dutch / Romanian UIs.
 */
export function fmtDateMedium(value, locale = localeFromEnFlag(false)) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const tag = pickIntlTag(locale, { ar: "ar-JO-u-nu-latn", en: "en-JO-u-nu-latn" });
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(d);
}

/** Default toggles when API returns empty preferences. */
export const DEFAULT_NOTIFICATION_PREFS = {
  orders: true,
  claims: true,
  courses: true,
  payments: true,
  offers: true,
  delivery: true,
  general: true,
};

export function mergeNotificationPrefs(raw) {
  const base = { ...DEFAULT_NOTIFICATION_PREFS };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const k of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
      if (typeof raw[k] === "boolean") base[k] = raw[k];
    }
  }
  return base;
}
