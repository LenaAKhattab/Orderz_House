import { arabicDurationUnit } from "../../../utils/arTime.js";

const ADMIN_DATE_PART_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Amman",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const ADMIN_TIME_PART_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Amman",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * Force Latin (English) digits for Training Orders admin display.
 * @param {number|string|null|undefined} value
 * @param {{ maximumFractionDigits?: number, minimumFractionDigits?: number }} [options]
 */
export function formatAdminNumber(value, options = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return normalizeToLatinDigits(String(value));
  const { maximumFractionDigits, minimumFractionDigits } = options;
  if (maximumFractionDigits != null || minimumFractionDigits != null) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: minimumFractionDigits ?? 0,
      maximumFractionDigits: maximumFractionDigits ?? 0,
    }).format(n);
  }
  return ADMIN_NUMBER_FMT.format(n);
}

/**
 * Replace Arabic-Indic / Persian digits with Latin digits in any string (e.g. API labels).
 * @param {unknown} text
 */
export function normalizeToLatinDigits(text) {
  if (text == null || text === "") return text;
  return String(text)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_DIGITS.indexOf(d)));
}

/**
 * @param {number|string|null|undefined} min
 * @param {number|string|null|undefined} max
 * @param {string} [separator]
 */
export function formatAdminRange(min, max, separator = " – ") {
  const lo = formatAdminNumber(min);
  const hi = formatAdminNumber(max);
  if (lo === "—" && hi === "—") return "—";
  if (lo === hi) return lo;
  return `${lo}${separator}${hi}`;
}

/**
 * Training-order admin budget display — fixed price vs min–max range.
 * @param {{ projectType?: string, project_type?: string, budget?: number|string|null, bidBudgetMin?: number|string|null, bidBudgetMax?: number|string|null }} [order]
 * @param {{ currency?: string }} [options]
 */
export function formatTrainingOrderBudget(order, { currency = "JOD" } = {}) {
  if (!order) return "—";
  const projectType = String(order.projectType || order.project_type || "").toLowerCase();
  const minRaw = order.bidBudgetMin ?? order.budget;
  const maxRaw = order.bidBudgetMax ?? order.budget;
  const minN = Number(minRaw);
  const maxN = Number(maxRaw);
  const hasMin = Number.isFinite(minN);
  const hasMax = Number.isFinite(maxN);
  const suffix = currency ? ` ${currency}` : "";

  if (projectType === "fixed") {
    const amount = hasMin ? minN : hasMax ? maxN : NaN;
    return Number.isFinite(amount) ? `${formatAdminNumber(amount)}${suffix}` : "—";
  }

  if (projectType === "bidding") {
    if (hasMin && hasMax) {
      if (minN === maxN) return `${formatAdminNumber(minN)}${suffix}`;
      return `${formatAdminNumber(minN)} – ${formatAdminNumber(maxN)}${suffix}`;
    }
  }

  if (hasMin && hasMax) {
    if (minN === maxN) return `${formatAdminNumber(minN)}${suffix}`;
    return `${formatAdminNumber(minN)} – ${formatAdminNumber(maxN)}${suffix}`;
  }
  if (hasMin) return `${formatAdminNumber(minN)}${suffix}`;
  if (hasMax) return `${formatAdminNumber(maxN)}${suffix}`;
  return "—";
}

/**
 * Format i18n interpolation values so numeric placeholders use English digits.
 * @param {Record<string, string | number>} [values]
 */
export function formatAdminI18nVars(values) {
  if (!values) return values;
  const out = { ...values };
  for (const [key, val] of Object.entries(out)) {
    if (typeof val === "number" && Number.isFinite(val)) {
      out[key] = formatAdminNumber(val);
    }
  }
  return out;
}

/**
 * Training Orders admin t() wrapper — Latin digits in numeric placeholders.
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 * @param {string} key
 * @param {Record<string, string | number>} [values]
 */
export function trainingAdminT(t, key, values) {
  return t(key, formatAdminI18nVars(values));
}

function englishDurationUnit(value, unit, labels) {
  const n = Number(value);
  if (!Number.isFinite(n)) return labels?.days || "days";
  if (unit === "days") return n === 1 ? labels?.day || "day" : labels?.days || "days";
  if (unit === "hours") return n === 1 ? labels?.hour || "hour" : labels?.hours || "hours";
  if (unit === "minutes") return n === 1 ? labels?.minute || "minute" : labels?.minutes || "minutes";
  return String(unit || "");
}

/**
 * Duration with English digits (Arabic unit labels when locale is ar).
 */
export function formatAdminDuration(value, unit, locale = "ar", labels = null) {
  const n = Number(value);
  const normalizedUnit = String(unit || "days").toLowerCase();
  if (!Number.isFinite(n) || n <= 0 || !normalizedUnit) return "—";
  const num = formatAdminNumber(n);
  if (locale === "en") {
    return `${num} ${englishDurationUnit(n, normalizedUnit, labels)}`;
  }
  return `${num} ${arabicDurationUnit(n, normalizedUnit)}`;
}

const ADMIN_NUMBER_FMT = new Intl.NumberFormat("en-US");

export const ROUND_STATUS_AR = {
  scheduled: "مجدولة",
  active: "نشطة",
  expired: "منتهية",
  stopped: "متوقفة",
};

export function formatAdminDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${ADMIN_DATE_PART_FMT.format(d)} ${ADMIN_TIME_PART_FMT.format(d)}`;
}

export function formatJoDateTime(value, locale = "ar") {
  void locale;
  return formatAdminDateTime(value);
}

export function automationStatusAr(status) {
  if (status === "success") return "نجاح";
  if (status === "skipped_no_templates") return "تخطي — لا قوالب";
  if (status === "skipped_lock") return "تخطي — قفل";
  if (status === "failed") return "فشل";
  return status || "—";
}

export function unwrapTrainingPayload(res) {
  return res?.data ?? res;
}

export function roundSourceAr(source) {
  if (source === "automation") return "تلقائي";
  if (source === "manual") return "يدوي";
  return "—";
}

export function formatRoundPeriod(startsAt, expiresAt, locale = "ar") {
  const start = formatAdminDateTime(startsAt);
  const end = formatAdminDateTime(expiresAt);
  if (start === "—" && end === "—") return "—";
  void locale;
  return `${start} → ${end}`;
}

/**
 * Label for “can the system create a new round?” — display only.
 * @param {{ canCreateNextRound?: boolean, nextRoundReadinessStatus?: string }} readiness
 * @param {(key: string) => string} t
 */
export function getCanCreateNextRoundLabel(readiness, t) {
  if (!readiness?.canCreateNextRound) {
    return t("trainingOrders.overview.nextRoundReadiness.canCreateNo");
  }
  if (readiness.nextRoundReadinessStatus === "warning") {
    return t("trainingOrders.overview.nextRoundReadiness.canCreateWarning");
  }
  return t("trainingOrders.overview.nextRoundReadiness.canCreateYes");
}

/**
 * Simplified round label for history table (does not use backend title).
 * @param {number|string} roundId
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function formatRoundTableTitle(roundId, t) {
  return trainingAdminT(t, "trainingOrders.rounds.tableRoundTitle", { id: roundId });
}

/**
 * @param {string|Date|null|undefined} expiresAt
 * @param {(key: string, vars?: Record<string, unknown>) => string} t
 */
export function formatTimeRemaining(expiresAt, t) {
  if (!expiresAt) return "—";
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return "—";
  const ms = end - Date.now();
  if (ms <= 0) return t("trainingOrders.overview.activeRound.ended");

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  if (days > 0) {
    return trainingAdminT(t, "trainingOrders.overview.activeRound.timeRemainingDays", { days, hours: remHours });
  }
  if (hours > 0) {
    return trainingAdminT(t, "trainingOrders.overview.activeRound.timeRemainingHours", { hours, minutes });
  }
  return trainingAdminT(t, "trainingOrders.overview.activeRound.timeRemainingMinutes", {
    minutes: Math.max(1, minutes),
  });
}

/**
 * @param {string} status
 * @param {(key: string) => string} t
 */
export function getRoundStatusLabel(status, t) {
  const key = `trainingOrders.roundStatus.${status}`;
  const label = t(key);
  return label === key ? ROUND_STATUS_AR[status] || status || "—" : label;
}

/**
 * @param {string} status
 * @param {(key: string) => string} t
 */
export function getFakeOrderStatusLabel(status, t) {
  const key = `trainingOrders.fakeOrderStatus.${status}`;
  const label = t(key);
  if (label !== key) return label;
  if (status === "active") return "نشط";
  if (status === "expired") return "منتهٍ";
  if (status === "stopped") return "متوقف";
  return status || "—";
}

/**
 * @param {string} status
 * @param {(key: string) => string} t
 */
export function getAutomationStatusLabel(status, t) {
  const key = `trainingOrders.automationStatus.${status}`;
  const label = t(key);
  return label === key ? automationStatusAr(status) : label;
}

/**
 * @param {string} source
 * @param {(key: string) => string} t
 */
export function getRoundSourceLabel(source, t) {
  const key = `trainingOrders.roundSource.${source}`;
  const label = t(key);
  return label === key ? roundSourceAr(source) : label;
}

/**
 * @param {string} code
 * @param {(key: string) => string} t
 */
export function getAutomationHealthWarningLabel(code, t) {
  if (!code) return "—";
  const key = `trainingOrders.healthWarnings.${code}`;
  const label = t(key);
  return label === key ? t("trainingOrders.healthWarnings._fallback") : label;
}

/**
 * @param {string[]} warnings
 * @param {(key: string) => string} t
 */
export function formatAutomationHealthWarnings(warnings, t) {
  if (!Array.isArray(warnings) || warnings.length === 0) return [];
  return warnings.map((code) => getAutomationHealthWarningLabel(code, t));
}

/**
 * @param {string} code
 * @param {(key: string) => string} t
 */
export function getReadinessWarningLabel(code, t) {
  if (!code) return "—";
  const key = `trainingOrders.readinessWarnings.${code}`;
  const label = t(key);
  return label === key ? t("trainingOrders.readinessWarnings._fallback") : label;
}

/**
 * @param {string[]} warnings
 * @param {(key: string) => string} t
 */
export function formatReadinessWarnings(warnings, t) {
  if (!Array.isArray(warnings) || warnings.length === 0) return [];
  return warnings.map((code) => getReadinessWarningLabel(code, t));
}

/**
 * @param {string} status
 * @param {(key: string) => string} t
 */
export function getReadinessStatusLabel(status, t) {
  const key = `trainingOrders.readinessStatus.${status}`;
  const label = t(key);
  return label === key ? status || "—" : label;
}

export function readinessStatusTone(status) {
  if (status === "ready") return "success";
  if (status === "warning") return "pending";
  if (status === "blocked") return "danger";
  return "neutral";
}

export { resolveApplicantsTotal, resolveRowApplicantsCount } from "./trainingOrdersApplicantsCountUtils.js";
