import { getTranslation } from "../lib/translation/getTranslation";
import { DEFAULT_LOCALE } from "../i18n/resources";

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

const DU = "ordersAdmin.wizard.durationUnits";

function resolveTranslator(t) {
  return typeof t === "function" ? t : (key, values) => getTranslation(key, DEFAULT_LOCALE, values);
}

function durationUnitLabel(n, unit, locale, t) {
  const tr = resolveTranslator(t);
  if (locale === "en") {
    if (unit === "days") return n === 1 ? tr(`${DU}.day`) : tr(`${DU}.days`);
    if (unit === "hours") return n === 1 ? tr(`${DU}.hour`) : tr(`${DU}.hours`);
    return n === 1 ? tr(`${DU}.minute`) : tr(`${DU}.minutes`);
  }
  if (unit === "days") {
    return n >= 3 && n <= 10 ? tr(`${DU}.days`) : n === 2 ? tr(`${DU}.dayTwo`) : tr(`${DU}.day`);
  }
  if (unit === "hours") {
    return n >= 3 && n <= 10 ? tr(`${DU}.hours`) : n === 2 ? tr(`${DU}.hourTwo`) : tr(`${DU}.hour`);
  }
  return n >= 3 && n <= 10 ? tr(`${DU}.minutes`) : n === 2 ? tr(`${DU}.minuteTwo`) : tr(`${DU}.minute`);
}

function formatCountUnit(n, unit, locale, t) {
  const nf = new Intl.NumberFormat(locale === "en" ? "en-US" : "ar");
  return `${nf.format(n)} ${durationUnitLabel(n, unit, locale, t)}`;
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
  const tr = resolveTranslator(t);
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

  const joiner =
    locale === "en" ? tr("ordersAdmin.deliveryTiming.partJoiner") : ` ${tr("ordersAdmin.deliveryTiming.partJoiner")} `;

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
  const tr = resolveTranslator(t);
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
  const tr = resolveTranslator(t);
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
