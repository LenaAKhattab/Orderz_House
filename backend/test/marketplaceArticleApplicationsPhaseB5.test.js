/**
 * Phase B5 — Article Applications + Bid economics (static + architecture).
 * Does NOT apply migration 150 to Production. No Production mutation / git / deploy.
 *
 * Run: npm run test:marketplace-article-applications-phase-b5
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_article_applications_b5_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ARTICLE_APPLICATION_BID_COST,
  ARTICLE_APPLICATION_BID_ECONOMICS_SCHEMA,
  ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
  ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
  ARTICLE_APPLICATION_REJECTION_REFUND,
  ARTICLE_APPLICATION_LOSER_REFUND,
  ARTICLE_APPLICATION_NO_SELECTION_REFUND,
  ARTICLE_VALUE_TO_BID_COST_MAPPING,
  ARTICLE_LEVEL_TO_BID_COST_MAPPING,
  ARTICLE_WORK_TOKEN_ENTRY,
  ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
  ARTICLE_APPLICATION_HISTORICAL_BACKFILL,
  ARTICLE_APPLICATION_BID_HISTORICAL_BACKFILL,
  ARTICLE_PRIORITY_BOOST,
  ARTICLE_FAIR_DISTRIBUTION,
  ARTICLE_MEMBERSHIP_LEVEL_GATE,
  ARTICLE_SELECTION_AUTHORITY,
  ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
  ARTICLE_APPLICATION_FREE_FALLBACK_WHEN_BID_ENGINE_OFF,
  ARTICLE_APPLICATION_ACTIVATION_REQUIREMENT,
  ARTICLE_APPLICATION_STATUSES,
  ARTICLE_APPLICATION_ERROR_CODES,
  buildArticleApplicationIdempotencyKey,
  buildArticleApplicationBidConsumeIdempotencyKey,
  buildArticleApplicationBidRefundIdempotencyKey,
} = require("../src/constants/marketplaceArticleApplications");

const {
  ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT,
  ARTICLE_WORK_TOKEN_ENTRY: A2_WT_ENTRY,
} = require("../src/constants/marketplaceArticles");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase B5 product constants", () => {
  it("owner-approved Bid policy + fail-closed activation + isolations", () => {
    assert.strictEqual(ARTICLE_APPLICATION_BID_COST, 1);
    assert.strictEqual(ARTICLE_APPLICATION_BID_ECONOMICS_SCHEMA, "IMPLEMENTED_PENDING_MIGRATION_150");
    assert.strictEqual(ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME, "WIRED");
    assert.strictEqual(ARTICLE_APPLICATION_WITHDRAWAL_REFUND, "NONE");
    assert.strictEqual(ARTICLE_APPLICATION_REJECTION_REFUND, "NONE");
    assert.strictEqual(ARTICLE_APPLICATION_LOSER_REFUND, "NONE");
    assert.strictEqual(ARTICLE_APPLICATION_NO_SELECTION_REFUND, "100_PERCENT");
    assert.strictEqual(ARTICLE_VALUE_TO_BID_COST_MAPPING, "NONE");
    assert.strictEqual(ARTICLE_LEVEL_TO_BID_COST_MAPPING, "NONE");
    assert.strictEqual(ARTICLE_WORK_TOKEN_ENTRY, "CANCELLED");
    assert.strictEqual(ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME, "NONE");
    assert.strictEqual(A2_WT_ENTRY, "CANCELLED");
    assert.strictEqual(ARTICLE_APPLICATION_HISTORICAL_BACKFILL, "NONE");
    assert.strictEqual(ARTICLE_APPLICATION_BID_HISTORICAL_BACKFILL, "NONE");
    assert.strictEqual(ARTICLE_PRIORITY_BOOST, "NOT_IMPLEMENTED");
    assert.strictEqual(ARTICLE_FAIR_DISTRIBUTION, "NOT_IMPLEMENTED");
    assert.strictEqual(ARTICLE_MEMBERSHIP_LEVEL_GATE, "ENFORCED");
    assert.strictEqual(ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT, "ENFORCED");
    assert.strictEqual(ARTICLE_SELECTION_AUTHORITY, "SUPER_ADMIN_EXPLICIT");
    assert.strictEqual(ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST, 0);
    assert.strictEqual(ARTICLE_APPLICATION_FREE_FALLBACK_WHEN_BID_ENGINE_OFF, "NO");
    assert.strictEqual(
      ARTICLE_APPLICATION_ACTIVATION_REQUIREMENT,
      "ARTICLE_APPLICATIONS_AND_BID_CREDITS_ENABLED",
    );
  });

  it("idempotency keys deterministic", () => {
    assert.strictEqual(
      buildArticleApplicationIdempotencyKey(7, 3),
      "article_application:article:7:freelancer:3",
    );
    assert.strictEqual(
      buildArticleApplicationBidConsumeIdempotencyKey(7, 3),
      "article_application_bid_consume:article:7:freelancer:3",
    );
    assert.strictEqual(
      buildArticleApplicationBidRefundIdempotencyKey(7, 3),
      "article_application_bid_refund:article:7:freelancer:3",
    );
    assert.ok(ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_BID_ECONOMY_DISABLED);
    assert.ok(ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_BID_ECONOMICS_SCHEMA_NOT_READY);
  });

  it("minimal statuses only", () => {
    assert.deepStrictEqual([...ARTICLE_APPLICATION_STATUSES].sort(), [
      "cancelled",
      "pending",
      "rejected",
      "selected",
      "withdrawn",
    ]);
  });
});

describe("Phase B5 migration 150 authored (not applied to Production)", () => {
  const sqlPath = path.join(root, "sql", "migrations", "150_article_application_bid_credit_economics.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("creates dedicated economics table; extends ledger/source CHECKs; no enable/backfill", () => {
    assert.match(sql, /150_article_application_bid_credit_economics/);
    assert.match(sql, /marketplace_article_application_bid_credit_economics/);
    assert.match(sql, /ARTICLE_APPLICATION_BID_CONSUME/);
    assert.match(sql, /ARTICLE_APPLICATION_BID_REFUND/);
    assert.match(sql, /article_application_refund/);
    assert.match(sql, /bid_credit_cost INTEGER NOT NULL DEFAULT 1/);
    assert.match(sql, /CHECK \(bid_credit_cost = 1\)/);
    assert.match(sql, /UNIQUE \(article_application_id\)/);
    assert.match(sql, /UNIQUE \(article_id, freelancer_user_id\)/);
    assert.match(sql, /ON DELETE RESTRICT/);
    assert.doesNotMatch(sql, /SET\s+article_applications_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /SET\s+bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_article_applications\s*\(/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_article_application_bid_credit_economics\s*\(/i);
    assert.match(sql, /Independent of order_freelancer_bid_credit_economics|NOT order_freelancer_bid_credit_economics/i);
    assert.doesNotMatch(sql, /DROP TABLE\s+work_token|DROP TABLE\s+priority/i);
  });

  it("preserves prior ledger events in CHECK extension", () => {
    assert.match(sql, /APPLICATION_BID_CONSUME/);
    assert.match(sql, /NORMAL_APPLICATION_BID_REFUND/);
    assert.match(sql, /MEMBERSHIP_BID_GRANT/);
    assert.match(sql, /normal_application_refund/);
  });
});

describe("Phase B5 service architecture — Bid wired fail-closed", () => {
  const svc = read("src/services/marketplaceArticleApplicationsService.js");
  const bidSvc = read("src/services/marketplaceArticleApplicationBidCreditService.js");
  const articlesSvc = read("src/services/marketplaceArticlesService.js");
  const accounting = read("src/services/marketplaceBidCreditAccountingService.js");
  const appJs = read("src/app.js");

  it("charges Article Bid inside submit txn; no free fallback", () => {
    assert.match(svc, /chargeArticleApplicationBidCredit/);
    assert.match(svc, /assertArticleBidEconomyActive/);
    assert.match(bidSvc, /ARTICLE_BID_ECONOMY_DISABLED/);
    assert.match(bidSvc, /ARTICLE_APPLICATION_BID_CONSUME/);
    assert.match(bidSvc, /consumeBidCreditsFefo/);
    assert.match(accounting, /eventType/);
    assert.doesNotMatch(svc, /work_token_wallet|reserveWorkTokens|consumeWorkTokens/);
    assert.doesNotMatch(bidSvc, /work_token/);
  });

  it("no-selection refund on Article close/cancel; withdraw/reject/loser none", () => {
    assert.match(articlesSvc, /refundNoSelectionArticleApplications/);
    assert.match(bidSvc, /refundNoSelectionArticleApplications/);
    assert.match(bidSvc, /same_bucket_restore|compensating_grant_30d/);
    assert.match(bidSvc, /ARTICLE_APPLICATION_REFUND_GRANT_SOURCE/);
    assert.match(svc, /ARTICLE_APPLICATION_WITHDRAWAL_REFUND/);
    assert.match(svc, /ARTICLE_APPLICATION_REJECTION_REFUND/);
  });

  it("locks + freeze + routes preserved", () => {
    assert.match(svc, /FOR UPDATE/);
    assert.match(svc, /assertArticleMetadataMutable/);
    assert.match(articlesSvc, /assertArticleMetadataMutable/);
    assert.match(appJs, /freelancerMarketplaceArticleApplicationsRoutes/);
    assert.match(appJs, /superAdminMarketplaceArticleApplicationsRoutes/);
  });

  it("does not reuse order economics table", () => {
    assert.doesNotMatch(bidSvc, /order_freelancer_bid_credit_economics/);
    assert.match(bidSvc, /marketplace_article_application_bid_credit_economics/);
  });
});

describe("Phase B5 isolations", () => {
  it("Priority Boost still forbids Article surfaces", () => {
    const boost = read("src/services/marketplacePriorityApplicationBoostService.js");
    assert.match(boost, /assertNotArticleSurface|ARTICLE_FORBIDDEN/);
  });

  it("applications domain not order_freelancer_bids runtime", () => {
    const svc = read("src/services/marketplaceArticleApplicationsService.js");
    assert.doesNotMatch(svc, /FROM order_freelancer_bids|submitPoolOrderBid\(/);
    assert.match(svc, /marketplace_article_applications/);
  });
});

describe("Phase B5 Freelancer UI cost copy", () => {
  it("shows Application cost: 1 Bid / تكلفة التقديم: عرض واحد", () => {
    const page = read("../frontend/src/pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(page, /Application cost: 1 Bid/);
    assert.match(page, /تكلفة التقديم: عرض واحد/);
    assert.doesNotMatch(page, /Work Token|Token rate|Level 5 = 5 Bids/i);
  });
});
