/**
 * Phase B7B — legacy Work Token / Priority Auction runtime cleanup gate.
 * Run from backend/: node --test test/marketplaceB7bLegacyRuntimeCleanup.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("B7B economy hard locks", () => {
  it("rejects enabling workTokensEnabled / priorityBiddingEnabled / verification WT rewards", () => {
    const src = read("src/services/marketplaceEconomySettingsService.js");
    assert.match(src, /WORK_TOKENS_ENGINE_DEPRECATED/);
    assert.match(src, /PRIORITY_BIDDING_ENGINE_DEPRECATED/);
    assert.match(src, /VERIFICATION_WORK_TOKEN_REWARDS_DEPRECATED/);
  });
});

describe("B7B Priority Auction mutations deprecated", () => {
  it("assertEngineActive always throws PRIORITY_AUCTION_DEPRECATED 410", () => {
    const src = read("src/services/marketplacePriorityAuctionService.js");
    assert.match(src, /PRIORITY_AUCTION_DEPRECATED/);
    assert.match(src, /statusCode:\s*410|410,/);
    assert.match(src, /maybeCreatePriorityAuctionOnPricedBiddingOpen[\s\S]*PRIORITY_AUCTION_DEPRECATED/);
    assert.match(src, /resolveDuePriorityAuctions[\s\S]*PRIORITY_AUCTION_DEPRECATED/);
  });

  it("resolve tick controller returns 410", () => {
    const ctrl = read("src/controllers/marketplacePriorityAuctionController.js");
    assert.match(ctrl, /status\(410\)/);
    assert.match(ctrl, /PRIORITY_AUCTION_DEPRECATED/);
  });

  it("write routes still mounted but service-gated deprecated", () => {
    const freel = read("src/routes/freelancerPriorityAuctionRoutes.js");
    const admin = read("src/routes/superAdminPriorityAuctionRoutes.js");
    assert.match(freel, /submitMyPriorityBid/);
    assert.match(freel, /increaseMyPriorityBid/);
    assert.match(admin, /adminCreateAuction/);
    assert.match(admin, /adminGetAuction/);
  });
});

describe("B7B WT quote + wallet retention", () => {
  it("token quote endpoint is 410 WORK_TOKENS_DEPRECATED", () => {
    const ctrl = read("src/controllers/ordersController.js");
    assert.match(ctrl, /getPoolOrderNormalApplicationTokenQuote[\s\S]*410[\s\S]*WORK_TOKENS_DEPRECATED/);
  });

  it("WT wallet routes remain read-only authenticated", () => {
    const freel = read("src/routes/freelancerWorkTokenWalletRoutes.js");
    const admin = read("src/routes/superAdminWorkTokenWalletRoutes.js");
    assert.match(freel, /LEGACY_DEPRECATED_WORK_TOKEN_MODEL/);
    assert.match(freel, /router\.get\("\/work-token-wallet"/);
    assert.doesNotMatch(freel, /router\.post/);
    assert.match(admin, /LEGACY_DEPRECATED_WORK_TOKEN_MODEL/);
    assert.match(admin, /router\.get\(/);
    assert.doesNotMatch(admin, /router\.post/);
  });

  it("verification bonus credit events are rejected", () => {
    const src = read("src/services/marketplaceWorkTokenWalletService.js");
    assert.match(src, /IDENTITY_VERIFICATION_BONUS/);
    assert.match(src, /PAYOUT_VERIFICATION_BONUS/);
    assert.match(src, /WORK_TOKENS_DEPRECATED/);
  });
});

describe("B7B membership + public plans", () => {
  it("membership create still forces 0 tokens; public omits includedTokensPerCycle", () => {
    const plans = read("src/services/marketplaceMembershipPlansService.js");
    assert.match(plans, /assertTokensPerCycle\(0\)/);
    assert.doesNotMatch(
      plans,
      /mapPublicMarketplaceMembershipPlan[\s\S]{0,400}includedTokensPerCycle:\s*full\.includedTokensPerCycle/,
    );
  });
});

describe("B7B runtime constants unchanged", () => {
  it("active product economics remain Bid-based", () => {
    const bids = require("../src/constants/marketplaceBidCredits.js");
    const article = require("../src/constants/marketplaceArticleApplications.js");
    const boost = require("../src/constants/marketplacePriorityApplicationBoost.js");
    assert.equal(bids.NORMAL_APPLICATION_BID_COST, 1);
    assert.equal(article.ARTICLE_APPLICATION_BID_COST, 1);
    assert.equal(article.ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME, "NONE");
    assert.equal(boost.PRIORITY_BOOST_WORK_TOKEN_COST, 0);
    assert.equal(boost.ACTIVE_PRIORITY_WORK_TOKEN_RUNTIME, "NONE");
  });
});
