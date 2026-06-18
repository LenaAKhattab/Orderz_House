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

  it("trainingPoolList does not recover fake orders during page request", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "trainingPoolList.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /ensureMinimumVisibleFakeOrders/);
    assert.match(src, /recovery_deferred_to_automation/);
    assert.match(src, /fakeCount === 0/);
  });
});

describe("fakeOrders automation gap prevention", () => {
  const settings12h = { duration_value: 12, duration_unit: "hours", min_orders: 40 };

  it("computeNextAutomationRunAt schedules before earliest visible_until (overlap window)", () => {
    const overlapMs = getOverlapThresholdMs();
    const now = Date.UTC(2026, 5, 17, 12, 0, 0);
    const earliestUntil = new Date(now + 2 * 60 * 60 * 1000).toISOString();
    const next = computeNextAutomationRunAt({ earliestUntil }, settings12h, now);
    const expectedOverlapAt = new Date(earliestUntil).getTime() - overlapMs;
    assert.equal(next.getTime(), expectedOverlapAt);
    assert.ok(next.getTime() < new Date(earliestUntil).getTime());
  });

  it("needsPreemptiveOverlapWindow is true inside overlap lead time", () => {
    const overlapMs = getOverlapThresholdMs();
    const now = Date.now();
    const earliestUntil = new Date(now + overlapMs - 30_000).toISOString();
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
  });

  it("replenish only supersedes when visible count is already zero", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /supersedeExisting = coverage\.visibleCount === 0/);
  });

  it("scheduled rotation uses overlap-first when orders are still visible", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
      "utf8",
    );
    assert.match(src, /const supersedeExisting = scheduleCoverage\.visibleCount === 0/);
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

  it("publicHomeOrderStats still requires was_marketplace_visible for completed training", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "publicHomeOrderStatsService.js"),
      "utf8",
    );
    assert.match(src, /was_marketplace_visible = TRUE/);
    assert.match(src, /first_visible_at IS NOT NULL/);
    assert.match(src, /completedOrders: completedReal \+ trainingRotationsCompleted/);
  });
});
