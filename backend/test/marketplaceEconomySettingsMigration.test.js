/**
 * Marketplace Economy Settings migration safety (Priority Bid / Fairness update).
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

  it("creates singleton with normal-application + Priority Bid + fairness namespaces", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_economy_settings/);
    assert.match(sql, /CHECK \(id = 1\)/);
    assert.match(sql, /normal_application_tokens_per_order_jod/);
    assert.match(sql, /normal_application_token_refund_percentage/);
    assert.match(sql, /priority_bidding_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /priority_bid_assignment_strategy.*HIGHEST_TOKEN_ONLY/s);
    assert.match(sql, /fair_work_distribution_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it("does not use old bid_tokens_per_order_jod as Priority Bid formula", () => {
    assert.doesNotMatch(sql, /\bbid_tokens_per_order_jod\b/);
    assert.match(sql, /NOT the Priority Bid amount/i);
    assert.match(sql, /always 100%/i);
  });

  it("defaults execution engines OFF", () => {
    assert.match(sql, /work_tokens_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /priority_bidding_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /fair_work_distribution_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /elite_engine_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it("does not alter legacy / fake / 134 plan table destructively", () => {
    assert.doesNotMatch(sql, /ALTER TABLE\s+plans\b/i);
    assert.doesNotMatch(sql, /fake_order/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+marketplace_membership_plans\b/i);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql134, /marketplace_economy_settings/);
  });

  it("does not create wallet / auction / fairness execution tables", () => {
    assert.doesNotMatch(sql, /work_token_wallet|PRIORITY_BID_RESERVE/i);
    assert.doesNotMatch(sql, /priority_bid_auctions|elite_entitlements/i);
    assert.doesNotMatch(sql, /fairness_stats|assignment_decision/i);
  });

  it("registers schema_migrations version 135", () => {
    assert.match(sql, /135_marketplace_economy_settings/);
  });
});
