/**
 * Calendar-safe anniversary cycle date helpers for Marketplace Memberships.
 * Anchored to membership start day-of-month (1–31), not calendar-month resets.
 * Uses UTC calendar components for deterministic server behavior.
 */

/**
 * @param {Date|string|number} value
 * @returns {Date}
 */
function toUtcDate(value) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date");
  }
  return d;
}

/**
 * Clamp day-of-month into the target UTC year/month (0-based month).
 * Jan 31 + 1 month → Feb 28/29; then Mar restores to 31 via anchorDay.
 * @param {number} year
 * @param {number} monthIndex0
 * @param {number} anchorDay
 * @returns {Date} UTC midnight
 */
function utcDateClamped(year, monthIndex0, anchorDay) {
  const day = Math.max(1, Math.min(31, Number(anchorDay) || 1));
  // Day 0 of next month = last day of target month
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const useDay = Math.min(day, lastDay);
  return new Date(Date.UTC(year, monthIndex0, useDay, 0, 0, 0, 0));
}

/**
 * Add N calendar months preserving anchor day when the month has that day.
 * @param {Date|string} from
 * @param {number} months
 * @param {number} anchorDay 1–31
 * @returns {Date}
 */
function addCalendarMonthsAnchored(from, months, anchorDay) {
  const start = toUtcDate(from);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth();
  const targetIndex = m + Number(months);
  const year = y + Math.floor(targetIndex / 12);
  const monthIndex0 = ((targetIndex % 12) + 12) % 12;
  // Preserve time-of-day from start on the clamped calendar day
  const base = utcDateClamped(year, monthIndex0, anchorDay);
  base.setUTCHours(
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  );
  return base;
}

/**
 * Resolve anchor day from a membership start instant (UTC day-of-month).
 * @param {Date|string} startedAt
 * @returns {number}
 */
function resolveCycleAnchorDay(startedAt) {
  const d = toUtcDate(startedAt);
  return d.getUTCDate();
}

/**
 * Build a half-open cycle window [startsAt, endsAt) for cycleNumber (1-based)
 * relative to membership start.
 * Cycle N: start = start + (N-1) months, end = start + N months (anchor-safe).
 * @param {{ membershipStartedAt: Date|string, cycleNumber: number, anchorDay: number }} input
 */
function computeCycleWindow({ membershipStartedAt, cycleNumber, anchorDay }) {
  const n = Number(cycleNumber);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("cycleNumber must be an integer >= 1");
  }
  const startedAt = toUtcDate(membershipStartedAt);
  const day = Number(anchorDay) || resolveCycleAnchorDay(startedAt);
  const startsAt = n === 1 ? startedAt : addCalendarMonthsAnchored(startedAt, n - 1, day);
  const endsAt = addCalendarMonthsAnchored(startedAt, n, day);
  if (!(endsAt > startsAt)) {
    throw new Error("Invalid cycle window");
  }
  return { startsAt, endsAt, cycleNumber: n, anchorDay: day };
}

/**
 * Which 1-based cycle number contains `at` for a membership that started at `membershipStartedAt`.
 * Returns null if `at` is before start.
 */
function resolveCycleNumberAt({ membershipStartedAt, at, anchorDay, maxCycles = 1200 }) {
  const startedAt = toUtcDate(membershipStartedAt);
  const instant = toUtcDate(at);
  if (instant < startedAt) return null;
  const day = Number(anchorDay) || resolveCycleAnchorDay(startedAt);
  // Binary-ish walk: find largest n where cycle start <= instant
  let lo = 1;
  let hi = 1;
  while (hi <= maxCycles && addCalendarMonthsAnchored(startedAt, hi - 1, day) <= instant) {
    lo = hi;
    hi *= 2;
  }
  let best = lo;
  let left = lo;
  let right = Math.min(hi, maxCycles);
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midStart = addCalendarMonthsAnchored(startedAt, mid - 1, day);
    if (midStart <= instant) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return best;
}

module.exports = {
  toUtcDate,
  utcDateClamped,
  addCalendarMonthsAnchored,
  resolveCycleAnchorDay,
  computeCycleWindow,
  resolveCycleNumberAt,
};
