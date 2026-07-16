require("dotenv").config();
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { trainingPoolVisibleWhereSql } = require("../src/services/trainingPoolEligibility");
const {
  computeNextAutomationRunAt,
  needsPreemptiveOverlapWindow,
  resolveMinVisibleFromSettings,
  getOverlapThresholdMs,
  getHandoffLeadTimeMs,
  resolveRoundOrderBounds,
  pickRoundTargetCount,
  selectFakeOrdersFromPool,
  buildStaggeredVisibilitySchedule,
  resolveStaggerInitialBatchCount,
} = require("../src/services/fakeOrdersService");

describe("trainingPoolEligibility", () => {
  it("public stats filter requires audience visibility", () => {
    const sql = trainingPoolVisibleWhereSql({ publicAudienceOnly: true });
    assert.match(sql, /show_to_all_visitors/);
    assert.match(sql, /visible_until > NOW\(\)/);
  });

  it("pool coverage filter uses strict expiry boundary", () => {
    const sql = trainingPoolVisibleWhereSql({ anyAudience: true });
    assert.match(sql, /visible_until > NOW\(\)/);
    assert.doesNotMatch(sql, /visible_until >= NOW\(\)/);
    assert.match(sql, /fake_order_settings_plans/);
  });

  it("automation coverage requires any eligible audience", () => {
    const sql = trainingPoolVisibleWhereSql({ anyAudience: true });
    assert.match(sql, /show_to_all_visitors/);
    assert.match(sql, /freelancer_subscriptions/);
  });

  it("poolOrderResolveService uses strict visible_until boundary", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "poolOrderResolveService.js"),
      "utf8",
    );
    assert.match(src, /visible_until > NOW\(\)/);
    assert.doesNotMatch(src, /visible_until >= NOW\(\)/);
  });

  it("trainingPoolList recovers fake orders synchronously when page would be empty", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "trainingPoolList.js"),
      "utf8",
    );
    assert.match(src, /ensureMinimumVisibleFakeOrders/);
    assert.match(src, /pool_list_handoff/);
    assert.match(src, /fakeCount === 0/);
    assert.doesNotMatch(src, /recovery_deferred_to_automation/);
  });
});

describe("fakeOrders automation gap prevention", () => {
  const settings12h = { duration_value: 12, duration_unit: "hours", min_orders: 40 };

  it("getHandoffLeadTimeMs includes overlap buffer plus one automation tick", () => {
    const overlapMs = getOverlapThresholdMs();
    const handoffMs = getHandoffLeadTimeMs();
    assert.ok(handoffMs > overlapMs);
    assert.equal(handoffMs, overlapMs + Number(process.env.FAKE_ORDERS_TICK_MS || 60_000));
  });

  it("computeNextAutomationRunAt schedules before earliest visible_until (handoff window)", () => {
    const handoffMs = getHandoffLeadTimeMs();
    const tickMs = Number(process.env.FAKE_ORDERS_TICK_MS || 60_000);
    const now = Date.UTC(2026, 5, 17, 12, 0, 0);
    const earliestUntil = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const next = computeNextAutomationRunAt({ earliestUntil }, settings12h, now);
    const expectedHandoffAt = new Date(earliestUntil).getTime() - handoffMs;
    assert.equal(next.getTime(), Math.max(now + tickMs, expectedHandoffAt));
    assert.ok(next.getTime() < new Date(earliestUntil).getTime());
  });

  it("needsPreemptiveOverlapWindow is true inside handoff lead time", () => {
    const handoffMs = getHandoffLeadTimeMs();
    const now = Date.now();
    const earliestUntil = new Date(now + handoffMs - 30_000).toISOString();
    assert.equal(needsPreemptiveOverlapWindow({ earliestUntil }, now), true);
  });

  it("needsPreemptiveOverlapWindow is false when expiry is far away", () => {
    const now = Date.now();
    const earliestUntil = new Date(now + 6 * 60 * 60 * 1000).toISOString();
    assert.equal(needsPreemptiveOverlapWindow({ earliestUntil }, now), false);
  });

  it("resolveMinVisibleFromSettings uses min_orders from DB row", () => {
    assert.equal(resolveMinVisibleFromSettings({ min_orders: 40 }), 40);
    assert.equal(resolveMinVisibleFromSettings({ min_orders: 40 }, 1), 1);
  });

  it("runAutomationTick expires after rotation, not before", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    const tickStart = src.indexOf("async function runAutomationTick()");
    const tickEnd = src.indexOf("async function getVisibleFakeOrdersCount", tickStart);
    const tickBody = src.slice(tickStart, tickEnd);
    assert.doesNotMatch(tickBody, /await expireStaleItems\(\);\s*[\s\S]*?recordMarketplaceVisibleFakeOrders/);
    assert.match(tickBody, /ensureSeamlessTrainingRotation/);
    assert.match(tickBody, /await expireStaleItems\(client\)/);
    assert.match(tickBody, /automation_post_expire/);
  });

  it("buildTrainingOrdersReadinessPayload warns when next rotation is after round end", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /rotation_scheduled_after_round_end/);
    const { buildTrainingOrdersReadinessPayload } = require("../src/services/fakeOrdersService");
    const out = buildTrainingOrdersReadinessPayload({
      eligibleForNextRound: 120,
      minOrders: 50,
      maxOrders: 100,
      currentlyVisibleFakeOrders: 69,
      nextAutomationRunAt: "2026-06-25T12:00:00.000Z",
      activeRoundVisibleUntil: "2026-06-24T12:00:00.000Z",
    });
    assert.ok(out.readinessWarnings.includes("rotation_scheduled_after_round_end"));
  });

  it("replenish only supersedes when nothing visible and nothing scheduled", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(
      src,
      /supersedeExisting = coverage\.visibleCount === 0 && coverage\.scheduledFutureCount === 0/,
    );
  });

  it("scheduled rotation uses overlap-first when orders are still visible or scheduled", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(
      src,
      /scheduleCoverage\.visibleCount === 0 && scheduleCoverage\.scheduledFutureCount === 0/,
    );
  });

  it("preemptive overlap does not require exactly one active round", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /coverage\.activeRounds === 1 &&\s*\n\s*coverage\.earliestUntil/);
    assert.match(src, /hasVisibleItemsExpiringAfter/);
  });

  it("recordMarketplaceVisibleFakeOrders requires visibility proof for explicit ids", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /fo_vis\.id = fo\.id[\s\S]*anyAudience: true/);
  });

  it("publicHomeOrderStats uses cutoff-based training completed for display", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "publicHomeOrderStatsService.js"),
      "utf8",
    );
    assert.match(src, /was_marketplace_visible = TRUE/);
    assert.match(src, /first_visible_at IS NOT NULL/);
    assert.match(src, /trainingRotationsCompletedSinceCutoff/);
    assert.match(src, /completedOrders: completedReal \+ trainingRotationsCompletedSinceCutoff/);
    assert.doesNotMatch(src, /completedOrders: completedReal,/);
  });
});

describe("training round pool selection", () => {
  it("resolveRoundOrderBounds defaults to settings min/max", () => {
    const bounds = resolveRoundOrderBounds({ min_orders: 50, max_orders: 100 });
    assert.equal(bounds.minOrders, 50);
    assert.equal(bounds.maxOrders, 100);
  });

  it("pickRoundTargetCount stays within configured bounds", () => {
    const settings = { min_orders: 50, max_orders: 100 };
    for (let i = 0; i < 40; i += 1) {
      const n = pickRoundTargetCount(settings);
      assert.ok(n >= 50 && n <= 100, `out of range: ${n}`);
    }
  });

  it("selectFakeOrdersFromPool returns unique ids up to target", () => {
    const eligible = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      categoryName: i % 3 === 0 ? "محتوى" : i % 3 === 1 ? "برمجة" : "تصميم",
      categorySlug: "x",
    }));
    const picked = selectFakeOrdersFromPool(eligible, 63, { content: 34, programming: 33, design: 33 });
    assert.equal(picked.length, 63);
    const ids = picked.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("generateTrainingRoundInternal uses existing fake_orders pool", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /loadEligibleFakeOrderPool/);
    assert.match(src, /selection_mode: "existing_fake_orders_pool"/);
    assert.match(src, /gaplessSupersede/);
    assert.match(src, /visible_until = LEAST\(visible_until, NOW\(\)\)/);
  });

  it("forced rotation creates new round before superseding when gapless", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /if \(supersedeExisting && gaplessSupersede\)/);
    assert.match(src, /exceptRoundId: roundId/);
  });
});

describe("staggered fake-order rollout", () => {
  const twelveHoursMs = 12 * 60 * 60 * 1000;
  const startsAtMs = Date.UTC(2026, 6, 16, 0, 0, 0);
  const expiresAtMs = startsAtMs + twelveHoursMs;

  it("resolveStaggerInitialBatchCount is ~20% with a floor of 10", () => {
    assert.equal(resolveStaggerInitialBatchCount(72), 15);
    assert.equal(resolveStaggerInitialBatchCount(50), 10);
    assert.equal(resolveStaggerInitialBatchCount(8), 8);
    assert.equal(resolveStaggerInitialBatchCount(1), 1);
  });

  it("buildStaggeredVisibilitySchedule keeps an immediate first batch", () => {
    const schedule = buildStaggeredVisibilitySchedule({
      orderCount: 60,
      startsAtMs,
      expiresAtMs,
    });
    assert.equal(schedule.length, 60);
    const initial = resolveStaggerInitialBatchCount(60);
    const immediate = schedule.filter((s) => s.visibleFromMs === startsAtMs);
    assert.ok(immediate.length >= initial);
    assert.ok(immediate.length < 60, "not all orders should appear immediately");
  });

  it("staggered visible_from values are not all identical for a large round", () => {
    const schedule = buildStaggeredVisibilitySchedule({
      orderCount: 72,
      startsAtMs,
      expiresAtMs,
    });
    const uniqueFrom = new Set(schedule.map((s) => s.visibleFromMs));
    assert.ok(uniqueFrom.size > 1, "expected multiple visible_from timestamps");
  });

  it("all visible_from stay within starts_at → expires_at and before visible_until", () => {
    const schedule = buildStaggeredVisibilitySchedule({
      orderCount: 72,
      startsAtMs,
      expiresAtMs,
    });
    for (const slot of schedule) {
      assert.ok(slot.visibleFromMs >= startsAtMs);
      assert.ok(slot.visibleFromMs < expiresAtMs);
      assert.ok(slot.visibleUntilMs === expiresAtMs);
      assert.ok(slot.visibleFromMs < slot.visibleUntilMs);
    }
  });

  it("short duration falls back to all-at-once visibility", () => {
    const schedule = buildStaggeredVisibilitySchedule({
      orderCount: 40,
      startsAtMs,
      expiresAtMs: startsAtMs + 10 * 60 * 1000,
    });
    assert.equal(schedule.length, 40);
    assert.ok(schedule.every((s) => s.visibleFromMs === startsAtMs));
  });

  it("activateFakeOrdersInRound uses staggered schedule helper", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /buildStaggeredVisibilitySchedule/);
    assert.match(src, /stagger_rollout: true/);
    assert.match(src, /promoteEmergencyStaggerBatch/);
    assert.match(src, /activeOrScheduledCount/);
    assert.match(src, /scheduledFutureCount/);
  });

  it("ensureMinimumVisibleFakeOrders respects scheduled future coverage", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /activeOrScheduled >= threshold/);
    assert.match(src, /status: currentVisible > 0 \? "already_visible" : "scheduled_covered"/);
    assert.match(src, /emergency_promote/);
  });

  it("eligible pool excludes committed future scheduled items", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    const eligibleStart = src.indexOf("async function loadEligibleFakeOrderPool");
    const eligibleEnd = src.indexOf("const ELIGIBLE_FAKE_ORDER_POOL_WHERE_SQL", eligibleStart);
    const body = src.slice(eligibleStart, eligibleEnd);
    assert.match(body, /ri\.visible_until > NOW\(\)/);
    assert.doesNotMatch(body, /ri\.visible_from <= NOW\(\)/);
  });

  it("pool listing still requires visible_from <= NOW()", () => {
    const sql = trainingPoolVisibleWhereSql({ anyAudience: true });
    assert.match(sql, /visible_from <= NOW\(\)/);
  });
});
