/**
 * OZ05 — per-article bid collection settings on unified inventory.
 * Run: node --test test/oz05ArticleBidCollectionSettings.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://oz05_test:oz05_test@127.0.0.1:5432/oz05_test_unused";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8");
}

const oz05 = require("../src/utils/marketplaceArticleOz05BidSettings");

describe("OZ05 — storage decision (no migration)", () => {
  it("uses required_bid_count + keywords JSONB; no new migration file", () => {
    assert.match(read("sql/migrations/159_article_min_required_bids.sql"), /required_bid_count/);
    assert.match(read("sql/migrations/154_marketplace_article_economy_e2.sql"), /keywords JSONB/);
    assert.doesNotMatch(
      fs.readdirSync(path.join(root, "sql/migrations")).join("\n"),
      /184_.*oz05|185_.*oz05|visibility_duration.*marketplace_articles/i,
    );
  });

  it("duration helpers round-trip via keywords metadata", () => {
    const meta = oz05.mergeOz05KeywordsMeta(null, {
      [oz05.OZ05_DURATION_META_KEY]: 48,
    });
    assert.equal(oz05.readBidCollectionDurationHours(meta), 48);
    assert.equal(oz05.readBidCollectionDurationHours([]), 24);
    assert.equal(oz05.assertInventoryRequiredBidCount(2), 2);
    assert.throws(() => oz05.assertInventoryRequiredBidCount(0));
    assert.throws(() => oz05.assertBidCollectionDurationHours(0));
    assert.equal(oz05.assertBidCollectionDurationHours(168), 168);
  });
});

describe("OZ05 — release snapshot wiring", () => {
  it("unified release prefers article required_bid_count and keywords duration", () => {
    const src = read("src/services/marketplaceArticleUnifiedReleaseService.js");
    assert.match(src, /readBidCollectionDurationHours/);
    assert.match(src, /Number\(row\.required_bid_count\)/);
    assert.match(src, /explicitDeadline: null/);
    assert.doesNotMatch(
      src,
      /Number\(allocation\?\.minimumBiddersPerArticle\) \|\| Number\(row\.required_bid_count\)/,
    );
  });

  it("createInitialArticleRound accepts flexible inventory bid counts", () => {
    const src = read("src/services/opportunityBidCollectionService.js");
    assert.match(src, /assertInventoryRequiredBidCount/);
  });

  it("marketplace create/update persist duration in keywords and do not mutate active rounds", () => {
    const src = read("src/services/marketplaceArticlesService.js");
    assert.match(src, /OZ05_DURATION_META_KEY|bidCollectionDurationHours/);
    assert.match(src, /keywords = \$2::jsonb/);
    assert.match(src, /Never mutate an existing collecting/);
    assert.match(src, /status\) === "published"/);
  });
});

describe("OZ05 — OZ04 compatibility", () => {
  it("minimum_not_met recycle path still wired", () => {
    const src = read("src/services/opportunityBidCollectionService.js");
    assert.match(src, /recycleAndRefundAfterMinimumNotMet/);
  });
});
