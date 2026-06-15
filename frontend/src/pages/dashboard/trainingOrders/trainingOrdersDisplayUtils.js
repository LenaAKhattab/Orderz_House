export const ROUND_STATUS_AR = {
  scheduled: "مجدولة",
  active: "نشطة",
  expired: "منتهية",
  stopped: "متوقفة",
};

export function formatJoDateTime(value, locale = "ar") {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const intlLocale = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(intlLocale, {
    timeZone: "Asia/Amman",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
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
  const start = formatJoDateTime(startsAt, locale);
  const end = formatJoDateTime(expiresAt, locale);
  if (start === "—" && end === "—") return "—";
  return `${start} → ${end}`;
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
