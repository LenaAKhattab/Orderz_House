const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "sql",
  "migrations",
  "140_marketplace_normal_application_work_tokens.sql",
);

describe("migration 140 normal application work tokens", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("is additive Phase 5 economics snapshot migration", () => {
    assert.match(sql, /140_marketplace_normal_application_work_tokens/);
    assert.match(sql, /order_freelancer_bid_work_token_economics/);
    assert.match(sql, /cost_rounding_rule/);
    assert.match(sql, /CEIL/);
    assert.match(sql, /FULL/);
    assert.match(sql, /POLICY_PENDING/);
    assert.match(sql, /refund_percentage/);
    assert.match(sql, /normal_application_token_refund_percentage = 100/);
    assert.doesNotMatch(sql, /refund_rounding_rule = 'FLOOR'/);
  });

  it("relaxes bidding budget null constraint for Token cost base", () => {
    assert.match(sql, /orders_currency_by_project_type_chk/);
    assert.match(sql, /budget IS NULL\s+OR budget > 0/s);
  });

  it("extends ledger event_type CHECK for NORMAL_APPLICATION events", () => {
    assert.match(sql, /NORMAL_APPLICATION_CONSUME/);
    assert.match(sql, /NORMAL_APPLICATION_REFUND/);
    assert.match(sql, /work_token_ledger_entries_event_type_check/);
  });

  it("does not enable engines or backfill charges", () => {
    assert.doesNotMatch(sql, /work_tokens_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO order_freelancer_bid_work_token_economics/i);
    assert.doesNotMatch(sql, /UPDATE freelancer_work_token_wallets/i);
  });
});
