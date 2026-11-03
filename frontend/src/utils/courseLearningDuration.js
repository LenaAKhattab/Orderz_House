import { arabicDurationUnit } from "./arTime";
import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";
import { isLatinUiLocale, pickIntlTag } from "../i18n/intlLocale.js";
import { tPlural } from "../i18n/plural.js";
import { numberFormatFor } from "./localeFormat.js";

/**
 * Course learning durations / timestamps. These helpers historically always rendered Arabic; the optional
 * `locale` parameter defaults to `localeFromEnFlag(false)` so Arabic and English UIs are unchanged while German /
 * Dutch / Romanian get their own wording. Arabic keeps its own grammar (arabicDurationUnit).
 */
const DU = "platformUtils.duration";
const LEGACY_TAGS = Object.freeze({ ar: "ar-JO-u-nu-latn", en: "en-JO-u-nu-latn" });

const dateFormats = new Map();
function dateFormatFor(locale) {
  const tag = pickIntlTag(locale, LEGACY_TAGS);
  if (!dateFormats.has(tag)) {
    dateFormats.set(tag, new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }));
  }
  return dateFormats.get(tag);
}

export function formatLearningTimestamp(iso, locale = localeFromEnFlag(false)) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return dateFormatFor(locale).format(d);
}

const UNIT_KEYS = Object.freeze({ days: "day", hours: "hour", minutes: "minute" });

/** "<n> <unit>" — Arabic grammar for Arabic, catalog plural forms (Intl.PluralRules) for other locales. */
function countWithUnit(n, unit, locale, display = n) {
  if (!isLatinUiLocale(locale)) return `${display} ${arabicDurationUnit(n, unit)}`;
  const tr = (key, values) => pt(key, values, locale);
  return tPlural(tr, locale, `${DU}.${UNIT_KEYS[unit]}`, n, { count: display });
}

/**
 * @param {number | null | undefined} seconds
 * @param {string} [locale]
 * @returns {string}
 */
export function formatCompletionDuration(seconds, locale = localeFromEnFlag(false)) {
  const s = Math.floor(Number(seconds));
  if (!Number.isFinite(s) || s < 0) return "—";
  const lessThanMinute = () => pt(`${DU}.lessThanMinute`, undefined, locale);
  if (s === 0) return lessThanMinute();

  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const parts = [];

  if (days > 0) {
    parts.push(countWithUnit(days, "days", locale));
    if (hours > 0) parts.push(countWithUnit(hours, "hours", locale));
  } else if (hours > 0) {
    parts.push(countWithUnit(hours, "hours", locale));
    if (minutes > 0) parts.push(countWithUnit(minutes, "minutes", locale));
  } else if (minutes > 0) {
    parts.push(countWithUnit(minutes, "minutes", locale));
  } else {
    return lessThanMinute();
  }

  return parts.join(pt(`${DU}.partJoiner`, undefined, locale));
}

/** Human label for platform average (e.g. 7.4 days). */
export function formatAverageCompletionDuration(seconds, locale = localeFromEnFlag(false)) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "—";
  const days = s / 86400;
  if (days >= 1) {
    const rounded = Math.round(days * 10) / 10;
    const whole = Math.floor(rounded);
    const frac = rounded - whole;
    if (frac < 0.05) return countWithUnit(whole, "days", locale);
    const display = numberFormatFor(locale, { maximumFractionDigits: 1 }, LEGACY_TAGS).format(rounded);
    if (!isLatinUiLocale(locale)) return `${display} ${arabicDurationUnit(Math.round(rounded), "days")}`;
    return countWithUnit(rounded, "days", locale, display);
  }
  return formatCompletionDuration(s, locale);
}
