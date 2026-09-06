/**
 * Phase A1 — Marketplace Membership catalog + cycle Work Token grants.
 * Migration 144 SQL safety (read-only file assertions). Does not apply.
 *
 * Run: node --test test/marketplaceMembershipPhaseA1Migration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/144_marketplace_membership_catalog_and_token_grants.sql",
);

describe("144_marketplace_membership_catalog_and_token_grants migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("adds article_access_level 1..5 and does not credit tokens", () => {
    assert.match(sql, /article_access_level/);
    assert.match(sql, /CHECK \(article_access_level >= 1 AND article_access_level <= 5\)/);
    assert.doesNotMatch(sql, /INSERT INTO freelancer_work_token_wallets/i);
    assert.doesNotMatch(sql, /INSERT INTO work_token_ledger_entries/i);
    assert.doesNotMatch(sql, /INSERT INTO freelancer_marketplace_memberships/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_membership_cycles/i);
    assert.doesNotMatch(sql, /creditWorkTokens|TOKEN_CREDIT/i);
  });

  it("retires pay_as_you_work without delete/rename and upserts free/start", () => {
    assert.match(sql, /tier_code = 'pay_as_you_work'/);
    assert.match(sql, /is_active = FALSE/);
    assert.doesNotMatch(sql, /DELETE FROM marketplace_membership_plans/i);
    assert.doesNotMatch(sql, /DROP TABLE marketplace_membership_plans/i);
    assert.match(sql, /'free'/);
    assert.match(sql, /'start'/);
  });

  it("sets approved catalog prices and token grants", () => {
    assert.match(sql, /24\.990/);
    assert.match(sql, /included_tokens_per_cycle = 100|,\s*100,\s*\n\s*FALSE, 1, 1/);
    assert.match(sql, /monthly_price_jod = 44\.990/);
    assert.match(sql, /included_tokens_per_cycle = 220/);
    assert.match(sql, /monthly_price_jod = 79\.990/);
    assert.match(sql, /included_tokens_per_cycle = 420/);
    assert.match(sql, /monthly_price_jod = 119\.990/);
    assert.match(sql, /included_tokens_per_cycle = 700/);
    assert.match(sql, /article_access_level = 5/);
    assert.match(sql, /elite_direct_orders_enabled = TRUE/);
  });

  it("does not mutate legacy plans domain", () => {
    assert.doesNotMatch(sql, /ALTER TABLE\s+plans\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plan_pages\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plan_features\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+freelancer_subscriptions\b/i);
    assert.doesNotMatch(sql, /UPDATE\s+plans\b/i);
    assert.doesNotMatch(sql, /DELETE FROM\s+plans\b/i);
  });

  it("adds MEMBERSHIP_CYCLE_GRANT uniqueness and registers version", () => {
    assert.match(sql, /work_token_ledger_membership_cycle_grant_uidx/);
    assert.match(sql, /MEMBERSHIP_CYCLE_GRANT/);
    assert.match(sql, /144_marketplace_membership_catalog_and_token_grants/);
  });

  it("does not enable economy engines", () => {
    assert.doesNotMatch(sql, /work_tokens_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /priority_bidding_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /elite_engine_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /cash_membership_payments_enabled\s*=\s*TRUE/i);
  });
});
