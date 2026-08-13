const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "sql",
  "migrations",
  "141_marketplace_priority_bid_auction.sql",
);

describe("migration 141 priority bid auction", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("is additive Phase 6 auction storage", () => {
    assert.match(sql, /141_marketplace_priority_bid_auction/);
    assert.match(sql, /priority_bid_auctions/);
    assert.match(sql, /priority_auction_bids/);
    assert.match(sql, /UNIQUE \(order_id\)/);
    assert.match(sql, /creation_source/);
    assert.match(sql, /automatic_priced_bidding_open/);
    assert.doesNotMatch(sql, /work_tokens_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /priority_bidding_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO priority_auction_bids/i);
    assert.doesNotMatch(sql, /INSERT INTO priority_bid_auctions/i);
    assert.doesNotMatch(sql, /UPDATE freelancer_work_token_wallets/i);
  });

  it("persists starts_at/ends_at and ranking-friendly indexes", () => {
    assert.match(sql, /starts_at/);
    assert.match(sql, /ends_at/);
    assert.match(sql, /priority_auction_bids_auction_rank_idx/);
    assert.match(sql, /bid_tokens DESC/);
  });
});
