/**
 * Migration 137 — Marketplace Memberships + Cycles + Priority Bid usage ledger.
 * Parser/safety tests only. Does NOT apply migration.
 * Run: node --test test/marketplaceMembershipsMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("path");
const { scanSqlForDangerousStatements } = require("../scripts/lib/assertScriptDatabaseAllowed");
const { splitSqlStatements } = require("../scripts/lib/splitSqlStatements");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/137_marketplace_memberships_cycles.sql",
);
const migration134Path = path.join(
  __dirname,
  "../sql/migrations/134_marketplace_membership_plans.sql",
);
const migration135Path = path.join(
  __dirname,
  "../sql/migrations/135_marketplace_economy_settings.sql",
);
const migration136Path = path.join(
  __dirname,
  "../sql/migrations/136_marketplace_membership_priority_bid.sql",
);

const MIGRATION_VERSION = "137_marketplace_memberships_cycles";

describe("137_marketplace_memberships_cycles migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const sql134 = fs.readFileSync(migration134Path, "utf8");
  const sql135 = fs.readFileSync(migration135Path, "utf8");
  const sql136 = fs.readFileSync(migration136Path, "utf8");

  it("creates memberships, cycles, usage ledger, audit tables", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_marketplace_memberships/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_membership_cycles/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_membership_cycle_usage/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_membership_audit_logs/);
  });

  it("FKs to marketplace_membership_plans and users — not legacy plans", () => {
    assert.match(sql, /REFERENCES marketplace_membership_plans\(id\) ON DELETE RESTRICT/);
    assert.match(sql, /REFERENCES users\(id\) ON DELETE RESTRICT/);
    assert.doesNotMatch(sql, /REFERENCES plans\(/);
    assert.doesNotMatch(sql, /REFERENCES freelancer_subscriptions/i);
    assert.doesNotMatch(sql, /UPDATE\s+freelancer_subscriptions/i);
    assert.doesNotMatch(sql, /INSERT\s+INTO\s+freelancer_subscriptions/i);
  });

  it("protects one current membership and one active cycle", () => {
    assert.match(sql, /freelancer_marketplace_memberships_one_current_uidx/);
    assert.match(sql, /WHERE is_current = TRUE/);
    assert.match(sql, /marketplace_membership_cycles_one_active_uidx/);
    assert.match(sql, /WHERE status = 'active'/);
    assert.match(sql, /marketplace_membership_cycles_membership_number_uidx/);
  });

  it("usage idempotency unique index", () => {
    assert.match(sql, /marketplace_membership_cycle_usage_idempotency_uidx/);
    assert.match(sql, /\(reference_type, reference_id, event_type\)/);
  });

  it("no backfill / no auto-enroll / no DROP / no cascade delete history", () => {
    assert.doesNotMatch(sql, /INSERT INTO freelancer_marketplace_memberships/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_membership_cycles/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_membership_cycle_usage/i);
    assert.doesNotMatch(sql, /\bDROP\b/i);
    assert.doesNotMatch(sql, /ON DELETE CASCADE/);
    assert.doesNotMatch(sql, /TRUNCATE/i);
  });

  it("registers schema_migrations version 137", () => {
    assert.match(
      sql,
      new RegExp(`INSERT INTO schema_migrations \\(version\\) VALUES \\('${MIGRATION_VERSION}'\\)`),
    );
  });

  it("does not enable economy feature flags", () => {
    assert.doesNotMatch(sql, /priority_bidding_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /work_tokens_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /UPDATE marketplace_economy_settings/i);
  });

  it("passes dangerous SQL scan and splits cleanly", () => {
    const scan = scanSqlForDangerousStatements(sql);
    assert.strictEqual(scan.dangerous, false);
    assert.deepStrictEqual(scan.findings, []);
    const stmts = splitSqlStatements(sql);
    assert.ok(stmts.length >= 5);
  });

  it("leaves migrations 134/135/136 file contents intact (byte-stable check vs self)", () => {
    assert.match(sql134, /marketplace_membership_plans/);
    assert.match(sql135, /marketplace_economy_settings/);
    assert.match(sql136, /priority_bid_uses_per_cycle/);
    assert.doesNotMatch(sql134, /freelancer_marketplace_memberships/);
    assert.doesNotMatch(sql135, /freelancer_marketplace_memberships/);
    assert.doesNotMatch(sql136, /freelancer_marketplace_memberships/);
  });
});

describe("Phase 3 isolation wiring", () => {
  it("app mounts freelancer + super-admin read routes", () => {
    const appPath = path.join(__dirname, "../src/app.js");
    const app = fs.readFileSync(appPath, "utf8");
    assert.match(app, /freelancerMarketplaceMembershipRoutes/);
    assert.match(app, /superAdminMarketplaceMembershipsRoutes/);
  });

  it("no public consume Priority Bid route", () => {
    const freelPath = path.join(
      __dirname,
      "../src/routes/freelancerMarketplaceMembershipRoutes.js",
    );
    const freel = fs.readFileSync(freelPath, "utf8");
    assert.doesNotMatch(freel, /router\.(post|put|patch|delete)/i);
    assert.match(freel, /marketplace-membership/);
  });

  it("plans routes untouched for public cutover", () => {
    const plansRoutes = fs.readFileSync(
      path.join(__dirname, "../src/routes/plansRoutes.js"),
      "utf8",
    );
    assert.doesNotMatch(plansRoutes, /marketplace_membership/);
  });
});
