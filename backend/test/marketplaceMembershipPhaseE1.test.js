/**
 * Phase E1 — Marketplace Membership + Bid usage rules (static).
 * Does NOT apply migration 153. No Production mutation / git / deploy / engine enable.
 *
 * Run: npm run test:marketplace-membership-e1
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_membership_e1_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
  E1_PLAN_SPECS,
  MEMBERSHIP_BID_DISTRIBUTION,
  MEMBERSHIP_ACTIVATION_REQUIRES_VERIFICATION,
  PAID_MEMBERSHIP_ACTIVATION_REQUIRES_TRAINING,
  PAID_MEMBERSHIP_PERIOD_START,
  STARTER_WITHDRAWAL,
  STARTER_EARNINGS_MODE,
  DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE,
} = require("../src/constants/marketplaceMembershipPlans");

const {
  evaluateProjectValueEligibility,
  evaluateMembershipWithdrawalEligibility,
} = require("../src/services/marketplaceMembershipEligibilityService");

const {
  resolveBusinessSpendDate,
} = require("../src/services/marketplaceMembershipDailyBidSpendService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase E1 catalog constants", () => {
  it("locks STARTER/SILVER/PRO/ELITE commercial specs", () => {
    assert.deepEqual([...MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES], [
      "starter",
      "silver",
      "pro",
      "elite",
    ]);
    assert.strictEqual(E1_PLAN_SPECS.starter.totalBids, 20);
    assert.strictEqual(E1_PLAN_SPECS.starter.dailyBidLimit, 2);
    assert.strictEqual(E1_PLAN_SPECS.starter.durationDays, 10);
    assert.strictEqual(E1_PLAN_SPECS.starter.priceJod, 0);
    assert.strictEqual(E1_PLAN_SPECS.silver.totalBids, 40);
    assert.strictEqual(E1_PLAN_SPECS.silver.dailyBidLimit, 3);
    assert.strictEqual(E1_PLAN_SPECS.silver.priceJod, 19);
    assert.strictEqual(E1_PLAN_SPECS.pro.totalBids, 100);
    assert.strictEqual(E1_PLAN_SPECS.pro.dailyBidLimit, 7);
    assert.strictEqual(E1_PLAN_SPECS.pro.priceJod, 39);
    assert.strictEqual(E1_PLAN_SPECS.elite.totalBids, 150);
    assert.strictEqual(E1_PLAN_SPECS.elite.dailyBidLimit, 10);
    assert.strictEqual(E1_PLAN_SPECS.elite.priceJod, 59);
    assert.strictEqual(E1_PLAN_SPECS.elite.unlimitedProjectMax, true);
    assert.strictEqual(MEMBERSHIP_BID_DISTRIBUTION, "FULL_CYCLE_GRANT_WITH_DAILY_SPEND_LIMIT");
    assert.strictEqual(MEMBERSHIP_ACTIVATION_REQUIRES_VERIFICATION, "YES");
    assert.strictEqual(PAID_MEMBERSHIP_ACTIVATION_REQUIRES_TRAINING, "YES");
    assert.strictEqual(PAID_MEMBERSHIP_PERIOD_START, "COMPANY_APPROVAL_TIME");
    assert.strictEqual(STARTER_WITHDRAWAL, "BLOCKED");
    assert.strictEqual(STARTER_EARNINGS_MODE, "PENDING");
  });
});

describe("Phase E1 project value eligibility", () => {
  it("40 JOD → Pro/Elite only", () => {
    const starter = evaluateProjectValueEligibility(
      { projectMinValueJod: 1, maxRealOrderValueJod: 10, unlimitedRealOrderValue: false },
      40,
    );
    const silver = evaluateProjectValueEligibility(
      { projectMinValueJod: 1, maxRealOrderValueJod: 20, unlimitedRealOrderValue: false },
      40,
    );
    const pro = evaluateProjectValueEligibility(
      { projectMinValueJod: 1, maxRealOrderValueJod: 50, unlimitedRealOrderValue: false },
      40,
    );
    const elite = evaluateProjectValueEligibility(
      { projectMinValueJod: 1, maxRealOrderValueJod: null, unlimitedRealOrderValue: true },
      40,
    );
    assert.equal(starter.eligible, false);
    assert.equal(silver.eligible, false);
    assert.equal(pro.eligible, true);
    assert.equal(elite.eligible, true);
  });
});

describe("Phase E1 withdrawal + Starter pending", () => {
  it("blocks Starter withdrawal; allows paid", () => {
    const s = evaluateMembershipWithdrawalEligibility({
      tierCode: "starter",
      withdrawalEnabled: false,
      starterEarningsMode: "pending",
    });
    assert.equal(s.allowed, false);
    assert.strictEqual(s.starterWithdrawal, "BLOCKED");
    const p = evaluateMembershipWithdrawalEligibility({
      tierCode: "silver",
      withdrawalEnabled: true,
      starterEarningsMode: "standard",
    });
    assert.equal(p.allowed, true);
  });
});

describe("Phase E1 business-day boundary", () => {
  it("uses Asia/Amman date key", () => {
    const key = resolveBusinessSpendDate(
      new Date("2026-08-13T21:30:00.000Z"),
      DEFAULT_MEMBERSHIP_BUSINESS_TIMEZONE,
    );
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Phase E1 migration 153 authored (not applied)", () => {
  const sqlPath = path.join(root, "sql", "migrations", "153_marketplace_membership_e1_bid_rules.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const sha = crypto.createHash("sha256").update(fs.readFileSync(sqlPath)).digest("hex");

  it("adds plan columns, activation requests, daily spend, catalog cutover", () => {
    assert.match(sql, /cycle_duration_days/);
    assert.match(sql, /daily_bid_spend_limit/);
    assert.match(sql, /project_min_value_jod/);
    assert.match(sql, /withdrawal_enabled/);
    assert.match(sql, /starter_earnings_mode/);
    assert.match(sql, /bid_distribution_mode/);
    assert.match(sql, /full_cycle/);
    assert.match(sql, /marketplace_membership_activation_requests/);
    assert.match(sql, /marketplace_freelancer_daily_bid_spend/);
    assert.match(sql, /'starter'/);
    assert.match(sql, /'silver'/);
    assert.match(sql, /monthly_bid_allowance = 100/);
    assert.match(sql, /monthly_bid_allowance = 150/);
    assert.match(sql, /153_marketplace_membership_e1_bid_rules/);
    assert.doesNotMatch(sql, /SET\s+bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_credit_grants/i);
    assert.doesNotMatch(sql, /INSERT INTO freelancer_marketplace_memberships/i);
    // eslint-disable-next-line no-console
    console.log("MIGRATION_153_SHA256", sha);
  });
});

describe("Phase E1 wiring", () => {
  it("verification + training + company approval + full-cycle + daily gate", () => {
    const elig = read("src/services/marketplaceMembershipEligibilityService.js");
    const mem = read("src/services/marketplaceMembershipsService.js");
    const dist = read("src/services/marketplaceBidCreditDistributionService.js");
    const act = read("src/services/marketplaceMembershipActivationRequestService.js");
    const normal = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    const article = read("src/services/marketplaceArticleApplicationBidCreditService.js");
    const articleApps = read("src/services/marketplaceArticleApplicationsService.js");
    const reserve = read("src/services/marketplaceBidCreditReservationService.js");
    const claims = read("src/services/financialClaimsService.js");
    const flRoutes = read("src/routes/freelancerMarketplaceMembershipRoutes.js");
    const adminRoutes = read("src/routes/superAdminMarketplaceMembershipsRoutes.js");
    const poolSvc = read("src/services/marketplaceBidDistributionPoolService.js");
    const adminModal = read(
      path.join("..", "frontend", "src", "admin", "marketplaceMembership", "MarketplaceMembershipPlanFormModal.jsx"),
    );

    assert.match(elig, /MEMBERSHIP_VERIFICATION_FEE_REQUIRED/);
    assert.match(elig, /getActivationFeeStatus/);
    assert.match(elig, /MEMBERSHIP_TRAINING_NOT_CONFIGURED/);
    assert.match(mem, /assertMarketplaceVerificationComplete/);
    assert.match(mem, /assertStarterNotAlreadyConsumed/);
    assert.match(mem, /cycleDurationDays/);
    assert.match(dist, /full_cycle/);
    assert.match(dist, /membership_full_cycle:/);
    assert.match(dist, /engineOn && membershipUsable/);
    assert.match(act, /COMPANY_APPROVAL_TIME|PAID_MEMBERSHIP_PERIOD_START/);
    assert.match(act, /assertPaidTrainingComplete/);
    assert.match(act, /approveActivationRequest/);
    assert.match(normal, /assertAndConsumeDailyBidSpend/);
    // E2: Article daily gate moves to reservation (B5 immediate charge deprecated).
    assert.match(reserve, /assertAndConsumeDailyBidSpend/);
    assert.match(articleApps, /reserveBidCreditsFefo/);
    assert.match(article, /DEPRECATED_INACTIVE_E2_USE_RESERVATION/);
    assert.match(claims, /STARTER_WITHDRAWAL_BLOCKED/);
    assert.match(flRoutes, /starter\/activate/);
    assert.match(flRoutes, /activation-requests/);
    assert.match(adminRoutes, /activation-requests\/:requestId\/approve/);
    assert.match(poolSvc, /admin_distribution_pool|ADMIN_BID_POOL_GRANT_SOURCE/);
    assert.match(adminModal, /dailyBidSpendLimit/);
    assert.match(adminModal, /cycleDurationDays/);
    assert.match(adminModal, /bidDistributionMode/);
    assert.match(adminModal, /withdrawalEnabled/);
    assert.doesNotMatch(dist, /work_token/i);
  });

  it("public plans mapper shows duration/daily/project/withdrawal", () => {
    const mapper = read(
      path.join("..", "frontend", "src", "lib", "marketplaceMembership", "mapMarketplaceMembershipPlanForPublicPlans.js"),
    );
    assert.match(mapper, /Daily Bid limit|الحد اليومي/);
    assert.match(mapper, /Withdrawal disabled|السحب متوقف/);
    assert.match(mapper, /cycleDurationDays/);
  });
});
