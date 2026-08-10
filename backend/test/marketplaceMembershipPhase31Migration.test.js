/**
 * Migration 138 — Phase 3.1 hardening (parser/safety). Does NOT apply.
 * Run: node --test test/marketplaceMembershipPhase31Migration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("path");
const { scanSqlForDangerousStatements } = require("../scripts/lib/assertScriptDatabaseAllowed");
const { splitSqlStatements } = require("../scripts/lib/splitSqlStatements");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/138_marketplace_membership_phase3_1_hardening.sql",
);
const migration137Path = path.join(
  __dirname,
  "../sql/migrations/137_marketplace_memberships_cycles.sql",
);

describe("138_marketplace_membership_phase3_1_hardening migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const sql137 = fs.readFileSync(migration137Path, "utf8");

  it("adds superseded + current/status consistency CHECK", () => {
    assert.match(sql, /'superseded'/);
    assert.match(sql, /freelancer_marketplace_memberships_current_status_consistency/);
    assert.match(sql, /is_current = TRUE/);
  });

  it("replaces usage unique index with cycle-scoped key", () => {
    assert.match(sql, /DROP INDEX IF EXISTS marketplace_membership_cycle_usage_idempotency_uidx/);
    assert.match(
      sql,
      /marketplace_membership_cycle_usage_cycle_idempotency_uidx[\s\S]*\(cycle_id, reference_type, reference_id, event_type\)/,
    );
  });

  it("adds related_usage_id + one-return-per-consume unique", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS related_usage_id/);
    assert.match(sql, /marketplace_membership_cycle_usage_one_return_per_consume_uidx/);
  });

  it("does not edit 137 / no destructive data ops / no economy flips", () => {
    assert.doesNotMatch(sql, /UPDATE marketplace_economy_settings/i);
    assert.doesNotMatch(sql, /TRUNCATE/i);
    assert.doesNotMatch(sql, /freelancer_subscriptions/);
    assert.match(sql137, /freelancer_marketplace_memberships/);
    assert.doesNotMatch(sql137, /superseded/);
  });

  it("registers schema_migrations 138 and passes dangerous scan", () => {
    assert.match(
      sql,
      /INSERT INTO schema_migrations \(version\) VALUES \('138_marketplace_membership_phase3_1_hardening'\)/,
    );
    const scan = scanSqlForDangerousStatements(sql);
    assert.strictEqual(scan.dangerous, false);
    assert.deepStrictEqual(scan.findings, []);
    const stmts = splitSqlStatements(sql);
    assert.ok(stmts.length >= 5);
  });
});
