/**
 * Admin ads table status (display only).
 * Priority: مسودة → منتهي → مجدول → يعرض الآن
 *
 * @param {object} ad
 * @param {Date} [now]
 */
export function getAdAdminStatus(ad, now = new Date()) {
  const t = now.getTime();

  if (!ad?.isActive) {
    return {
      key: "draft",
      label: "مسودة",
      tone: "neutral",
      description: "الإعلان غير منشور ولن يظهر للزوار.",
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
      description: "انتهى وقت العرض.",
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
      description: "سيظهر عند وقت البداية.",
    };
  }

  return {
    key: "live",
    label: "يعرض الآن",
    tone: "success",
    description: "الإعلان ظاهر للزوار ضمن الجدولة.",
  };
}

/**
 * @param {number} impressions
 * @param {number} clicks
 * @returns {string}
 */
export function formatCtr(impressions, clicks) {
  const imp = Number(impressions) || 0;
  const clk = Number(clicks) || 0;
  if (imp <= 0) return "—";
  return `${((clk / imp) * 100).toFixed(1)}%`;
}
