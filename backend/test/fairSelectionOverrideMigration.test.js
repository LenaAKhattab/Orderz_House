const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "../sql/migrations/162_fair_selection_overrides.sql");

describe("162_fair_selection_overrides migration file", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("creates override audit table without touching orders or Stripe", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS fair_distribution_selection_overrides/);
    assert.match(sql, /mini_bid_article/);
    assert.match(sql, /pantry_request/);
    assert.match(sql, /override_reason TEXT NOT NULL/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS fair_distribution_decisions/);
    assert.doesNotMatch(sql, /\border_id\b/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(sql, /\bDELETE FROM\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+orders\b/i);
  });
});
