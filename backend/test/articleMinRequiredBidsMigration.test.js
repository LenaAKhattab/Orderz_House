/**
 * 159 migration file assertions (read-only).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/159_article_min_required_bids.sql",
);

describe("159_article_min_required_bids migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("is additive and creates collection rounds", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS opportunity_bid_collection_rounds/);
    assert.match(sql, /mini_bid_article/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS required_bid_count/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS current_bid_collection_round_id/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS relist_count/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS collection_round_id/);
    assert.match(sql, /article_min_required_bids/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(sql, /DROP CONSTRAINT/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+orders\b/i);
  });

  it("does not drop article application uniqueness (relist TODO)", () => {
    assert.match(sql, /TODO Phase Relist/i);
    assert.doesNotMatch(sql, /DROP INDEX/i);
  });
});
