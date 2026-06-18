require("dotenv").config();
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  aggregateHeroOrderCounts,
} = require("../src/services/publicHomeOrderStatsService");
const { trainingPoolVisibleWhereSql } = require("../src/services/trainingPoolEligibility");

describe("publicHomeOrderStatsService", () => {
  it("completedOrders display equals realCompleted + trainingRotationsCompleted", () => {
    const counts = aggregateHeroOrderCounts({
      available_real: 3,
      available_training: 4,
      completed_real: 10,
      training_rotations_completed: 7,
      open_projects: 0,
      in_progress_projects: 0,
      completed_projects: 10,
    });
    assert.equal(counts.completedOrdersReal, 10);
    assert.equal(counts.trainingRotationsCompleted, 7);
    assert.equal(counts.completedOrders, 17);
    assert.equal(counts.availableOrdersNow, 7);
    assert.equal(counts.availableOrdersNowReal, 3);
    assert.equal(counts.availableOrdersNowTraining, 4);
  });

  it("completedOrders is real-only when no proven training rotations ended", () => {
    const counts = aggregateHeroOrderCounts({
      available_real: 2,
      available_training: 5,
      completed_real: 0,
      training_rotations_completed: 0,
    });
    assert.equal(counts.completedOrders, 0);
    assert.equal(counts.availableOrdersNow, 7);
  });

  it("training rotations completed do not affect availableOrdersNow", () => {
    const counts = aggregateHeroOrderCounts({
      available_real: 1,
      available_training: 2,
      completed_real: 5,
      training_rotations_completed: 20,
    });
    assert.equal(counts.availableOrdersNow, 3);
    assert.equal(counts.completedOrders, 25);
  });

  it("SQL requires marketplace visibility proof for training completed count", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "publicHomeOrderStatsService.js"),
      "utf8",
    );
    assert.match(src, /was_marketplace_visible = TRUE/);
    assert.match(src, /first_visible_at IS NOT NULL/);
    assert.match(src, /completedOrders: completedReal \+ trainingRotationsCompleted/);
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
