/**
 * Deterministic monthly + 30-day staggered batch distribution for institutional storage.
 * Pure functions — no DB. Generation results must be persisted so restarts do not reshuffle.
 */

/** Distribute total items across monthCount buckets as evenly as possible (larger remainders first). */
function distributeEvenly(total, monthCount) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  const m = Math.max(0, Math.floor(Number(monthCount) || 0));
  if (m < 1) return [];
  const base = Math.floor(n / m);
  const rem = n % m;
  const counts = [];
  for (let i = 0; i < m; i += 1) {
    counts.push(base + (i < rem ? 1 : 0));
  }
  return counts;
}

/**
 * Build month period windows of 30 days starting from distributionStartDate.
 * @param {string|Date} startDate
 * @param {number} monthCount
 */
function buildMonthPeriods(startDate, monthCount) {
  const m = Math.max(0, Math.floor(Number(monthCount) || 0));
  let dateStr = "";
  if (startDate instanceof Date && Number.isFinite(startDate.getTime())) {
    dateStr = startDate.toISOString().slice(0, 10);
  } else {
    const raw = String(startDate || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) dateStr = raw.slice(0, 10);
    else {
      const parsed = new Date(startDate);
      if (Number.isFinite(parsed.getTime())) dateStr = parsed.toISOString().slice(0, 10);
    }
  }
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  if (!dateStr || !Number.isFinite(start.getTime()) || m < 1) return [];
  const periods = [];
  for (let i = 0; i < m; i += 1) {
    const periodStart = new Date(start.getTime());
    periodStart.setUTCDate(periodStart.getUTCDate() + i * 30);
    const periodEnd = new Date(periodStart.getTime());
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 29);
    periods.push({
      monthSequence: i + 1,
      periodStartDate: periodStart.toISOString().slice(0, 10),
      periodEndDate: periodEnd.toISOString().slice(0, 10),
      periodStartAt: periodStart,
      periodEndAt: periodEnd,
    });
  }
  return periods;
}

/**
 * Deterministic stagger days within a 30-day window for `count` orders.
 * Spreads into ceil(count/5) batches (min 1 if count>0), covering day offsets 0..29.
 * Returns array of { dayOffset, orderCount }.
 */
function buildStaggerBatchesForMonth(orderCount) {
  const n = Math.max(0, Math.floor(Number(orderCount) || 0));
  if (n < 1) return [];
  if (n === 1) return [{ dayOffset: 0, orderCount: 1 }];

  const batchCount = Math.min(n, Math.max(2, Math.ceil(n / 5)));
  const sizes = distributeEvenly(n, batchCount);
  const dayOffsets = [];
  if (batchCount === 1) {
    dayOffsets.push(0);
  } else {
    for (let i = 0; i < batchCount; i += 1) {
      const offset = Math.round((i * 29) / (batchCount - 1));
      dayOffsets.push(Math.min(29, Math.max(0, offset)));
    }
  }

  return sizes.map((orderCountForBatch, idx) => ({
    dayOffset: dayOffsets[idx],
    orderCount: orderCountForBatch,
  })).filter((b) => b.orderCount > 0);
}

/** Assign ordered order IDs into month/batch slots without reshuffling released ones. */
function assignOrdersToMonthBatches({ orderIds, monthCounts, staggerByMonth }) {
  const ids = Array.isArray(orderIds) ? orderIds.map(Number) : [];
  let cursor = 0;
  const months = [];
  for (let mi = 0; mi < monthCounts.length; mi += 1) {
    const target = Number(monthCounts[mi]) || 0;
    const monthOrderIds = ids.slice(cursor, cursor + target);
    cursor += target;
    const stagger = staggerByMonth[mi] || buildStaggerBatchesForMonth(monthOrderIds.length);
    const batches = [];
    let batchCursor = 0;
    for (const slot of stagger) {
      const slice = monthOrderIds.slice(batchCursor, batchCursor + slot.orderCount);
      batchCursor += slot.orderCount;
      if (slice.length) {
        batches.push({
          dayOffset: slot.dayOffset,
          orderIds: slice,
          assignedOrderCount: slice.length,
        });
      }
    }
    // Remainder if stagger under-assigned
    if (batchCursor < monthOrderIds.length) {
      const rest = monthOrderIds.slice(batchCursor);
      batches.push({
        dayOffset: 29,
        orderIds: rest,
        assignedOrderCount: rest.length,
      });
    }
    months.push({
      monthSequence: mi + 1,
      targetOrderCount: target,
      orderIds: monthOrderIds,
      batches,
    });
  }
  return {
    months,
    unscheduledOrderIds: ids.slice(cursor),
  };
}

/** Statuses that consume the storage financial limit. */
const BUDGET_CONSUMING_STATUSES = Object.freeze([
  "approved_unscheduled",
  "scheduled",
  "released",
  "paused",
]);

function resolveOrderPriceJod({ projectType, budget, bidBudgetMin, bidBudgetMax }) {
  if (projectType === "bidding") {
    const max = Number(bidBudgetMax);
    if (!Number.isFinite(max) || max <= 0) {
      const err = new Error("حد المزايدة الأعلى مطلوب لحساب الحد المالي.");
      err.statusCode = 400;
      throw err;
    }
    return max;
  }
  const b = Number(budget);
  if (!Number.isFinite(b) || b <= 0) {
    const err = new Error("ميزانية الطلب مطلوبة لحساب الحد المالي.");
    err.statusCode = 400;
    throw err;
  }
  return b;
}

module.exports = {
  distributeEvenly,
  buildMonthPeriods,
  buildStaggerBatchesForMonth,
  assignOrdersToMonthBatches,
  BUDGET_CONSUMING_STATUSES,
  resolveOrderPriceJod,
};
