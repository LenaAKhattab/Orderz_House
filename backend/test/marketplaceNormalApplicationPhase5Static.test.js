/**
 * Phase 5 normal-application Work Token isolation / wiring static checks.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase 5 normal application Work Token static isolation", () => {
  it("LEGACY_DEPRECATED: WT charge disconnected from submitPoolOrderBid; Bid Credits wired instead", () => {
    const orders = read("src/services/ordersService.js");
    const claimIdx = orders.indexOf("async function claimPoolOrder");
    const submitIdx = orders.indexOf("async function submitPoolOrderBid");
    assert.ok(submitIdx >= 0 && claimIdx >= 0);
    const submitBlock = orders.slice(submitIdx, claimIdx > submitIdx ? claimIdx : undefined);
    const claimBlock = orders.slice(claimIdx, claimIdx + 2500);
    // Phase B2: active path uses Bid Credits; WT charge must not be invoked.
    assert.match(submitBlock, /chargeNormalApplicationBidCreditOnFirstBid/);
    assert.doesNotMatch(submitBlock, /chargeNormalApplicationOnFirstBid\(/);
    assert.doesNotMatch(claimBlock, /chargeNormalApplicationOnFirstBid/);
    assert.doesNotMatch(claimBlock, /chargeNormalApplicationBidCreditOnFirstBid/);
    assert.doesNotMatch(claimBlock, /marketplaceNormalApplicationWorkToken/);
    assert.doesNotMatch(claimBlock, /marketplaceNormalApplicationBidCredit/);
  });

  it("fakeOrdersService has no Work Token linkage", () => {
    const fake = read("src/services/fakeOrdersService.js");
    assert.doesNotMatch(fake, /marketplaceNormalApplicationWorkToken/);
    assert.doesNotMatch(fake, /creditWorkTokens|consumeAvailableWorkTokens|NORMAL_APPLICATION_/);
  });

  it("defines NORMAL_APPLICATION ledger events and not Priority Bid semantics for normal apps", () => {
    const constants = read("src/constants/marketplaceWorkTokens.js");
    assert.match(constants, /NORMAL_APPLICATION_CONSUME/);
    assert.match(constants, /NORMAL_APPLICATION_REFUND/);
    const svc = read("src/services/marketplaceNormalApplicationWorkTokenService.js");
    assert.doesNotMatch(svc, /PRIORITY_BID_RESERVE/);
    assert.match(svc, /consumeAvailableWorkTokens/);
    assert.match(svc, /creditWorkTokens/);
  });

  it("refund policy single source of truth is economy settings (no hardcoded business %)", () => {
    const constants = read("src/constants/marketplaceWorkTokens.js");
    assert.doesNotMatch(constants, /NORMAL_APPLICATION_REFUND_PERCENTAGE\s*=/);
    const svc = read("src/services/marketplaceNormalApplicationWorkTokenService.js");
    assert.doesNotMatch(svc, /NORMAL_APPLICATION_REFUND_PERCENTAGE/);
    assert.match(svc, /settings\.normalApplicationTokenRefundPercentage/);
    assert.match(svc, /getMarketplaceEconomySettings\(client\)/);
    assert.match(svc, /refundTokensFromEconomicSnapshot/);
  });

  it("current product phase constrains refund configuration to 100 only", () => {
    const economy = read("src/services/marketplaceEconomySettingsService.js");
    assert.match(economy, /assertNormalApplicationTokenRefundPercentageCurrentPolicy/);
    assert.match(economy, /CURRENT_NORMAL_APPLICATION_REFUND_PERCENTAGE_ONLY/);
    assert.match(economy, /FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED/);
    const validators = read("src/validators/marketplaceEconomySettingsValidators.js");
    assert.match(validators, /optionalNormalApplicationRefundPercentage100Only/);
    assert.match(validators, /min:\s*100,\s*max:\s*100/);
  });

  it("cancel without selection uses Bid Credit refund (WT refund API remains legacy-only)", () => {
    const svc = read("src/services/marketplaceNormalApplicationWorkTokenService.js");
    const fnIdx = svc.indexOf("async function endOpenBiddingOrderWithoutSelection");
    const chunk = svc.slice(fnIdx, fnIdx + 8000);
    assert.match(chunk, /refundChargedBidApplicationsForOrderEndedWithoutSelection/);
    assert.doesNotMatch(
      chunk.slice(chunk.indexOf("refundChargedBidApplicationsForOrderEndedWithoutSelection"), chunk.indexOf("refundChargedBidApplicationsForOrderEndedWithoutSelection") + 900),
      /await refundChargedApplicationsForOrderEndedWithoutSelection\(/,
    );
  });

  it("controller passes poolKind real only on real bid path", () => {
    const ctrl = read("src/controllers/ordersController.js");
    assert.match(ctrl, /poolKind:\s*"real"/);
    assert.match(ctrl, /kind === "fake"/);
    assert.match(ctrl, /submitFakeTrainingBid/);
  });
});
