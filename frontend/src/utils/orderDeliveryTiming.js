import { getTranslation } from "../lib/translation/getTranslation";
import { DEFAULT_LOCALE } from "../i18n/resources";
import { pt } from "../i18n/activeLocale.js";
import { isLatinUiLocale } from "../i18n/intlLocale.js";
import { pluralCategoryFor } from "../i18n/plural.js";
import { isNewLocale } from "../i18n/systemContent.js";
import { numberFormatFor } from "./localeFormat.js";

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

const DU = "ordersAdmin.wizard.durationUnits";

/** Singular / plural unit keys (Latin-script locales). */
const UNIT_KEYS = Object.freeze({
  days: ["day", "days"],
  hours: ["hour", "hours"],
  minutes: ["minute", "minutes"],
});

function resolveTranslator(t, locale) {
  if (typeof t === "function") return t;
  if (isNewLocale(locale)) return (key, values) => pt(key, values, locale);
  return (key, values) => getTranslation(key, DEFAULT_LOCALE, values);
}

/**
 * English / German / Dutch / Romanian: singular for the "one" plural category, plural otherwise
 * (Intl.PluralRules — English output unchanged). Romanian "other" (20+, "20 de zile") uses an optional
 * `<unit>_plural_other` catalog form when the catalog provides one.
 */
function latinDurationUnitLabel(n, unit, locale, tr) {
  const [singular, plural] = UNIT_KEYS[unit] || UNIT_KEYS.minutes;
  const category = pluralCategoryFor(locale, n);
  if (category === "one") return tr(`${DU}.${singular}`);
  if (locale === "ro" && category === "other") {
    const otherKey = `${DU}.${plural}_plural_other`;
    const other = tr(otherKey);
    if (other && other !== otherKey) return other;
  }
  return tr(`${DU}.${plural}`);
}

function durationUnitLabel(n, unit, locale, t) {
  const tr = resolveTranslator(t, locale);
  if (isLatinUiLocale(locale)) {
    return latinDurationUnitLabel(n, unit, locale, tr);
  }
  // Arabic grammar (dual / 3–10 plural) — unchanged.
  if (unit === "days") {
    return n >= 3 && n <= 10 ? tr(`${DU}.days`) : n === 2 ? tr(`${DU}.dayTwo`) : tr(`${DU}.day`);
  }
  if (unit === "hours") {
    return n >= 3 && n <= 10 ? tr(`${DU}.hours`) : n === 2 ? tr(`${DU}.hourTwo`) : tr(`${DU}.hour`);
  }
  return n >= 3 && n <= 10 ? tr(`${DU}.minutes`) : n === 2 ? tr(`${DU}.minuteTwo`) : tr(`${DU}.minute`);
}

function formatCountUnit(n, unit, locale, t) {
  const nf = numberFormatFor(locale, {}, { ar: "ar", en: "en-US" });
  return `${nf.format(n)} ${durationUnitLabel(n, unit, locale, t)}`;
}

/**
 * Joiner between span parts. Arabic pads the catalog value (" و " → "  و  ", unchanged); Latin-script locales use
 * it as-is (", "), padding only a bare word joiner (e.g. "și") so parts never run together.
 */
function partJoiner(locale, tr) {
  const joiner = tr("ordersAdmin.deliveryTiming.partJoiner");
  if (!isLatinUiLocale(locale)) return ` ${joiner} `;
  if (locale === "en" || /^[\s,;·–—]/u.test(joiner)) return joiner;
  return ` ${String(joiner).trim()} `;
}

function parseInstant(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  const ts = d.getTime();
  return Number.isFinite(ts) ? d : null;
}

/** Latest DB upload time among delivery attachments (aligns with backend submitted_at source). */
function maxDeliveryUploadedAt(order) {
  const files = Array.isArray(order?.files) ? order.files : [];
  let best = null;
  for (const f of files) {
    if (f?.purpose !== "delivery") continue;
    const d = parseInstant(f?.uploadedAt);
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

/** Use the later of order.submittedAt and delivery file timestamps so the margin matches real submission. */
function effectiveSubmittedAt(order) {
  const fromColumn = parseInstant(order?.submittedAt);
  const fromFiles = maxDeliveryUploadedAt(order);
  if (fromColumn && fromFiles) {
    return fromColumn.getTime() >= fromFiles.getTime() ? fromColumn : fromFiles;
  }
  return fromColumn || fromFiles;
}

/** Official work window start (matches receipt date when present). */
function workStartedAt(order) {
  return parseInstant(order?.receivedAt) || parseInstant(order?.startedAt);
}

/**
 * Human-readable positive span (days + hours + minutes, non-zero parts only).
 * @param {number} msPositive
 * @param {(key: string, values?: Record<string, string | number>) => string} [t]
 * @param {string} [locale]
 */
export function formatDeliveryMargin(msPositive, t, locale = DEFAULT_LOCALE) {
  const tr = resolveTranslator(t, locale);
  const ms = Number(msPositive);
  if (!Number.isFinite(ms) || ms <= 0) return "";

  let remaining = Math.floor(ms);
  const days = Math.floor(remaining / MS_DAY);
  remaining -= days * MS_DAY;
  const hours = Math.floor(remaining / MS_HOUR);
  remaining -= hours * MS_HOUR;
  const minutes = Math.floor(remaining / MS_MIN);

  if (days === 0 && hours === 0 && minutes === 0) {
    return tr("ordersAdmin.deliveryTiming.lessThanMinute");
  }

  const joiner = partJoiner(locale, tr);

  const parts = [];
  if (days > 0) {
    parts.push(formatCountUnit(days, "days", locale, tr));
    parts.push(
      hours === 0 ? tr("ordersAdmin.deliveryTiming.zeroHours") : formatCountUnit(hours, "hours", locale, tr),
    );
    parts.push(
      minutes === 0 ? tr("ordersAdmin.deliveryTiming.zeroMinutes") : formatCountUnit(minutes, "minutes", locale, tr),
    );
  } else if (hours > 0) {
    parts.push(formatCountUnit(hours, "hours", locale, tr));
    parts.push(
      minutes === 0 ? tr("ordersAdmin.deliveryTiming.zeroMinutes") : formatCountUnit(minutes, "minutes", locale, tr),
    );
  } else {
    parts.push(formatCountUnit(minutes, "minutes", locale, tr));
  }

  return parts.join(joiner);
}

/** @deprecated Use formatDeliveryMargin(ms, t, locale) */
export function formatDeliveryMarginArabic(msPositive) {
  return formatDeliveryMargin(msPositive, undefined, "ar");
}

/**
 * Time from assignment/receipt to delivery submission (same submission instant as deadline logic).
 * @returns {string | null}
 */
function formatWorkDurationFromReceiptToSubmit(order, t, locale) {
  const tr = resolveTranslator(t, locale);
  const start = workStartedAt(order);
  const end = effectiveSubmittedAt(order);
  if (!start || !end) return null;
  const elapsed = end.getTime() - start.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const span = formatDeliveryMargin(elapsed, tr, locale);
  if (!span) return null;
  return tr("ordersAdmin.deliveryTiming.workDuration", { span });
}

/**
 * Compares freelancer submission time to order deadline (`dueAt` / `deadline`).
 * @returns {null | { status: 'late' | 'on_time', message: string, completionMessage: string | null }}
 */
export function getOrderDeliveryTiming(order, t, locale = DEFAULT_LOCALE) {
  const tr = resolveTranslator(t, locale);
  const submittedAt = effectiveSubmittedAt(order);
  const deadline = parseInstant(order?.dueAt ?? order?.deadline);
  const completionMessage = formatWorkDurationFromReceiptToSubmit(order, tr, locale);

  if (!submittedAt || !deadline) return null;

  const subMs = submittedAt.getTime();
  const dueMs = deadline.getTime();
  if (!Number.isFinite(subMs) || !Number.isFinite(dueMs)) return null;

  if (subMs > dueMs) {
    const lateBy = subMs - dueMs;
    if (lateBy <= 0) return null;
    const span = formatDeliveryMargin(lateBy, tr, locale);
    if (!span) return null;
    return {
      status: "late",
      message: tr("ordersAdmin.deliveryTiming.late", { span }),
      completionMessage,
    };
  }

  const earlyOrOnMargin = dueMs - subMs;
  if (earlyOrOnMargin <= 0) {
    return {
      status: "on_time",
      message: tr("ordersAdmin.deliveryTiming.onTime"),
      completionMessage,
    };
  }
  const span = formatDeliveryMargin(earlyOrOnMargin, tr, locale);
  if (!span) {
    return {
      status: "on_time",
      message: tr("ordersAdmin.deliveryTiming.onTime"),
      completionMessage,
    };
  }
  return {
    status: "on_time",
    message: tr("ordersAdmin.deliveryTiming.early", { span }),
    completionMessage,
  };
}
