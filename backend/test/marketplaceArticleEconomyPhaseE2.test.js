/**
 * Phase E2 — Article Economy focused tests (static + money math).
 * Does NOT apply Migration 154. No Production mutation / git / deploy / engine enable.
 *
 * Run: node --test test/marketplaceArticleEconomyPhaseE2.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_article_economy_e2_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const crypto = require("node:crypto");

const {
  ARTICLE_VALUE_STARTER_JOD,
  ARTICLE_VALUE_SILVER_JOD,
  ARTICLE_VALUE_PRO_JOD,
  ARTICLE_VALUE_ELITE_JOD,
  ARTICLE_COMPANY_SHARE_PERCENT,
  ARTICLE_REVIEWER_FEE_JOD,
  ARTICLE_APPLICATION_BID_BEHAVIOR,
  ARTICLE_APPLICATION_FINAL_BID_CONSUME_TIME,
  OLD_ARTICLE_APPLICATION_IMMEDIATE_BID_CHARGE,
  STARTER_ARTICLE_WRITER_EARNINGS,
  STARTER_PENDING_EARNINGS_RELEASE_TRIGGER,
  ARTICLE_CAMPAIGN_AUTO_STOP,
  BILDAZO_PUBLISH_FAILURE_REPEATS_FINANCIAL_SETTLEMENT,
} = require("../src/constants/marketplaceArticleEconomy");

const {
  calculateArticleFinancialSplit,
} = require("../src/utils/marketplaceArticleMoney");
const { calculateUnusedBidsToReturn } = require("../src/utils/marketplaceBidPoolMoney");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase E2 Article financial split (milli-JOD)", () => {
  const cases = [
    ["1.000", "0.300", "0.200", "0.500"],
    ["2.000", "0.600", "0.200", "1.200"],
    ["3.000", "0.900", "0.200", "1.900"],
    ["4.000", "1.200", "0.200", "2.600"],
  ];
  for (const [gross, company, reviewer, writer] of cases) {
    it(`${gross} → company ${company} reviewer ${reviewer} writer ${writer}`, () => {
      const split = calculateArticleFinancialSplit({
        grossJod: gross,
        companySharePercent: ARTICLE_COMPANY_SHARE_PERCENT,
        reviewerFeeJod: ARTICLE_REVIEWER_FEE_JOD,
      });
      assert.strictEqual(split.companyShareJod, company);
      assert.strictEqual(split.reviewerFeeJod, reviewer);
      assert.strictEqual(split.writerNetJod, writer);
    });
  }

  it("rejects company+reviewer > gross", () => {
    assert.throws(
      () =>
        calculateArticleFinancialSplit({
          grossJod: "0.100",
          companySharePercent: 30,
          reviewerFeeJod: "0.200",
        }),
      /cannot exceed|ARTICLE_ECONOMY_INVALID_SPLIT/i,
    );
  });
});

describe("Phase E2 product constants", () => {
  it("locks approved E2 Article economy markers", () => {
    assert.strictEqual(ARTICLE_VALUE_STARTER_JOD, "1.000");
    assert.strictEqual(ARTICLE_VALUE_SILVER_JOD, "2.000");
    assert.strictEqual(ARTICLE_VALUE_PRO_JOD, "3.000");
    assert.strictEqual(ARTICLE_VALUE_ELITE_JOD, "4.000");
    assert.strictEqual(ARTICLE_COMPANY_SHARE_PERCENT, 30);
    assert.strictEqual(ARTICLE_REVIEWER_FEE_JOD, "0.200");
    assert.strictEqual(
      ARTICLE_APPLICATION_BID_BEHAVIOR,
      "RESERVE_ON_APPLICATION_CONSUME_ON_FINAL_APPROVAL",
    );
    assert.strictEqual(ARTICLE_APPLICATION_FINAL_BID_CONSUME_TIME, "FINAL_ARTICLE_APPROVAL");
    assert.strictEqual(OLD_ARTICLE_APPLICATION_IMMEDIATE_BID_CHARGE, "DEPRECATED_INACTIVE");
    assert.strictEqual(STARTER_ARTICLE_WRITER_EARNINGS, "PENDING_UNTIL_ELIGIBLE_UPGRADE");
    assert.strictEqual(STARTER_PENDING_EARNINGS_RELEASE_TRIGGER, "PAID_MEMBERSHIP_ACTIVATION");
    assert.strictEqual(ARTICLE_CAMPAIGN_AUTO_STOP, "ENABLED");
    assert.strictEqual(BILDAZO_PUBLISH_FAILURE_REPEATS_FINANCIAL_SETTLEMENT, "NO");
  });
});

describe("Phase E2 D1 reserved Bids not returned", () => {
  it("excludes amountReserved from unused pool return", () => {
    assert.strictEqual(
      calculateUnusedBidsToReturn({
        allocatedBids: 10,
        amountConsumed: 2,
        amountRevoked: 0,
        returnedBids: 0,
        amountReserved: 3,
      }),
      5,
    );
  });
});

describe("Phase E2 migration 154 authored (not applied)", () => {
  const sqlPath = path.join(root, "sql", "migrations", "154_marketplace_article_economy_e2.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const sha = crypto.createHash("sha256").update(fs.readFileSync(sqlPath)).digest("hex");

  it("adds reservation, settlement, campaign, economy config, outbox", () => {
    assert.match(sql, /amount_reserved/);
    assert.match(sql, /marketplace_bid_credit_reservations/);
    assert.match(sql, /marketplace_bid_credit_reservation_slices/);
    assert.match(sql, /marketplace_article_settlements/);
    assert.match(sql, /marketplace_article_financial_entries/);
    assert.match(sql, /marketplace_article_bildazo_outbox/);
    assert.match(sql, /article_value_starter_jod/);
    assert.match(sql, /budget_total_jod/);
    assert.match(sql, /target_article_count/);
    assert.match(sql, /BID_RESERVE/);
    assert.match(sql, /154_marketplace_article_economy_e2/);
    assert.doesNotMatch(sql, /SET\s+bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /SET\s+article_applications_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_credit_grants/i);
    // eslint-disable-next-line no-console
    console.log("MIGRATION_154_SHA256", sha);
  });
});

describe("Phase E2 wiring", () => {
  it("uses reservation not immediate B5 charge; settlement + starter release", () => {
    const apps = read("src/services/marketplaceArticleApplicationsService.js");
    const charge = read("src/services/marketplaceArticleApplicationBidCreditService.js");
    const settle = read("src/services/marketplaceArticleSettlementService.js");
    const reserve = read("src/services/marketplaceBidCreditReservationService.js");
    const mem = read("src/services/marketplaceMembershipsService.js");
    const accounting = read("src/services/marketplaceBidCreditAccountingService.js");
    const pool = read("src/services/marketplaceBidDistributionPoolService.js");

    assert.match(apps, /reserveBidCreditsFefo/);
    assert.match(apps, /finalizeArticleApplicationApproval/);
    assert.match(apps, /releaseApplicationReservation/);
    assert.doesNotMatch(apps, /chargeArticleApplicationBidCredit\(/);
    assert.match(charge, /DEPRECATED_INACTIVE_E2_USE_RESERVATION/);
    assert.match(settle, /finalizeArticleApproval/);
    assert.match(settle, /releaseStarterPendingArticleEarnings/);
    assert.match(settle, /marketplace_article_bildazo_outbox/);
    assert.match(reserve, /amount_reserved/);
    assert.match(reserve, /BID_RESERVE_CONSUME/);
    assert.match(mem, /releaseStarterPendingArticleEarnings/);
    assert.match(accounting, /amount_reserved/);
    assert.match(pool, /ONLY_RESERVED_REMAINS|amountReserved|GRANT_HAS_ACTIVE_RESERVATION/);
    assert.match(apps, /ARTICLE_WORK_TOKEN_ENTRY/);
    assert.match(apps, /CANCELLED/);
    assert.doesNotMatch(apps, /workTokenConsumed:\s*[1-9]/);
  });
});
