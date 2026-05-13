/**
 * Client-side visibility guard for public ads (matches backend schedule rules).
 * @param {import("../types/ad.js").Ad} ad
 * @param {Date} [now]
 */
export function isAdCurrentlyVisible(ad, now = new Date()) {
  if (!ad || ad.isActive === false) return false;
  const sd = ad.startDate != null ? new Date(ad.startDate) : null;
  const ed = ad.endDate != null ? new Date(ad.endDate) : null;
  if (sd && !Number.isNaN(sd.getTime()) && sd > now) return false;
  if (ed && !Number.isNaN(ed.getTime()) && ed < now) return false;
  return true;
}

/**
 * Milliseconds until the soonest `endDate` among visible ads (for silent refetch).
 * @param {import("../types/ad.js").Ad[]} ads
 * @param {Date} [now]
 * @returns {number|null}
 */
export function msUntilSoonestEnd(ads, now = new Date()) {
  const t0 = now.getTime();
  let minDelta = Infinity;
  if (!Array.isArray(ads)) return null;
  for (const ad of ads) {
    if (!ad?.endDate) continue;
    const t = new Date(ad.endDate).getTime();
    if (Number.isNaN(t)) continue;
    const delta = t - t0;
    if (delta > 0 && delta < minDelta) minDelta = delta;
  }
  return minDelta === Infinity ? null : minDelta;
}
