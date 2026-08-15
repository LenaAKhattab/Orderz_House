/**
 * 156_default_plan_catalog — additive settings seed only.
 * Run: node --test test/defaultPlanCatalogMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const migrationPath = path.join(__dirname, "../sql/migrations/156_default_plan_catalog.sql");

describe("156_default_plan_catalog migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("seeds default_plan_catalog = marketplace_plans without touching plan tables", () => {
    assert.match(sql, /156_default_plan_catalog/);
    assert.match(sql, /INSERT INTO system_settings/);
    assert.match(sql, /'default_plan_catalog'/);
    assert.match(sql, /'marketplace_plans'/);
    assert.match(sql, /ON CONFLICT \(key\) DO NOTHING/);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plans\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plan_pages\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+marketplace_membership_plans\b/i);
    assert.doesNotMatch(sql, /INSERT INTO\s+plans\b/i);
    assert.doesNotMatch(sql, /DELETE FROM\s+plans\b/i);
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });

  it("checksum is stable for review", () => {
    const checksum = crypto.createHash("sha256").update(sql).digest("hex").toUpperCase();
    assert.equal(checksum.length, 64);
    assert.match(checksum, /^[0-9A-F]{64}$/);
  });
});
