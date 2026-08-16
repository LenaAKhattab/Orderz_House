/**
 * 160 migration file assertions (read-only; do not apply).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "../sql/migrations/160_pantry_min_required_bids.sql");

describe("160_pantry_min_required_bids migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("is additive pantry-only and reuses pantry_request rounds", () => {
    assert.match(sql, /pantry_min_required_bids/);
    assert.match(sql, /pantry_allowed_required_bid_counts/);
    assert.match(sql, /pantry_default_required_bid_count/);
    assert.match(sql, /pantry_auto_close_when_threshold_reached/);
    assert.match(sql, /pantry_auto_assign_when_threshold_reached BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /pantry_refund_policy/);
    assert.match(sql, /pantry_requests[\s\S]*required_bid_count INTEGER NULL/);
    assert.match(sql, /current_bid_collection_round_id/);
    assert.match(sql, /relist_count INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /bid_collection_outcome/);
    assert.match(sql, /pantry_bids[\s\S]*collection_round_id/);
    assert.match(sql, /opportunity_bid_collection_rounds/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(sql, /DROP CONSTRAINT/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+orders\b/i);
    assert.doesNotMatch(sql, /CREATE TABLE/i);
  });

  it("does not drop pantry bid uniqueness", () => {
    assert.doesNotMatch(sql, /DROP INDEX/i);
    assert.doesNotMatch(sql, /UNIQUE \(pantry_request_id, freelancer_id\)/);
  });
});
