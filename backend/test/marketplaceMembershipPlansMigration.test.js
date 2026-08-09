/**
 * Marketplace Membership Phase 1 — migration SQL safety (read-only file assertions).
 * Run: node --test test/marketplaceMembershipPlansMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/134_marketplace_membership_plans.sql",
);

describe("134_marketplace_membership_plans migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("creates dedicated marketplace_membership_plans table", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_membership_plans/);
    assert.match(sql, /tier_code/);
    assert.match(sql, /max_real_order_value_jod/);
    assert.match(sql, /unlimited_real_order_value/);
    assert.match(sql, /included_tokens_per_cycle/);
    assert.match(sql, /elite_direct_orders_enabled/);
    assert.match(sql, /monthly_price_jod/);
  });

  it("does not alter legacy plans / plan_pages / freelancer_subscriptions", () => {
    assert.doesNotMatch(sql, /ALTER TABLE\s+plans\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plan_pages\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plan_features\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+freelancer_subscriptions\b/i);
    assert.doesNotMatch(sql, /fake_order_settings_plans/i);
  });

  it("contains no destructive drops of legacy plan domain", () => {
    assert.doesNotMatch(sql, /DROP TABLE\s+plans\b/i);
    assert.doesNotMatch(sql, /DROP TABLE\s+plan_pages\b/i);
    assert.doesNotMatch(sql, /TRUNCATE\s+plans\b/i);
    assert.doesNotMatch(sql, /DELETE FROM\s+plans\b/i);
  });

  it("seeds four tier codes without hardcoding numeric ids", () => {
    for (const code of ["pay_as_you_work", "active", "pro", "elite"]) {
      assert.match(sql, new RegExp(`'${code}'`));
    }
    assert.doesNotMatch(sql, /WHERE id\s*=\s*[1-4]\b/);
    assert.match(sql, /ON CONFLICT \(tier_code\) DO NOTHING/);
  });

  it("configures Elite as unlimited real-order access with elite flag", () => {
    assert.match(sql, /'elite'/);
    assert.match(sql, /unlimited_real_order_value/);
    assert.match(sql, /elite_direct_orders_enabled/);
    // Seed values block for elite: NULL max, TRUE unlimited, … TRUE elite flag
    assert.match(
      sql,
      /'elite'[\s\S]{0,400}NULL,\s*TRUE[\s\S]{0,120}TRUE\s*\n\s*\)/,
    );
  });

  it("defaults included_tokens_per_cycle to 0 in seed", () => {
    assert.match(sql, /included_tokens_per_cycle/);
    const seedBlock = sql.slice(sql.indexOf("INSERT INTO marketplace_membership_plans"));
    assert.match(seedBlock, /,\s*0,\s*\n\s*FALSE,\s*1,\s*1/);
  });

  it("registers schema_migrations version", () => {
    assert.match(sql, /134_marketplace_membership_plans/);
  });

  it("does not create Stripe objects or call external APIs", () => {
    assert.doesNotMatch(sql, /stripe\.(products|prices|checkout)/i);
    assert.doesNotMatch(sql, /https:\/\/api\.stripe\.com/);
  });
});
