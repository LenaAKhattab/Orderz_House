/**
 * ACTIVE_NEW_BID_MODEL — Phase B2 normal application Bid Credit consumption + refund.
 * Static + pure assertions. No Production mutations. Does NOT apply migration 147.
 *
 * Run: npm run test:marketplace-bid-credits-phase-b2
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_bid_credits_b2_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  NORMAL_APPLICATION_BID_COST,
  buildNormalApplicationBidConsumeIdempotencyKey,
  buildNormalApplicationBidRefundIdempotencyKey,
  NORMAL_APPLICATION_BID_REFUND_IDEMPOTENCY_PREFIX,
} = require("../src/services/marketplaceNormalApplicationBidCreditService");
const {
  NORMAL_APPLICATION_BID_COST: COST_CONST,
  NORMAL_APPLICATION_BID_REFUND_PERCENT,
  NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS,
  NORMAL_APPLICATION_BID_HISTORICAL_BACKFILL,
  BID_CREDIT_ERROR_CODES,
  BID_CREDIT_LEDGER_EVENT_TYPES,
  BID_CREDIT_SOURCE_TYPES,
} = require("../src/constants/marketplaceBidCredits");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("ACTIVE_NEW_BID_MODEL Phase B2 constants", () => {
  it("normal application Bid cost is exactly 1", () => {
    assert.strictEqual(NORMAL_APPLICATION_BID_COST, 1);
    assert.strictEqual(COST_CONST, 1);
  });

  it("refund policy is 100% with 30-day compensating grant", () => {
    assert.strictEqual(NORMAL_APPLICATION_BID_REFUND_PERCENT, 100);
    assert.strictEqual(NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS, 30);
    assert.strictEqual(NORMAL_APPLICATION_BID_HISTORICAL_BACKFILL, "NONE");
  });

  it("uses deterministic consume and refund idempotency keys", () => {
    assert.strictEqual(
      buildNormalApplicationBidConsumeIdempotencyKey(42, 7),
      "normal_application_bid_consume:order:42:freelancer:7",
    );
    assert.strictEqual(
      buildNormalApplicationBidRefundIdempotencyKey(42, 7),
      "normal_application_bid_refund:order:42:freelancer:7",
    );
    assert.strictEqual(NORMAL_APPLICATION_BID_REFUND_IDEMPOTENCY_PREFIX, "normal_application_bid_refund");
  });

  it("exposes Bid refund ledger event and compensating source (not admin_manual)", () => {
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("NORMAL_APPLICATION_BID_REFUND"));
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("normal_application_refund"));
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("admin_manual"));
    assert.notEqual(
      BID_CREDIT_SOURCE_TYPES.indexOf("normal_application_refund"),
      BID_CREDIT_SOURCE_TYPES.indexOf("admin_manual"),
    );
    assert.strictEqual(BID_CREDIT_ERROR_CODES.INSUFFICIENT_BID_CREDITS, "INSUFFICIENT_BID_CREDITS");
    assert.strictEqual(
      BID_CREDIT_ERROR_CODES.NORMAL_APPLICATION_BID_REFUND_NOT_ELIGIBLE,
      "NORMAL_APPLICATION_BID_REFUND_NOT_ELIGIBLE",
    );
  });
});

describe("ACTIVE_NEW_BID_MODEL migration 147 authored", () => {
  const sqlPath = path.join(
    __dirname,
    "..",
    "sql",
    "migrations",
    "147_normal_application_bid_credit_economics.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("creates dedicated Bid Credit economics table (not WT rename)", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS order_freelancer_bid_credit_economics/);
    assert.doesNotMatch(sql, /DROP TABLE.*order_freelancer_bid_work_token_economics/i);
    assert.doesNotMatch(sql, /DROP TABLE.*work_token/i);
  });

  it("locks cost to 1 and does not enable engines or backfill", () => {
    assert.match(sql, /bid_credit_cost INTEGER NOT NULL DEFAULT 1/);
    assert.match(sql, /CHECK \(bid_credit_cost = 1\)/);
    assert.doesNotMatch(sql, /bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO order_freelancer_bid_credit_economics/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_credit_grants/i);
    assert.match(sql, /147_normal_application_bid_credit_economics/);
  });

  it("is additive and unique per order+freelancer + refund idempotency", () => {
    assert.match(sql, /UNIQUE \(order_id, freelancer_user_id\)/);
    assert.match(sql, /UNIQUE \(idempotency_key\)/);
    assert.match(sql, /UNIQUE \(refund_idempotency_key\)/);
    assert.match(sql, /same_bucket_restore/);
    assert.match(sql, /compensating_grant_30d/);
  });

  it("extends ledger CHECK with NORMAL_APPLICATION_BID_REFUND only additively", () => {
    assert.match(sql, /NORMAL_APPLICATION_BID_REFUND/);
    assert.match(sql, /MEMBERSHIP_BID_GRANT/);
    assert.match(sql, /APPLICATION_BID_CONSUME/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS marketplace_bid_credit_ledger_entries_event_type_check/);
    assert.match(sql, /ADD CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check/);
  });

  it("extends grant source CHECK with normal_application_refund (not admin_manual misuse)", () => {
    assert.match(sql, /normal_application_refund/);
    assert.match(sql, /membership_daily_unlock/);
    assert.match(sql, /admin_manual/);
    assert.match(sql, /DROP CONSTRAINT IF EXISTS marketplace_bid_credit_grants_source_type_check/);
  });
});

describe("ACTIVE_NEW_BID_MODEL runtime wiring", () => {
  it("ordersService uses Bid Credit charge and not WT charge on submitPoolOrderBid", () => {
    const src = read("src/services/ordersService.js");
    const submitIdx = src.indexOf("async function submitPoolOrderBid");
    assert.ok(submitIdx > 0);
    const chunk = src.slice(submitIdx, submitIdx + 9000);
    assert.match(chunk, /chargeNormalApplicationBidCreditOnFirstBid/);
    assert.doesNotMatch(chunk, /chargeNormalApplicationOnFirstBid\(/);
    assert.match(chunk, /marketplaceNormalApplicationBidCreditService/);
  });

  it("no-selection cancel path refunds Bid Credits and does not call WT refund", () => {
    const src = read("src/services/marketplaceNormalApplicationWorkTokenService.js");
    const fnIdx = src.indexOf("async function endOpenBiddingOrderWithoutSelection");
    assert.ok(fnIdx > 0);
    const chunk = src.slice(fnIdx, fnIdx + 8000);
    assert.match(chunk, /refundChargedBidApplicationsForOrderEndedWithoutSelection/);
    assert.match(chunk, /marketplaceNormalApplicationBidCreditService/);
    // Must not invoke WT refund inside the cancel function body after Bid wiring.
    const afterBid = chunk.slice(chunk.indexOf("refundChargedBidApplicationsForOrderEndedWithoutSelection"));
    assert.doesNotMatch(
      afterBid.slice(0, 1200),
      /await refundChargedApplicationsForOrderEndedWithoutSelection\(/,
    );
  });

  it("legacy WT service is marked deprecated and still present for Phase 5", () => {
    const src = read("src/services/marketplaceNormalApplicationWorkTokenService.js");
    assert.match(src, /LEGACY_DEPRECATED/);
    assert.match(src, /chargeNormalApplicationOnFirstBid/);
    assert.match(src, /refundChargedApplicationsForOrderEndedWithoutSelection/);
  });

  it("controller exposes Bid quote endpoint helper", () => {
    const src = read("src/controllers/ordersController.js");
    assert.match(src, /getPoolOrderNormalApplicationBidQuote/);
    assert.match(src, /normal-application-bid-quote|bidCreditCost/);
  });

  it("routes register Bid quote path", () => {
    const src = read("src/routes/ordersRoutes.js");
    assert.match(src, /normal-application-bid-quote/);
  });
});

describe("ACTIVE_NEW_BID_MODEL refund service architecture", () => {
  const src = read("src/services/marketplaceNormalApplicationBidCreditService.js");

  it("implements same-bucket restore and compensating 30-day grant", () => {
    assert.match(src, /refundSingleNormalApplicationBidEconomics/);
    assert.match(src, /refundChargedBidApplicationsForOrderEndedWithoutSelection/);
    assert.match(src, /same_bucket_restore/);
    assert.match(src, /compensating_grant_30d/);
    assert.match(src, /NORMAL_APPLICATION_BID_REFUND/);
    assert.match(src, /normal_application_refund/);
    assert.match(src, /NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS/);
    assert.match(src, /amount_consumed = amount_consumed -/);
    assert.match(src, /createBidCreditGrant/);
    assert.match(src, /FOR UPDATE/);
  });

  it("does not delete consume ledger events", () => {
    assert.doesNotMatch(src, /DELETE FROM marketplace_bid_credit_ledger_entries/);
    assert.doesNotMatch(src, /UPDATE marketplace_bid_credit_ledger_entries\s+SET/);
  });

  it("locks economics then grant for same-bucket path", () => {
    assert.match(src, /findEconomicsByIdForUpdate/);
    assert.match(src, /marketplace_bid_credit_grants WHERE id = \$1 FOR UPDATE/);
  });
});

describe("ACTIVE_NEW_BID_MODEL frontend apply UX", () => {
  it("BidAmountModal shows one Bid application cost and no Work Token copy", () => {
    const modal = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "components", "orders", "BidAmountModal.jsx"),
      "utf8",
    );
    assert.match(modal, /applicationCostOne|applicationCostLabel/);
    assert.match(modal, /insufficientBids/);
    assert.doesNotMatch(modal, /Work Token|توكن/);
  });

  it("Arabic/English Bid refund labels exist without grant IDs", () => {
    const ar = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "locales", "ar", "freelancerDashboard.json"),
      "utf8",
    );
    const en = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "locales", "en", "freelancerDashboard.json"),
      "utf8",
    );
    assert.match(ar, /استرجاع عرض/);
    assert.match(en, /Bid refund/);
    const svc = read("src/services/marketplaceBidCreditsService.js");
    assert.match(svc, /NORMAL_APPLICATION_BID_REFUND/);
    assert.match(svc, /never expose grant IDs/i);
  });

  it("Arabic copy states single Bid application cost", () => {
    const ar = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "locales", "ar", "orders.json"),
      "utf8",
    );
    assert.match(ar, /تكلفة التقديم/);
    assert.match(ar, /عرض واحد/);
  });

  it("Freelancer order details loads Bid quote not Token quote", () => {
    const page = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "frontend",
        "src",
        "pages",
        "dashboard",
        "FreelancerOrderDetailsPage.jsx",
      ),
      "utf8",
    );
    assert.match(page, /getPoolOrderNormalApplicationBidQuoteRequest/);
    assert.doesNotMatch(page, /getPoolOrderNormalApplicationTokenQuoteRequest/);
  });
});

describe("ACTIVE_NEW_BID_MODEL non-refundable / exclusion boundaries", () => {
  it("withdraw / reject / select paths do not call Bid refund", () => {
    const orders = read("src/services/ordersService.js");
    const withdrawIdx = orders.indexOf("async function withdrawPoolClaim");
    const rejectIdx = orders.indexOf("async function rejectFreelancerBidClient");
    assert.ok(withdrawIdx > 0 && rejectIdx > 0);
    assert.doesNotMatch(orders.slice(withdrawIdx, withdrawIdx + 2500), /refundChargedBidApplications/);
    assert.doesNotMatch(orders.slice(rejectIdx, rejectIdx + 2500), /refundChargedBidApplications/);
  });

  it("charge service skips non-real poolKind and engine off", () => {
    const src = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.match(src, /poolKind !== "real"/);
    assert.match(src, /engine_off/);
    assert.match(src, /consumeBidCreditsFefo/);
    assert.match(src, /reconcileFreelancerBidDistributions/);
  });

  it("does not wire Priority/Article/Elite/fixed-take Bid consume or refund", () => {
    const src = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.doesNotMatch(src, /priority_bid/i);
    assert.doesNotMatch(src, /marketplace_articles/);
    assert.doesNotMatch(src, /elite_direct/i);
    const claim = read("src/services/ordersService.js");
    const claimIdx = claim.indexOf("async function claimPoolOrder");
    const claimBlock = claim.slice(claimIdx, claimIdx + 2500);
    assert.doesNotMatch(claimBlock, /chargeNormalApplicationBidCreditOnFirstBid/);
    assert.doesNotMatch(claimBlock, /refundChargedBidApplications/);
  });

  it("fake/training path has no Bid Credit linkage", () => {
    const fake = read("src/services/fakeOrdersService.js");
    assert.doesNotMatch(fake, /marketplaceNormalApplicationBidCredit/);
    assert.doesNotMatch(fake, /chargeNormalApplicationBidCredit/);
  });
});
