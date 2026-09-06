/**
 * 161 relist-round uniqueness — file assertions only (do not apply).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "../sql/migrations/161_relist_round_uniqueness.sql");

describe("161_relist_round_uniqueness migration file", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("drops old per-opportunity freelancer uniques and adds per-round uniques", () => {
    assert.match(sql, /DROP CONSTRAINT IF EXISTS marketplace_article_applications_article_fl_uidx/);
    assert.match(sql, /marketplace_article_applications_article_fl_round_uidx/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS pantry_bids_pantry_request_id_freelancer_id_key/);
    assert.match(sql, /pantry_bids_request_fl_round_uidx/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS marketplace_article_app_bid_econ_article_fl_uidx/);
    assert.match(sql, /pantry_application_bid_credit_economics_pantry_bid_uidx/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    assert.doesNotMatch(sql, /\bDELETE FROM\b/i);
  });

  it("backfills collection_round_id and keeps one-accepted pantry index untouched", () => {
    assert.match(sql, /SET collection_round_id = m\.current_bid_collection_round_id/);
    assert.match(sql, /SET collection_round_id = p\.current_bid_collection_round_id/);
    assert.doesNotMatch(sql, /DROP INDEX IF EXISTS idx_pantry_bids_one_accepted/);
  });
});
