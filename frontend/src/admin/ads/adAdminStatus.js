/**
 * Single primary status for the admin ads table (display only).
 * Does not change public filtering or API behavior.
 *
 * Priority: غير مفعّل → منتهي → مجدول → ظاهر الآن
 *
 * @param {object} ad — API ad row (camelCase)
 * @param {Date} [now]
 * @returns {{ key: string, label: string, tone: 'neutral'|'danger'|'warning'|'success', description: string }}
 */
export function getAdAdminStatus(ad, now = new Date()) {
  const t = now.getTime();

  if (!ad?.isActive) {
    return {
      key: "inactive",
      label: "غير مفعّل",
      tone: "neutral",
      description: "الإعلان متوقف يدويًا.",
    };
  }

  const endRaw = ad.endDate;
  const endDate = endRaw ? new Date(endRaw) : null;
  const endOk = endDate && !Number.isNaN(endDate.getTime());
  if (endOk && endDate.getTime() < t) {
    return {
      key: "expired",
      label: "منتهي",
      tone: "danger",
      description: "انتهى وقت عرض الإعلان ولن يظهر للزوار.",
    };
  }

  const startRaw = ad.startDate;
  const startDate = startRaw ? new Date(startRaw) : null;
  const startOk = startDate && !Number.isNaN(startDate.getTime());
  if (startOk && startDate.getTime() > t) {
    return {
      key: "scheduled",
      label: "مجدول",
      tone: "warning",
      description: "سيظهر الإعلان عند وقت البداية.",
    };
  }

  return {
    key: "visible",
    label: "ظاهر الآن",
    tone: "success",
    description: "الإعلان ظاهر للمستخدمين حاليًا ضمن الجدولة.",
  };
}
