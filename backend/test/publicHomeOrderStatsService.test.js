require("dotenv").config();
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  aggregateHeroOrderCounts,
  trainingRotationsCompletedSinceCutoffSql,
} = require("../src/services/publicHomeOrderStatsService");
const { trainingPoolVisibleWhereSql } = require("../src/services/trainingPoolEligibility");

describe("publicHomeOrderStatsService", () => {
  it("completedOrders = completedOrdersReal + trainingRotationsCompletedSinceCutoff", () => {
    const counts = aggregateHeroOrderCounts({
      available_real: 3,
      available_training: 4,
      completed_real: 10,
      training_rotations_completed: 331,
      training_rotations_completed_since_cutoff: 7,
    });
    assert.equal(counts.completedOrdersReal, 10);
    assert.equal(counts.trainingRotationsCompletedTotal, 331);
    assert.equal(counts.trainingRotationsCompletedSinceCutoff, 7);
    assert.equal(counts.trainingRotationsCompleted, 331);
    assert.equal(counts.completedOrders, 17);
    assert.notEqual(counts.completedOrders, counts.completedOrdersReal + counts.trainingRotationsCompletedTotal);
    assert.equal(counts.availableOrdersNow, 7);
    assert.equal(counts.availableOrdersNowReal, 3);
    assert.equal(counts.availableOrdersNowTraining, 4);
  });

  it("old training before cutoff does not inflate completedOrders", () => {
    const counts = aggregateHeroOrderCounts({
      available_real: 2,
      available_training: 5,
      completed_real: 0,
      training_rotations_completed: 331,
      training_rotations_completed_since_cutoff: 0,
    });
    assert.equal(counts.completedOrders, 0);
    assert.equal(counts.trainingRotationsCompletedTotal, 331);
    assert.equal(counts.trainingRotationsCompletedSinceCutoff, 0);
    assert.equal(counts.availableOrdersNow, 7);
  });

  it("post-cutoff training increases completedOrders; availableOrdersNow unchanged", () => {
    const counts = aggregateHeroOrderCounts({
      available_real: 1,
      available_training: 69,
      completed_real: 5,
      training_rotations_completed: 331,
      training_rotations_completed_since_cutoff: 69,
    });
    assert.equal(counts.availableOrdersNow, 70);
    assert.equal(counts.completedOrders, 74);
    assert.equal(counts.completedOrdersReal, 5);
    assert.equal(counts.trainingRotationsCompletedSinceCutoff, 69);
  });

  it("SQL requires marketplace visibility proof for training completed counts", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "publicHomeOrderStatsService.js"),
      "utf8",
    );
    assert.match(src, /was_marketplace_visible = TRUE/);
    assert.match(src, /first_visible_at IS NOT NULL/);
    assert.match(src, /trainingRotationsCompletedSinceCutoff/);
    assert.match(src, /completedOrders: completedReal \+ trainingRotationsCompletedSinceCutoff/);
  });

  it("since-cutoff SQL uses ended visible_until and cutoff parameter", () => {
    const sql = trainingRotationsCompletedSinceCutoffSql(5);
    assert.match(sql, /MAX\(ri\.visible_until\)/);
    assert.match(sql, /visible_until <= NOW\(\)/);
    assert.match(sql, /\$5::timestamptz/);
    assert.match(sql, /was_marketplace_visible = TRUE/);
  });

  it("training completed exclusion uses full audience-aware pool visibility", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "publicHomeOrderStatsService.js"),
      "utf8",
    );
    const anyAudienceSql = trainingPoolVisibleWhereSql({ anyAudience: true });
    assert.match(src, /anyAudience: true/);
    assert.match(anyAudienceSql, /fake_order_settings_plans/);
    assert.match(anyAudienceSql, /visible_until > NOW\(\)/);
  });

  it("training completed NOT EXISTS correlates outer fake order (fo_vis alias)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "publicHomeOrderStatsService.js"),
      "utf8",
    );
    assert.match(src, /trainingPoolVisibleFromSql\("fo_vis"\)/);
    assert.match(src, /fo_vis\.id = fo\.id/);
    assert.doesNotMatch(src, /WHERE fo\.id = ri\.fake_order_id/);
  });

  it("available training count uses public audience pool predicate", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "publicHomeOrderStatsService.js"),
      "utf8",
    );
    assert.match(src, /publicAudienceOnly: true/);
    const publicSql = trainingPoolVisibleWhereSql({ publicAudienceOnly: true });
    assert.match(publicSql, /show_to_all_visitors/);
  });
});
