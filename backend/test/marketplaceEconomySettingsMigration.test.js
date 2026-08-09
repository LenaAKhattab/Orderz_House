/**
 * Marketplace Economy Settings Phase 2 — migration SQL safety (read-only file assertions).
 * Run: node --test test/marketplaceEconomySettingsMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/135_marketplace_economy_settings.sql",
);
const migration134Path = path.join(
  __dirname,
  "../sql/migrations/134_marketplace_membership_plans.sql",
);

describe("135_marketplace_economy_settings migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const sql134 = fs.readFileSync(migration134Path, "utf8");

  it("creates singleton marketplace_economy_settings table", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_economy_settings/);
    assert.match(sql, /CHECK \(id = 1\)/);
    assert.match(sql, /INSERT INTO marketplace_economy_settings \(id\)/);
    assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
  });

  it("includes policy columns with NUMERIC money precision", () => {
    assert.match(sql, /work_token_value_jod NUMERIC\(12, 3\).*DEFAULT 0\.100/s);
    assert.match(sql, /bid_tokens_per_order_jod NUMERIC\(12, 3\).*DEFAULT 1\.000/s);
    assert.match(sql, /application_token_refund_percentage NUMERIC\(5, 2\).*DEFAULT 70/s);
    assert.match(sql, /platform_commission_percentage NUMERIC\(5, 2\).*DEFAULT 30/s);
    assert.match(sql, /cash_processing_fee_jod NUMERIC\(12, 3\).*DEFAULT 5\.000/s);
  });

  it("defaults ALL execution feature flags to FALSE", () => {
    assert.match(sql, /work_tokens_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /marketplace_commission_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /cash_membership_payments_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /elite_engine_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /verification_bonuses_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it("does not alter legacy plans, activation fee, or fake/training tables", () => {
    assert.doesNotMatch(sql, /ALTER TABLE\s+plans\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plan_pages\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+freelancer_subscriptions\b/i);
    assert.doesNotMatch(sql, /system_settings/i);
    assert.doesNotMatch(sql, /subscription_activation_fee/i);
    assert.doesNotMatch(sql, /fake_order/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+marketplace_membership_plans\b/i);
  });

  it("contains no destructive drops", () => {
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /TRUNCATE/i);
    assert.doesNotMatch(sql, /DELETE FROM\s+plans\b/i);
  });

  it("does not create wallet / membership / elite / stripe execution tables", () => {
    assert.doesNotMatch(sql, /work_token_wallet|work_token_transactions|work_token_ledger/i);
    assert.doesNotMatch(sql, /freelancer_marketplace_memberships|marketplace_membership_cycles/i);
    assert.doesNotMatch(sql, /elite_entitlements|elite_offers|elite_queue/i);
    assert.doesNotMatch(sql, /stripe\.(products|prices|checkout)/i);
  });

  it("registers schema_migrations version 135", () => {
    assert.match(sql, /135_marketplace_economy_settings/);
  });

  it("does not modify already-applied migration 134 file content for economy settings", () => {
    assert.doesNotMatch(sql134, /marketplace_economy_settings/);
    assert.match(sql134, /134_marketplace_membership_plans/);
  });
});
