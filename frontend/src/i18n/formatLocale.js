import { LOCALE_META } from "./localePreference.js";

const AMMAN = "Asia/Amman";

/** German / Dutch / Romanian: their own conventions (e.g. de-DE 27.09.2026, nl-NL 27-09-2026, ro-RO 27.09.2026). */
function newLocaleTag(locale) {
  if (locale === "ar" || locale === "en") return null;
  return (LOCALE_META[locale] && LOCALE_META[locale].intl) || null;
}

export function formatLocaleDate(value, locale = "ar") {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const tag = newLocaleTag(locale);
  if (tag) {
    return new Intl.DateTimeFormat(tag, { timeZone: AMMAN, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  }
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: AMMAN,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: AMMAN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatLocaleDateTime(value, locale = "ar") {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const tag = newLocaleTag(locale);
  if (tag) {
    return new Intl.DateTimeFormat(tag, {
      timeZone: AMMAN,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: AMMAN,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: AMMAN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: AMMAN,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${datePart} ${timePart}`;
}

/**
 * Membership duration in months via one / two / few (3–10) / many (11+) keys. Every locale's copy is written so
 * each band is grammatical (German / Dutch plural, Romanian label form for 11+).
 */
export function durationMonthsText(t, months) {
  const count = Number(months);
  if (!Number.isInteger(count) || count < 1) return null;
  if (count === 1) return t("users.duration.one");
  if (count === 2) return t("users.duration.two");
  if (count >= 3 && count <= 10) return t("users.duration.few", { count });
  return t("users.duration.many", { count });
}
