/**
 * Phase B7A backend runtime / API isolation gate.
 * Run from backend/: node --test test/marketplaceB7aActiveProductCutover.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("B7A runtime constants", () => {
  it("Priority Boost Work Token runtime is NONE", () => {
    const c = require("../src/constants/marketplacePriorityApplicationBoost.js");
    assert.equal(c.PRIORITY_BOOST_WORK_TOKEN_COST, 0);
    assert.equal(c.ACTIVE_PRIORITY_WORK_TOKEN_RUNTIME, "NONE");
  });

  it("normal / article Bid constants have no WT charge", () => {
    const bids = require("../src/constants/marketplaceBidCredits.js");
    assert.equal(bids.NORMAL_APPLICATION_BID_COST, 1);
    assert.equal(bids.WORK_TOKEN_PRODUCT_STATUS, "DEPRECATED");
    const article = require("../src/constants/marketplaceArticleApplications.js");
    assert.equal(article.ARTICLE_APPLICATION_BID_COST, 1);
    assert.equal(article.ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME, "NONE");
    assert.equal(article.ARTICLE_WORK_TOKEN_ENTRY, "CANCELLED");
  });
});

describe("B7A economy settings fail-closed", () => {
  it("rejects enabling workTokensEnabled / priorityBiddingEnabled", () => {
    const src = read("src/services/marketplaceEconomySettingsService.js");
    assert.match(src, /WORK_TOKENS_ENGINE_DEPRECATED/);
    assert.match(src, /PRIORITY_BIDDING_ENGINE_DEPRECATED/);
  });
});

describe("B7A membership grants", () => {
  it("create/update force includedTokensPerCycle 0; cycle grant service not invoked", () => {
    const plans = read("src/services/marketplaceMembershipPlansService.js");
    assert.match(plans, /assertTokensPerCycle\(0\)/);
    assert.doesNotMatch(
      plans,
      /mapPublicMarketplaceMembershipPlan[\s\S]*includedTokensPerCycle:\s*full\.includedTokensPerCycle/,
    );
    const cycles = read("src/services/marketplaceMembershipCyclesService.js");
    assert.match(cycles, /tokensAllowed\s*=\s*0/);
    assert.doesNotMatch(cycles, /grantMembershipCycleWorkTokens|cycleTokenGrantService\.grant/);
  });
});

describe("B7A legacy endpoints retained but not product UI", () => {
  it("app still mounts WT wallet + auction routes as legacy", () => {
    const app = read("src/app.js");
    assert.match(app, /freelancerWorkTokenWalletRoutes/);
    assert.match(app, /freelancerPriorityAuctionRoutes/);
    assert.match(app, /LEGACY_DEPRECATED_WORK_TOKEN_MODEL/);
  });
});
