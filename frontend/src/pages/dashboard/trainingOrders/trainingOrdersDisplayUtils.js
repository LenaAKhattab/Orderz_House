export const ROUND_STATUS_AR = {
  scheduled: "مجدولة",
  active: "نشطة",
  expired: "منتهية",
  stopped: "متوقفة",
};

export function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
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

export function formatRoundPeriod(startsAt, expiresAt) {
  const start = formatJoDateTime(startsAt);
  const end = formatJoDateTime(expiresAt);
  if (start === "—" && end === "—") return "—";
  return `${start} → ${end}`;
}
