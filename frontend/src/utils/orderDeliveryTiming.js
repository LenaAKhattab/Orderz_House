import { arabicDurationUnit } from "./arTime";

const MS_MIN = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY = 24 * MS_HOUR;

function parseInstant(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? d : null;
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

/** Official work window start (matches «تاريخ الاستلام» when present). */
function workStartedAt(order) {
  return parseInstant(order?.receivedAt) || parseInstant(order?.startedAt);
}

/**
 * Human-readable positive span: combines أيام + ساعات + دقائق (non-zero parts only),
 * e.g. "3 أيام و 5 ساعات و 12 دقيقة".
 */
export function formatDeliveryMarginArabic(msPositive) {
  const ms = Number(msPositive);
  if (!Number.isFinite(ms) || ms <= 0) return "";

  let remaining = Math.floor(ms);
  const days = Math.floor(remaining / MS_DAY);
  remaining -= days * MS_DAY;
  const hours = Math.floor(remaining / MS_HOUR);
  remaining -= hours * MS_HOUR;
  const minutes = Math.floor(remaining / MS_MIN);

  if (days === 0 && hours === 0 && minutes === 0) {
    return "أقل من دقيقة";
  }

  const parts = [];
  if (days > 0) {
    parts.push(`${days} ${arabicDurationUnit(days, "days")}`);
    parts.push(hours === 0 ? "0 ساعات" : `${hours} ${arabicDurationUnit(hours, "hours")}`);
    parts.push(minutes === 0 ? "0 دقيقة" : `${minutes} ${arabicDurationUnit(minutes, "minutes")}`);
  } else if (hours > 0) {
    parts.push(`${hours} ${arabicDurationUnit(hours, "hours")}`);
    parts.push(minutes === 0 ? "0 دقيقة" : `${minutes} ${arabicDurationUnit(minutes, "minutes")}`);
  } else {
    parts.push(`${minutes} ${arabicDurationUnit(minutes, "minutes")}`);
  }

  return parts.join(" و ");
}

/**
 * Time from assignment/receipt to delivery submission (same submission instant as deadline logic).
 * @returns {string | null}
 */
function formatWorkDurationFromReceiptToSubmit(order) {
  const start = workStartedAt(order);
  const end = effectiveSubmittedAt(order);
  if (!start || !end) return null;
  const elapsed = end.getTime() - start.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const span = formatDeliveryMarginArabic(elapsed);
  if (!span) return null;
  return `مدة التنفيذ من الاستلام حتى التسليم: (${span}).`;
}

/**
 * Compares freelancer submission time to order deadline (`dueAt` / `deadline`).
 * @returns {null | { status: 'late' | 'on_time', message: string, completionMessage: string | null }}
 */
export function getOrderDeliveryTiming(order) {
  const submittedAt = effectiveSubmittedAt(order);
  const deadline = parseInstant(order?.dueAt ?? order?.deadline);
  const completionMessage = formatWorkDurationFromReceiptToSubmit(order);

  if (!submittedAt || !deadline) return null;

  const subMs = submittedAt.getTime();
  const dueMs = deadline.getTime();
  if (!Number.isFinite(subMs) || !Number.isFinite(dueMs)) return null;

  if (subMs > dueMs) {
    const lateBy = subMs - dueMs;
    if (lateBy <= 0) return null;
    const span = formatDeliveryMarginArabic(lateBy);
    if (!span) return null;
    return {
      status: "late",
      message: `تم استلام العمل متأخرًا من المستقل بـ (${span}).`,
      completionMessage,
    };
  }

  const earlyOrOnMargin = dueMs - subMs;
  if (earlyOrOnMargin <= 0) {
    return {
      status: "on_time",
      message: "تم تسليم العمل في الوقت المحدد.",
      completionMessage,
    };
  }
  const span = formatDeliveryMarginArabic(earlyOrOnMargin);
  if (!span) {
    return {
      status: "on_time",
      message: "تم تسليم العمل في الوقت المحدد.",
      completionMessage,
    };
  }
  return {
    status: "on_time",
    message: `تم تسليم العمل في الوقت المحدد قبل الموعد بـ (${span}).`,
    completionMessage,
  };
}
