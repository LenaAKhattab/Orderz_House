const test = require("node:test");
const assert = require("node:assert/strict");
const {
  distributeEvenly,
  buildMonthPeriods,
  buildStaggerBatchesForMonth,
  assignOrdersToMonthBatches,
  resolveOrderPriceJod,
  BUDGET_CONSUMING_STATUSES,
} = require("../src/services/institutionalStorageDistribution");

test("distributeEvenly spreads remainder to earliest months", () => {
  assert.deepEqual(distributeEvenly(103, 5), [21, 21, 21, 20, 20]);
  assert.deepEqual(distributeEvenly(100, 5), [20, 20, 20, 20, 20]);
  assert.deepEqual(distributeEvenly(3, 5), [1, 1, 1, 0, 0]);
  assert.deepEqual(distributeEvenly(0, 5), [0, 0, 0, 0, 0]);
});

test("buildMonthPeriods creates 30-day windows", () => {
  const periods = buildMonthPeriods("2026-01-01", 2);
  assert.equal(periods.length, 2);
  assert.equal(periods[0].periodStartDate, "2026-01-01");
  assert.equal(periods[0].periodEndDate, "2026-01-30");
  assert.equal(periods[1].periodStartDate, "2026-01-31");
});

test("buildMonthPeriods accepts Date objects from pg drivers", () => {
  const periods = buildMonthPeriods(new Date("2026-03-15T00:00:00.000Z"), 1);
  assert.equal(periods.length, 1);
  assert.equal(periods[0].periodStartDate, "2026-03-15");
});

test("buildStaggerBatchesForMonth covers full count within day 0..29", () => {
  const batches = buildStaggerBatchesForMonth(20);
  const total = batches.reduce((s, b) => s + b.orderCount, 0);
  assert.equal(total, 20);
  assert.ok(batches.length >= 2);
  for (const b of batches) {
    assert.ok(b.dayOffset >= 0 && b.dayOffset <= 29);
  }
});

test("assignOrdersToMonthBatches is deterministic and leaves remainder unscheduled", () => {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  const plan = assignOrdersToMonthBatches({
    orderIds: ids,
    monthCounts: [5, 5, 0],
    staggerByMonth: [
      buildStaggerBatchesForMonth(5),
      buildStaggerBatchesForMonth(5),
      buildStaggerBatchesForMonth(0),
    ],
  });
  assert.equal(plan.months[0].orderIds.length, 5);
  assert.equal(plan.months[1].orderIds.length, 5);
  assert.deepEqual(plan.unscheduledOrderIds, [11, 12]);
  const again = assignOrdersToMonthBatches({
    orderIds: ids,
    monthCounts: [5, 5, 0],
    staggerByMonth: [
      buildStaggerBatchesForMonth(5),
      buildStaggerBatchesForMonth(5),
      buildStaggerBatchesForMonth(0),
    ],
  });
  assert.deepEqual(plan, again);
});

test("resolveOrderPriceJod uses budget or bid max", () => {
  assert.equal(resolveOrderPriceJod({ projectType: "fixed", budget: 40 }), 40);
  assert.equal(
    resolveOrderPriceJod({ projectType: "bidding", bidBudgetMin: 10, bidBudgetMax: 25 }),
    25,
  );
  assert.throws(() => resolveOrderPriceJod({ projectType: "fixed", budget: 0 }));
});

test("budget consuming statuses exclude pending and draft", () => {
  assert.ok(!BUDGET_CONSUMING_STATUSES.includes("pending_super_admin_approval"));
  assert.ok(!BUDGET_CONSUMING_STATUSES.includes("draft"));
  assert.ok(BUDGET_CONSUMING_STATUSES.includes("approved_unscheduled"));
  assert.ok(BUDGET_CONSUMING_STATUSES.includes("released"));
});
