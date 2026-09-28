/**
 * Admin ads table status (display only).
 * Priority: draft → expired → scheduled → live
 *
 * @param {object} ad
 * @param {Date} [now]
 */
export function getAdAdminStatus(ad, now = new Date()) {
  const t = now.getTime();

  if (!ad?.isActive) {
    return {
      key: "draft",
      tone: "neutral",
    };
  }

  const endRaw = ad.endDate;
  const endDate = endRaw ? new Date(endRaw) : null;
  const endOk = endDate && !Number.isNaN(endDate.getTime());
  if (endOk && endDate.getTime() < t) {
    return {
      key: "expired",
      tone: "danger",
    };
  }

  const startRaw = ad.startDate;
  const startDate = startRaw ? new Date(startRaw) : null;
  const startOk = startDate && !Number.isNaN(startDate.getTime());
  if (startOk && startDate.getTime() > t) {
    return {
      key: "scheduled",
      tone: "warning",
    };
  }

  return {
    key: "live",
    tone: "success",
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
