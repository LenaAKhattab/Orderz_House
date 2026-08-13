/**
 * Phase B6 — Bid Credit package commercial purchases (static + architecture).
 * Does NOT apply migration 151. No Production mutation / git / deploy / Stripe live purchase.
 *
 * Run: npm run test:marketplace-bid-credit-purchases-phase-b6
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_bid_credit_purchases_b6_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  BID_PACKAGE_PURCHASE_PURPOSE,
  BID_PACKAGE_PURCHASE_CURRENCY,
  BID_PACKAGE_PURCHASE_STATUSES,
  BID_PACKAGE_PURCHASE_GRANT_SOURCE,
  BID_PACKAGE_PURCHASE_LEDGER_EVENT,
  BID_PACKAGE_PAYMENT_AMOUNT_SOURCE,
  CLIENT_CONTROLLED_BID_PURCHASE_ECONOMICS,
  PURCHASED_BIDS_MEMBERSHIP_INDEPENDENT,
  PURCHASED_BIDS_FEFO,
  BID_PACKAGE_WORK_TOKEN_RUNTIME,
  BID_PACKAGE_PURCHASE_HISTORICAL_BACKFILL,
  BID_CREDIT_PURCHASES_ENGINE,
  STRIPE_SUCCESS_PAGE_CAN_GRANT_BIDS,
  BID_PACKAGE_PAYMENT_REFUND_POLICY,
  BID_PACKAGE_FULL_REFUND,
  BID_PACKAGE_CROSS_SOURCE_CLAWBACK,
  PARTIAL_BID_PACKAGE_REFUND_POLICY,
  ACTIVE_DISPUTE_ACCOUNT_SUSPENSION,
  DISPUTE_FREEZE_EXTENDS_BID_EXPIRY,
  BID_PACKAGE_PURCHASE_REVERSAL_HISTORICAL_BACKFILL,
  buildBidPackagePurchaseCheckoutIdempotencyKey,
  buildBidPackagePurchaseGrantIdempotencyKey,
} = require("../src/constants/marketplaceBidCreditPurchases");

const {
  BID_CREDIT_SOURCE_TYPES,
  BID_CREDIT_LEDGER_EVENT_TYPES,
} = require("../src/constants/marketplaceBidCredits");

const { amountMajorToStripeMinor } = require("../src/utils/stripeMoney");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase B6 product constants", () => {
  it("locks commercial purchase product model", () => {
    assert.strictEqual(BID_PACKAGE_PURCHASE_PURPOSE, "bid_credit_package_purchase");
    assert.strictEqual(BID_PACKAGE_PURCHASE_CURRENCY, "JOD");
    assert.strictEqual(BID_PACKAGE_PURCHASE_GRANT_SOURCE, "package_purchase");
    assert.strictEqual(BID_PACKAGE_PURCHASE_LEDGER_EVENT, "BID_PACKAGE_PURCHASE_GRANT");
    assert.strictEqual(BID_PACKAGE_PAYMENT_AMOUNT_SOURCE, "SERVER_PACKAGE_SNAPSHOT");
    assert.strictEqual(CLIENT_CONTROLLED_BID_PURCHASE_ECONOMICS, "NONE");
    assert.strictEqual(PURCHASED_BIDS_MEMBERSHIP_INDEPENDENT, "YES");
    assert.strictEqual(PURCHASED_BIDS_FEFO, "EXISTING_ENGINE");
    assert.strictEqual(BID_PACKAGE_WORK_TOKEN_RUNTIME, "NONE");
    assert.strictEqual(BID_PACKAGE_PURCHASE_HISTORICAL_BACKFILL, "NONE");
    assert.strictEqual(BID_CREDIT_PURCHASES_ENGINE, "DORMANT");
    assert.strictEqual(STRIPE_SUCCESS_PAGE_CAN_GRANT_BIDS, "NO");
    assert.strictEqual(BID_PACKAGE_PAYMENT_REFUND_POLICY, "OWNER_APPROVED_B6");
    assert.strictEqual(BID_PACKAGE_FULL_REFUND, "REVOKE_UNUSED_PURCHASE_BIDS_ONLY");
    assert.strictEqual(BID_PACKAGE_CROSS_SOURCE_CLAWBACK, "NONE");
    assert.strictEqual(PARTIAL_BID_PACKAGE_REFUND_POLICY, "MANUAL_REVIEW");
    assert.strictEqual(ACTIVE_DISPUTE_ACCOUNT_SUSPENSION, "NONE");
    assert.strictEqual(DISPUTE_FREEZE_EXTENDS_BID_EXPIRY, "NO");
    assert.strictEqual(BID_PACKAGE_PURCHASE_REVERSAL_HISTORICAL_BACKFILL, "NONE");
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("package_purchase"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("BID_PACKAGE_PURCHASE_GRANT"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("BID_PACKAGE_PURCHASE_REVOKE"));
    assert.deepEqual(
      [...BID_PACKAGE_PURCHASE_STATUSES],
      ["pending", "checkout_created", "paid", "fulfilled", "cancelled", "failed"],
    );
  });

  it("idempotency key builders are purchase-scoped", () => {
    assert.match(
      buildBidPackagePurchaseCheckoutIdempotencyKey(9, 3, "abc"),
      /^bid_pkg_checkout:freelancer:9:package:3:abc$/,
    );
    assert.strictEqual(
      buildBidPackagePurchaseGrantIdempotencyKey(42),
      "bid_pkg_purchase_grant:purchase:42",
    );
  });
});

describe("Phase B6 JOD amount conversion (not ×100)", () => {
  it("uses repository three-decimal JOD convention (×1000)", () => {
    assert.strictEqual(amountMajorToStripeMinor(5, "JOD"), 5000);
    assert.strictEqual(amountMajorToStripeMinor("1.000", "JOD"), 1000);
    assert.strictEqual(amountMajorToStripeMinor(0.01, "JOD"), 10);
    assert.notStrictEqual(amountMajorToStripeMinor(5, "JOD"), 500);
  });
});

describe("Phase B6 migration 151 authored (not applied by tests)", () => {
  const sql = read("sql/migrations/151_bid_credit_package_purchases.sql");

  it("adds purchases flag + validity_days + purchases table + sources + reversal schema", () => {
    assert.match(sql, /bid_credit_purchases_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(sql, /validity_days INTEGER NULL/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_bid_credit_purchases/);
    assert.match(sql, /package_purchase/);
    assert.match(sql, /BID_PACKAGE_PURCHASE_GRANT/);
    assert.match(sql, /BID_PACKAGE_PURCHASE_REVOKE/);
    assert.match(sql, /amount_revoked/);
    assert.match(sql, /'frozen'/);
    assert.match(sql, /payment_reversal_status/);
    assert.match(sql, /manual_review_required/);
    assert.match(sql, /151_bid_credit_package_purchases/);
    assert.match(sql, /ON DELETE RESTRICT/);
    // Executable SQL must not enable engines (comment text may mention =true as docs).
    assert.doesNotMatch(sql, /SET\s+bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /SET\s+bid_credit_purchases_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /UPDATE\s+marketplace_economy_settings[\s\S]*bid_credit_purchases_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_credit_packages/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_credit_purchases/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_credit_grants/i);
    assert.doesNotMatch(sql, /INSERT INTO freelancer_work_token/i);
    assert.doesNotMatch(sql, /DROP TABLE.*work_token/i);
  });

  it("snapshots commercial terms + separates paid vs fulfilled", () => {
    assert.match(sql, /bid_quantity_snapshot/);
    assert.match(sql, /price_jod_snapshot/);
    assert.match(sql, /validity_days_snapshot/);
    assert.match(sql, /expected_amount_minor/);
    assert.match(sql, /'paid'/);
    assert.match(sql, /'fulfilled'/);
    assert.match(sql, /fulfilled_grant_id/);
  });
});

describe("Phase B6 checkout / fulfillment wiring", () => {
  const svc = read("src/services/marketplaceBidCreditPurchasesService.js");
  const webhook = read("src/controllers/stripeWebhookController.js");
  const ctrl = read("src/controllers/marketplaceBidCreditsController.js");
  const flRoutes = read("src/routes/freelancerBidCreditsRoutes.js");
  const adminRoutes = read("src/routes/superAdminBidCreditsRoutes.js");
  const feCard = read(
    path.join("..", "frontend", "src", "components", "freelancer", "FreelancerBidCreditsCard.jsx"),
  );

  it("1–6: checkout uses packageId only; ignores client price/qty/validity", () => {
    assert.match(svc, /priceJod: _clientPrice/);
    assert.match(svc, /bidQuantity: _clientQty/);
    assert.match(svc, /validityDays: _clientValidity/);
    assert.match(svc, /void _clientPrice/);
    assert.match(svc, /amountMajorToStripeMinor\(pkg\.priceJod/);
    assert.match(flRoutes, /bid-credit-purchases\/checkout/);
    assert.match(ctrl, /createPackageCheckout/);
  });

  it("7–10: snapshot immutability + deactivation blocks new checkout only", () => {
    assert.match(svc, /bid_quantity_snapshot/);
    assert.match(svc, /price_jod_snapshot/);
    assert.match(svc, /validity_days_snapshot/);
    assert.match(svc, /assertPackagePurchasable/);
    assert.match(svc, /BID_PACKAGE_INACTIVE/);
    // Fulfillment uses locked purchase snapshot, not live package row reload for economics
    assert.match(svc, /locked\.bid_quantity_snapshot/);
    assert.match(svc, /locked\.validity_days_snapshot/);
  });

  it("11–12: both engines required", () => {
    assert.match(svc, /isBidCreditsEngineActive/);
    assert.match(svc, /isBidCreditPurchasesEngineActive/);
    assert.match(svc, /BID_CREDITS_ENGINE_OFF/);
    assert.match(svc, /BID_CREDIT_PURCHASES_ENGINE_OFF/);
  });

  it("13: success redirect does not grant Bids alone", () => {
    assert.strictEqual(STRIPE_SUCCESS_PAGE_CAN_GRANT_BIDS, "NO");
    assert.match(svc, /confirmBidCreditPackageCheckout/);
    assert.match(svc, /stripe\.checkout\.sessions\.retrieve/);
    assert.match(feCard, /Payment received/);
    assert.match(feCard, /confirmFreelancerBidCreditPurchaseRequest/);
    assert.doesNotMatch(feCard, /Bids added to your balance\.\s*`\);[\s\S]*createFreelancer/);
  });

  it("14–16 + 22–25: webhook authenticity path + amount/currency fail-closed + cancel/fail no grant", () => {
    assert.match(webhook, /constructEvent/);
    assert.match(webhook, /bid_credit_package_purchase/);
    assert.match(webhook, /fulfillBidCreditPurchaseFromVerifiedPayment/);
    assert.match(svc, /amount_mismatch/);
    assert.match(svc, /currency_mismatch/);
    assert.match(svc, /bid_pkg_checkout_not_paid/);
    assert.match(svc, /status = 'cancelled'/);
    assert.match(webhook, /payment_intent_failed/);
  });

  it("17–19: grant source + ledger + expiry from validity snapshot", () => {
    assert.match(svc, /sourceType: BID_PACKAGE_PURCHASE_GRANT_SOURCE/);
    assert.match(svc, /eventType: BID_PACKAGE_PURCHASE_LEDGER_EVENT/);
    assert.match(
      svc,
      /validity_days_snapshot\) \* 86400000/,
    );
    assert.doesNotMatch(svc, /paid_term_ends_at/);
    assert.doesNotMatch(svc, /ADMIN_BID_GRANT/);
  });

  it("20–21: webhook idempotency via FOR UPDATE + grant idempotency key", () => {
    assert.match(svc, /FOR UPDATE/);
    assert.match(svc, /already_fulfilled/);
    assert.match(svc, /buildBidPackagePurchaseGrantIdempotencyKey/);
    assert.match(svc, /createBidCreditGrant/);
  });

  it("26: purchase does not require membership", () => {
    assert.match(svc, /assertActiveFreelancer/);
    assert.doesNotMatch(svc, /requireMarketplaceMembership/);
    assert.doesNotMatch(svc, /assertActiveMembership/);
    assert.doesNotMatch(svc, /membership_required/i);
  });

  it("27–28: membership-independent expiry + FEFO via existing accounting", () => {
    assert.strictEqual(PURCHASED_BIDS_MEMBERSHIP_INDEPENDENT, "YES");
    assert.strictEqual(PURCHASED_BIDS_FEFO, "EXISTING_ENGINE");
    assert.doesNotMatch(svc, /rewrite.*expires_at.*membership/i);
  });

  it("29: Freelancer purchase IDOR blocked", () => {
    assert.match(svc, /BID_PURCHASE_FORBIDDEN/);
    assert.match(svc, /freelancer_user_id\) !== Number\(freelancerUserId\)/);
    assert.match(flRoutes, /requireFreelancer/);
    assert.match(adminRoutes, /requireSuperAdmin/);
  });

  it("30–31: no Work Token runtime / no historical backfill", () => {
    assert.strictEqual(BID_PACKAGE_WORK_TOKEN_RUNTIME, "NONE");
    assert.strictEqual(BID_PACKAGE_PURCHASE_HISTORICAL_BACKFILL, "NONE");
    assert.doesNotMatch(svc, /work_token/i);
    assert.doesNotMatch(svc, /INSERT INTO freelancer_work_token/i);
  });

  it("refund/chargeback applies owner policy via reversals service", () => {
    assert.strictEqual(BID_PACKAGE_PAYMENT_REFUND_POLICY, "OWNER_APPROVED_B6");
    assert.match(webhook, /applyBidPackageProviderRefundOrDisputeRecordOnly/);
    assert.match(webhook, /applyVerifiedChargeRefunded|marketplaceBidCreditPurchaseReversalsService/);
    const rev = read("src/services/marketplaceBidCreditPurchaseReversalsService.js");
    assert.match(rev, /applyFullBidPackageRefund/);
    assert.match(rev, /applyBidPackageDisputeOpened/);
    assert.match(rev, /freezeBidCreditGrant/);
    assert.match(rev, /revokeUnusedBidCreditGrantRemainder/);
    assert.doesNotMatch(rev, /suspendAccount|createNegativeBalance|clawbackFromMembership/i);
  });

  it("Stripe metadata is reconciliation refs, not economic source of truth", () => {
    assert.match(svc, /purchaseId: String\(purchase\.id\)/);
    assert.match(svc, /locked\.bid_quantity_snapshot/);
    assert.doesNotMatch(
      svc,
      /amount:\s*Number\(meta\.(bidQuantity|quantity|price)/,
    );
  });
});

describe("Phase B6 UI + API surface", () => {
  it("Freelancer catalog/checkout/history + Admin validityDays", () => {
    const api = read(path.join("..", "frontend", "src", "services", "api.js"));
    const adminPage = read(
      path.join("..", "frontend", "src", "pages", "dashboard", "SuperAdminBidCreditsPage.jsx"),
    );
    assert.match(api, /listFreelancerBidCreditPackagesRequest/);
    assert.match(api, /createFreelancerBidCreditPurchaseCheckoutRequest/);
    assert.match(api, /confirmFreelancerBidCreditPurchaseRequest/);
    assert.match(api, /listFreelancerBidCreditPurchasesRequest/);
    assert.match(adminPage, /validityDays/);
  });
});

describe("Phase B6 economy regressions (static isolation)", () => {
  it("does not alter B2/B4/B5 consume services", () => {
    const b2 = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    const b4 = read("src/constants/marketplacePriorityApplicationBoost.js");
    const b5 = read("src/services/marketplaceArticleApplicationBidCreditService.js");
    assert.match(b2, /NORMAL_APPLICATION_BID_COST|APPLICATION_BID_CONSUME/);
    assert.match(b4, /PRIORITY_BOOST_ADDITIONAL_BID_COST/);
    assert.match(b5, /ARTICLE_APPLICATION_BID_CONSUME|article_application/);
    assert.doesNotMatch(b2, /bid_credit_package_purchase/);
    assert.doesNotMatch(b5, /bid_credit_package_purchase/);
  });
});
