/**
 * Deterministic integer Bid Credit daily distribution math — Phase B1.
 *
 * cumulative unlocked at day k: floor(N * k / D)
 * newly unlocked on day k: floor(N * k / D) - floor(N * (k - 1) / D)
 *
 * Uses integer arithmetic only (no floating-point).
 */

function assertNonNegInt(name, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return n;
}

function assertPositiveInt(name, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

/**
 * Cumulative Bids unlocked after completing dayIndex (1..dayCount).
 * dayIndex 0 => 0.
 */
function cumulativeBidUnlock(monthlyAllowance, dayIndex, dayCount) {
  const N = assertNonNegInt("monthlyAllowance", monthlyAllowance);
  const D = assertPositiveInt("dayCount", dayCount);
  const k = assertNonNegInt("dayIndex", dayIndex);
  if (k === 0) return 0;
  if (k > D) {
    throw new Error("dayIndex cannot exceed dayCount");
  }
  // floor(N * k / D) via integer division
  return Math.floor((N * k) / D);
}

/**
 * Newly unlocked Bids on day k (1..dayCount).
 */
function dailyBidUnlockAmount(monthlyAllowance, dayIndex, dayCount) {
  const k = assertPositiveInt("dayIndex", dayIndex);
  const D = assertPositiveInt("dayCount", dayCount);
  if (k > D) {
    throw new Error("dayIndex cannot exceed dayCount");
  }
  return (
    cumulativeBidUnlock(monthlyAllowance, k, dayCount) -
    cumulativeBidUnlock(monthlyAllowance, k - 1, dayCount)
  );
}

/**
 * Full unlock schedule for a month (length = dayCount).
 * Sum equals monthlyAllowance exactly.
 */
function buildMonthlyBidUnlockSchedule(monthlyAllowance, dayCount) {
  const N = assertNonNegInt("monthlyAllowance", monthlyAllowance);
  const D = assertPositiveInt("dayCount", dayCount);
  const schedule = [];
  let sum = 0;
  for (let k = 1; k <= D; k += 1) {
    const amount = dailyBidUnlockAmount(N, k, D);
    schedule.push({ dayIndex: k, amount, cumulative: cumulativeBidUnlock(N, k, D) });
    sum += amount;
  }
  if (sum !== N) {
    throw new Error(`Distribution integrity failure: sum=${sum} expected=${N}`);
  }
  return schedule;
}

/**
 * Inclusive UTC calendar day count between start and end.
 * Day boundaries use UTC date parts of the window.
 * Example: same instant start/end spanning one calendar day => 1.
 */
function countUtcCalendarDaysInWindow(windowStartsAt, windowEndsAt) {
  const start = new Date(windowStartsAt);
  const end = new Date(windowEndsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid window timestamps");
  }
  if (end <= start) {
    throw new Error("windowEndsAt must be after windowStartsAt");
  }
  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  // Exclusive end: last included day is the calendar day before end if end is exactly midnight,
  // otherwise the calendar day of (end - 1ms).
  const endInclusive = new Date(end.getTime() - 1);
  const endUtc = Date.UTC(
    endInclusive.getUTCFullYear(),
    endInclusive.getUTCMonth(),
    endInclusive.getUTCDate(),
  );
  const days = Math.floor((endUtc - startUtc) / 86400000) + 1;
  if (days < 1) {
    throw new Error("dayCount resolved to < 1");
  }
  return days;
}

/**
 * Current day index (1..dayCount) for `now` inside [starts, ends).
 * Before window => 0. On/after end => dayCount.
 */
function resolveCurrentDayIndex(windowStartsAt, windowEndsAt, dayCount, now = new Date()) {
  const D = assertPositiveInt("dayCount", dayCount);
  const start = new Date(windowStartsAt);
  const end = new Date(windowEndsAt);
  const instant = new Date(now);
  if (instant < start) return 0;
  if (instant >= end) return D;

  const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const nowUtc = Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
  const idx = Math.floor((nowUtc - startUtc) / 86400000) + 1;
  if (idx < 1) return 1;
  if (idx > D) return D;
  return idx;
}

module.exports = {
  cumulativeBidUnlock,
  dailyBidUnlockAmount,
  buildMonthlyBidUnlockSchedule,
  countUtcCalendarDaysInWindow,
  resolveCurrentDayIndex,
};
