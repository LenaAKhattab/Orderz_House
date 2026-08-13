/**
 * ACTIVE_NEW_BID_MODEL — Phase B1 Bid Credits foundation tests.
 * Pure math + static wiring. No Production mutations.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_bid_credits_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  cumulativeBidUnlock,
  dailyBidUnlockAmount,
  buildMonthlyBidUnlockSchedule,
  countUtcCalendarDaysInWindow,
  resolveCurrentDayIndex,
} = require("../src/utils/marketplaceBidCreditDistributionMath");
const {
  NORMAL_APPLICATION_BID_COST,
  WORK_TOKEN_PRODUCT_STATUS,
  WORK_TOKEN_SCHEMA_DELETION,
  BID_CREDIT_HISTORICAL_BACKFILL,
  ARTICLE_WORK_TOKEN_ENTRY,
  BID_CREDIT_PRODUCT_LABEL_AR,
} = require("../src/constants/marketplaceBidCredits");

describe("ACTIVE_NEW_BID_MODEL daily distribution math", () => {
  for (const D of [28, 29, 30, 31]) {
    it(`totals exactly N across a ${D}-day month`, () => {
      for (const N of [0, 1, 7, 30, 100, 220, 420, 700]) {
        const schedule = buildMonthlyBidUnlockSchedule(N, D);
        const sum = schedule.reduce((s, row) => s + row.amount, 0);
        assert.strictEqual(sum, N);
        assert.strictEqual(cumulativeBidUnlock(N, D, D), N);
        assert.strictEqual(cumulativeBidUnlock(N, 0, D), 0);
      }
    });
  }

  it("daily unlock equals cumulative delta", () => {
    const N = 100;
    const D = 31;
    for (let k = 1; k <= D; k += 1) {
      assert.strictEqual(
        dailyBidUnlockAmount(N, k, D),
        cumulativeBidUnlock(N, k, D) - cumulativeBidUnlock(N, k - 1, D),
      );
    }
  });

  it("uses integer math only (no float remainder drift)", () => {
    const schedule = buildMonthlyBidUnlockSchedule(10, 31);
    assert.ok(schedule.every((row) => Number.isInteger(row.amount)));
  });
});

describe("ACTIVE_NEW_BID_MODEL window day counting", () => {
  it("counts UTC calendar days for monthly windows", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-02-01T00:00:00.000Z");
    assert.strictEqual(countUtcCalendarDaysInWindow(start, end), 31);
    assert.strictEqual(resolveCurrentDayIndex(start, end, 31, new Date("2026-01-01T12:00:00.000Z")), 1);
    assert.strictEqual(resolveCurrentDayIndex(start, end, 31, new Date("2026-01-31T12:00:00.000Z")), 31);
    assert.strictEqual(resolveCurrentDayIndex(start, end, 31, new Date("2026-02-01T00:00:00.000Z")), 31);
  });
});

describe("ACTIVE_NEW_BID_MODEL product constants", () => {
  it("locks approved product statuses", () => {
    assert.strictEqual(NORMAL_APPLICATION_BID_COST, 1);
    assert.strictEqual(WORK_TOKEN_PRODUCT_STATUS, "DEPRECATED");
    assert.strictEqual(WORK_TOKEN_SCHEMA_DELETION, "DEFERRED");
    assert.strictEqual(BID_CREDIT_HISTORICAL_BACKFILL, "NONE");
    assert.strictEqual(ARTICLE_WORK_TOKEN_ENTRY, "CANCELLED");
    assert.strictEqual(BID_CREDIT_PRODUCT_LABEL_AR, "العروض المتاحة");
  });
});

describe("ACTIVE_NEW_BID_MODEL migration 146 authored", () => {
  const sqlPath = path.join(
    __dirname,
    "..",
    "sql",
    "migrations",
    "146_marketplace_bid_credits_foundation.sql",
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("creates Bid Credit foundation tables and flag", () => {
    assert.match(sql, /bid_credits_enabled/);
    assert.match(sql, /monthly_bid_allowance/);
    assert.match(sql, /marketplace_bid_credit_grants/);
    assert.match(sql, /marketplace_bid_credit_ledger_entries/);
    assert.match(sql, /marketplace_membership_bid_distribution_months/);
    assert.match(sql, /marketplace_bid_credit_packages/);
    assert.match(sql, /146_marketplace_bid_credits_foundation/);
  });

  it("does not DROP Work Token tables", () => {
    assert.doesNotMatch(sql, /DROP TABLE.*work_token/i);
    assert.doesNotMatch(sql, /DROP TABLE.*freelancer_work_token/i);
  });

  it("zeros included_tokens_per_cycle without converting token amounts to bids", () => {
    assert.match(sql, /included_tokens_per_cycle = 0/);
    assert.doesNotMatch(sql, /monthly_bid_allowance\s*=\s*included_tokens/);
  });
});

describe("ACTIVE_NEW_BID_MODEL cycle activation no longer grants Work Tokens", () => {
  it("membership cycle service does not call token grant", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "marketplaceMembershipCyclesService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /grantMembershipCycleIncludedWorkTokens\(/);
    assert.match(src, /marketplaceBidCreditDistributionService/);
  });
});

describe("ACTIVE_NEW_BID_MODEL frontend Work Token product surfaces removed", () => {
  it("Freelancer plans page uses Bid Credits card", () => {
    const page = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "frontend",
        "src",
        "pages",
        "dashboard",
        "FreelancerPlansPage.jsx",
      ),
      "utf8",
    );
    assert.match(page, /FreelancerBidCreditsCard/);
    assert.doesNotMatch(page, /FreelancerWorkTokenWalletCard/);
  });

  it("membership admin form uses Bids per month", () => {
    const modal = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "frontend",
        "src",
        "admin",
        "marketplaceMembership",
        "MarketplaceMembershipPlanFormModal.jsx",
      ),
      "utf8",
    );
    assert.match(modal, /monthlyBidAllowance|Bids per month|العروض المتاحة \/ شهر/);
    assert.doesNotMatch(modal, /Included tokens \/ cycle/);
  });
});
