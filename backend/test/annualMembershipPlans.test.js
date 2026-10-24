/**
 * Annual Plans (الباقات السنوية) — Annual Basic on the canonical marketplace membership stack.
 * Mocks Stripe + DB only. No real Stripe / Production writes.
 *
 * Run: node --test test/annualMembershipPlans.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/annual_membership_plans_placeholder";
process.env.CLIENT_URL = process.env.CLIENT_URL || "https://example-orderzhouse.test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_annual_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ANNUAL_MEMBERSHIP_TIER_CODES,
  CANONICAL_MARKETPLACE_TIER_CODES,
  PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES,
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
  E1_PLAN_SPECS,
  isAnnualMembershipTier,
  isCanonicalMarketplaceTier,
} = require("../src/constants/marketplaceMembershipPlans");
const { PLAN_RESTRICTION_TIER_CODES } = require("../src/constants/freelancerAccountRestrictions");
const {
  isPaidMarketplaceMembershipTier,
  resolvePlanTermDuration,
  computePaidTermWindowForPlan,
} = require("../src/utils/marketplaceMembershipPendingStart");
const { evaluateProjectValueEligibility } = require("../src/services/marketplaceMembershipEligibilityService");
const {
  isPlanValueAllowedForOrder,
} = require("../src/services/planOrderValueEligibility");
const { computePendingStartApplicationBidAllowance } = require(
  "../src/services/marketplacePendingStartBidAllowanceService",
);
const { assertAndConsumeDailyBidSpend } = require("../src/services/marketplaceMembershipDailyBidSpendService");
const {
  createMarketplaceMembershipCheckoutSession,
  resolvePaidMarketplacePlanForCheckout,
  applyMarketplaceMembershipCheckoutSessionCompleted,
} = require("../src/services/marketplaceMembershipCheckoutService");
const { tierFromSubscriptionPlan } = require("../src/services/canonicalCurrentMembershipDisplay");
const { normalizeMembershipTierForCourses } = require("../src/services/coursePlanEligibilityService");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const MIGRATION = read("sql/migrations/206_annual_membership_plans.sql");

/** Mirrors the annual_basic row seeded by migration 206 (mapped service shape). */
function annualPlan(overrides = {}) {
  return {
    id: 21,
    tierCode: "annual_basic",
    nameAr: "الباقة السنوية الأساسية",
    nameEn: "Annual Basic",
    isActive: true,
    monthlyPriceJod: 50,
    cycleDurationDays: null,
    entitlementDurationMonths: 12,
    bidAllowanceScope: "term",
    catalogCategory: "annual",
    monthlyBidAllowance: 480,
    dailyBidSpendLimit: 3,
    projectMinValueJod: 1,
    maxRealOrderValueJod: 20,
    unlimitedRealOrderValue: false,
    saleEnabled: false,
    ...overrides,
  };
}

function mockStripe(capture) {
  return {
    checkout: {
      sessions: {
        create: async (params, opts) => {
          capture.params = params;
          capture.opts = opts;
          return { id: "cs_test_annual", url: "https://checkout.stripe.test/pay/cs_test_annual" };
        },
      },
    },
  };
}

function mockDb(user = { id: 42, role: "freelancer", is_active: true, email: "f@example.com" }) {
  return { query: async () => ({ rows: user ? [user] : [] }) };
}

function paidSession(overrides = {}) {
  return {
    id: "cs_test_annual_paid",
    mode: "payment",
    payment_status: "paid",
    status: "complete",
    amount_total: 50000,
    currency: "jod",
    created: 1793000000,
    metadata: {
      purpose: "marketplace_membership_checkout",
      flow: "marketplace_membership",
      freelancerUserId: "42",
      marketplacePlanId: "21",
      planCode: "annual_basic",
      durationMonths: "12",
      expectedAmountMinor: "50000",
    },
    ...overrides,
  };
}

describe("Annual Basic — migration 206 plan config", () => {
  it("is additive and idempotent on the canonical plan table", () => {
    assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS catalog_category/);
    assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS entitlement_duration_months/);
    assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS bid_allowance_scope/);
    assert.match(MIGRATION, /ADD COLUMN IF NOT EXISTS included_benefits/);
    assert.match(MIGRATION, /ON CONFLICT \(tier_code\) DO NOTHING/);
    assert.match(MIGRATION, /'206_annual_membership_plans'/);
    assert.doesNotMatch(MIGRATION, /DROP TABLE|DELETE FROM|TRUNCATE/i);
    assert.doesNotMatch(MIGRATION, /UPDATE\s+(freelancer_marketplace_memberships|freelancer_subscriptions|marketplace_membership_plans)/i);
  });

  it("seeds annual_basic: 50 JOD, 12 months, ≤10 JOD, 30 total, 3 daily", () => {
    const values = MIGRATION.slice(MIGRATION.indexOf(") VALUES ("));
    assert.match(values, /'annual_basic', 'الباقة السنوية الأساسية', 'Annual Basic'/);
    assert.match(values, /TRUE, 50, 50,\s+10, FALSE,\s+0, 30,/);
    assert.match(values, /NULL, 3, 1,/);
    assert.match(values, /'annual', 12, 'term'/);
  });

  it("includes Content Writing + DV Lottery as company-fulfilled benefits", () => {
    assert.match(MIGRATION, /"code":"content_writing_course","labelAr":"دورة كتابة المحتوى","labelEn":"Content Writing Course","fulfillment":"company_service"/);
    assert.match(
      MIGRATION,
      /"code":"us_dv_lottery_application","labelAr":"التقديم على اللوتري الأمريكي","labelEn":"U\.S\. Diversity Visa Lottery Application Service","fulfillment":"company_service"/,
    );
  });

  it("plan code is unique among tier constants and recognized everywhere it belongs", () => {
    assert.deepEqual([...ANNUAL_MEMBERSHIP_TIER_CODES], ["annual_basic"]);
    assert.equal(new Set(CANONICAL_MARKETPLACE_TIER_CODES).size, CANONICAL_MARKETPLACE_TIER_CODES.length);
    assert.ok(PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES.includes("annual_basic"));
    assert.ok(isPaidMarketplaceMembershipTier("ANNUAL_BASIC"));
    assert.ok(isAnnualMembershipTier("annual_basic"));
    assert.ok(isCanonicalMarketplaceTier("annual_basic"));
    assert.ok(PLAN_RESTRICTION_TIER_CODES.includes("annual_basic"));
    // Regular marketplace catalog unchanged.
    assert.deepEqual([...MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES], ["starter", "silver", "pro", "elite"]);
    assert.equal(E1_PLAN_SPECS.annual_basic.totalBids, 480);
    assert.equal(E1_PLAN_SPECS.annual_basic.projectMaxJod, E1_PLAN_SPECS.silver.projectMaxJod);
    assert.equal(E1_PLAN_SPECS.annual_basic.dailyBidLimit, 3);
    assert.equal(E1_PLAN_SPECS.annual_basic.durationMonths, 12);
  });
});

describe("Annual SILVER parity — migration 207 + entitlement tier", () => {
  const M207 = read("sql/migrations/207_annual_silver_plan_alignment.sql");
  const { resolveEntitlementTierCode, ANNUAL_PLAN_ENTITLEMENT_TIER, defaultArticleAccessLevelForTier } =
    require("../src/constants/marketplaceMembershipPlans");

  it("is additive: one UPDATE of the annual row, values copied from the live SILVER row", () => {
    assert.match(M207, /UPDATE marketplace_membership_plans AS a/);
    assert.match(M207, /FROM marketplace_membership_plans AS s/);
    assert.match(M207, /WHERE a\.tier_code = 'annual_basic'\s+AND s\.tier_code = 'silver'/);
    assert.match(M207, /'207_annual_silver_plan_alignment'/);
    assert.doesNotMatch(M207, /DELETE|TRUNCATE|DROP|freelancer_marketplace_memberships|stripe/i);
  });

  it("copies every SILVER marketplace capability from s.*", () => {
    for (const col of [
      "daily_bid_spend_limit",
      "project_min_value_jod",
      "max_real_order_value_jod",
      "unlimited_real_order_value",
      "withdrawal_enabled",
      "starter_earnings_mode",
      "bid_distribution_mode",
      "is_one_time_starter",
      "elite_direct_orders_enabled",
      "priority_bid_enabled",
      "article_access_level",
      "cash_allowed",
      "included_tokens_per_cycle",
    ]) {
      assert.match(M207, new RegExp(`${col} = s\\.${col}`), col);
    }
  });

  it("only the annual overrides differ: 480 total, Priority Bid uses scaled to one 12-month cycle", () => {
    assert.match(M207, /monthly_bid_allowance = 480/);
    assert.match(M207, /priority_bid_uses_per_cycle = s\.priority_bid_uses_per_cycle \* 12/);
    assert.doesNotMatch(M207, /monthly_price_jod|entitlement_duration_months|included_benefits|catalog_category/);
    assert.match(M207, /name_ar = 'SILVER — سنوية'/);
    assert.match(M207, /name_en = 'SILVER — Annual'/);
  });

  it("annual_basic grants SILVER entitlements in tier-coded gates", () => {
    assert.deepEqual({ ...ANNUAL_PLAN_ENTITLEMENT_TIER }, { annual_basic: "silver" });
    assert.equal(resolveEntitlementTierCode("ANNUAL_BASIC"), "silver");
    for (const t of ["starter", "silver", "pro", "elite", "special_offer"]) {
      assert.equal(resolveEntitlementTierCode(t), t, "other tiers unchanged");
    }
    assert.equal(defaultArticleAccessLevelForTier("annual_basic"), defaultArticleAccessLevelForTier("silver"));
    assert.equal(normalizeMembershipTierForCourses("annual_basic"), normalizeMembershipTierForCourses("silver"));
    for (const [file, pattern] of [
      ["src/services/freelancerActivationEngineService.js", /const tier = resolveEntitlementTierCode\(rows\[0\]\?\.tier_code\)/],
      ["src/services/freelancerActivationFairDistributionService.js", /const tier = resolveEntitlementTierCode\(row\.tier_code\)/],
      ["src/services/marketplaceArticleApplicationsService.js", /const tierCode = resolveEntitlementTierCode\(membership\.plan\?\.tierCode\)/],
      ["src/services/pantryMembershipBidService.js", /pantryTiers\.includes\(resolveEntitlementTierCode\(tier\)\)/],
    ]) {
      assert.match(read(file), pattern, file);
    }
  });

  it("withdrawal eligibility matches SILVER for an identical plan row", () => {
    const { evaluateMembershipWithdrawalEligibility } = require("../src/services/marketplaceMembershipEligibilityService");
    const silverRow = { tierCode: "silver", withdrawalEnabled: true, starterEarningsMode: "standard" };
    const annualRow = { ...silverRow, tierCode: "annual_basic" };
    assert.deepEqual(evaluateMembershipWithdrawalEligibility(annualRow), evaluateMembershipWithdrawalEligibility(silverRow));
    assert.equal(evaluateMembershipWithdrawalEligibility(annualRow).allowed, true);
  });
});

describe("Annual Basic — 12-month term (calendar months, first real order)", () => {
  it("resolves months over days", () => {
    assert.deepEqual(resolvePlanTermDuration(annualPlan()), { months: 12, days: null });
    assert.deepEqual(resolvePlanTermDuration(annualPlan({ cycleDurationDays: 30 })), {
      months: 12,
      days: null,
    });
    assert.deepEqual(resolvePlanTermDuration({ cycleDurationDays: 30 }), { months: null, days: 30 });
  });

  it("ends exactly 12 calendar months after the first real order", () => {
    const start = new Date("2026-11-03T09:15:00.000Z");
    const out = computePaidTermWindowForPlan({ startsAt: start, plan: annualPlan() });
    assert.equal(out.paidTermEndsAt.toISOString(), "2027-11-03T09:15:00.000Z");
    assert.equal(out.durationMonths, 12);
    assert.equal(out.durationDays, null);
  });

  it("clamps month-end anchors (Feb 29 → Feb 28 next year)", () => {
    const out = computePaidTermWindowForPlan({
      startsAt: new Date("2028-02-29T00:00:00.000Z"),
      plan: annualPlan(),
    });
    assert.equal(out.paidTermEndsAt.toISOString(), "2029-02-28T00:00:00.000Z");
  });

  it("day-based plans are unchanged (SILVER 30 days)", () => {
    const out = computePaidTermWindowForPlan({
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      plan: { cycleDurationDays: 30 },
    });
    assert.equal(out.paidTermEndsAt.toISOString(), "2026-01-31T00:00:00.000Z");
  });
});

describe("Annual SILVER — order value eligibility (SILVER band ≤ 20 JOD, backend)", () => {
  const plan = annualPlan();
  it("allows 5, 10 and 20 JOD", () => {
    assert.equal(evaluateProjectValueEligibility(plan, 5).eligible, true);
    assert.equal(evaluateProjectValueEligibility(plan, 10).eligible, true);
    assert.equal(evaluateProjectValueEligibility(plan, 20).eligible, true);
  });
  it("blocks 20.001 / 20.01 JOD and above", () => {
    for (const v of [20.001, 20.01, 21, 50]) {
      const out = evaluateProjectValueEligibility(plan, v);
      assert.equal(out.eligible, false, `value ${v}`);
      assert.equal(out.reason, "ABOVE_MAX");
    }
  });
  it("membership band applies on the pool range engine (fixed + bidding)", () => {
    const range = { minOrderValue: 1, maxOrderValue: 20 };
    assert.equal(isPlanValueAllowedForOrder({ project_type: "fixed", budget: 20 }, range), true);
    assert.equal(isPlanValueAllowedForOrder({ project_type: "fixed", budget: 20.01 }, range), false);
    assert.equal(
      isPlanValueAllowedForOrder({ project_type: "bidding", bid_budget_min: 21, bid_budget_max: 30 }, range),
      false,
    );
  });
});

/** Minimal transactional fake for marketplace_freelancer_daily_bid_spend. */
function dailySpendClient({ limit = 3 } = {}) {
  const rows = new Map();
  return {
    rows,
    async query(sql, params = []) {
      if (/FROM freelancer_marketplace_memberships m/.test(sql)) {
        return { rows: [{ daily_bid_spend_limit: limit, tier_code: "annual_basic", monthly_bid_allowance: 480 }] };
      }
      if (/marketplace_membership_business_timezone/.test(sql)) {
        return { rows: [{ tz: "Asia/Amman" }] };
      }
      if (/INSERT INTO marketplace_freelancer_daily_bid_spend/.test(sql)) {
        const key = `${params[0]}|${params[1]}`;
        if (!rows.has(key)) rows.set(key, 0);
        return { rows: [] };
      }
      if (/SELECT amount_spent FROM marketplace_freelancer_daily_bid_spend/.test(sql)) {
        return { rows: [{ amount_spent: rows.get(`${params[0]}|${params[1]}`) || 0 }] };
      }
      if (/UPDATE marketplace_freelancer_daily_bid_spend/.test(sql)) {
        const key = `${params[0]}|${params[1]}`;
        const next = (rows.get(key) || 0) + Number(params[2]);
        if (next > Number(params[3])) return { rows: [] };
        rows.set(key, next);
        return { rows: [{ amount_spent: next }] };
      }
      throw new Error(`unexpected SQL: ${sql.slice(0, 60)}`);
    },
  };
}

describe("Annual Basic — daily limit 3 (existing Asia/Amman business day)", () => {
  it("1st–3rd pass, 4th blocked same day, next business day passes", async () => {
    const client = dailySpendClient({ limit: 3 });
    const day1 = new Date("2026-11-03T10:00:00.000Z");
    for (let i = 1; i <= 3; i += 1) {
      const out = await assertAndConsumeDailyBidSpend({ client, freelancerUserId: 42, now: day1 });
      assert.equal(out.amountSpent, i);
      assert.equal(out.limit, 3);
    }
    await assert.rejects(
      () => assertAndConsumeDailyBidSpend({ client, freelancerUserId: 42, now: day1 }),
      (err) => err.publicCode === "MEMBERSHIP_DAILY_BID_LIMIT_REACHED",
    );
    // 22:30Z = 01:30 Amman next day → new business day.
    const day2 = new Date("2026-11-03T22:30:00.000Z");
    const out = await assertAndConsumeDailyBidSpend({ client, freelancerUserId: 42, now: day2 });
    assert.equal(out.amountSpent, 1);
    assert.equal(out.spendDate, "2026-11-04");
  });
});

describe("Annual SILVER — total allowance 480 per entitlement", () => {
  it("package grant equals the plan total (no monthly multiplier)", () => {
    assert.equal(computePendingStartApplicationBidAllowance(annualPlan()), 480);
  });

  it("cycle service scopes the allowance to the whole term", () => {
    const src = read("src/services/marketplaceMembershipCyclesService.js");
    assert.match(src, /isTermScopedPlan\(planRow\) && termEnd/);
    assert.match(src, /Term-scoped allowance never rolls into a second cycle/);
  });
});

describe("Annual Basic — Stripe checkout (server price only)", () => {
  it("resolves 50 JOD / 12 months from the plan row", async () => {
    const out = await resolvePaidMarketplacePlanForCheckout("ANNUAL_BASIC", {
      getPlanByTierCode: async () => annualPlan(),
    });
    assert.equal(out.planCode, "annual_basic");
    assert.equal(out.priceJod, 50);
    assert.equal(out.expectedAmountMinor, 50000);
    assert.equal(out.durationMonths, 12);
    assert.equal(out.durationDays, null);
  });

  it("creates a one-time payment session; browser price fields are ignored", async () => {
    const capture = {};
    const result = await createMarketplaceMembershipCheckoutSession(
      { freelancerUserId: 42, planCode: "annual_basic", priceJod: 1, amountMinor: 1, durationMonths: 99 },
      {
        stripe: mockStripe(capture),
        db: mockDb(),
        getPlanByTierCode: async () => annualPlan(),
        resolveReferralDiscount: async () => ({ discountMinor: 0, chargeMinor: 50000 }),
      },
    );
    assert.equal(capture.params.mode, "payment");
    assert.equal(capture.params.line_items[0].price_data.unit_amount, 50000);
    assert.equal(capture.params.line_items[0].price_data.currency, "jod");
    assert.match(capture.params.line_items[0].price_data.product_data.description, /12 months/);
    assert.equal(capture.params.metadata.planCode, "annual_basic");
    assert.equal(capture.params.metadata.durationMonths, "12");
    assert.equal(capture.params.metadata.durationDays, undefined);
    assert.equal(capture.params.metadata.expectedAmountMinor, "50000");
    assert.equal(capture.params.metadata.termStartPolicy, "first_real_order");
    assert.equal(result.membershipGranted, false);
    assert.equal(result.termStarted, false);
    assert.equal(result.amountJod, 50);
  });
});

describe("Annual Basic — webhook grant (trusted payment only)", () => {
  const deps = (calls) => ({
    getPlanById: async () => annualPlan(),
    getPlanByTierCode: async () => annualPlan(),
    createPurchasedPendingStartMembership: async (input) => {
      calls.push(input);
      return {
        membership: { id: "m1", status: "purchased_pending_start", paidTermStartsAt: null },
        created: calls.length === 1,
        idempotentReplay: calls.length > 1,
      };
    },
  });

  it("paid session → purchased_pending_start (term not started)", async () => {
    const calls = [];
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(paidSession(), {}, null, deps(calls));
    assert.equal(out.status, "applied");
    assert.equal(out.termStarted, false);
    assert.equal(calls[0].marketplacePlanId, 21);
    assert.equal(calls[0].purchasePaymentReference, "cs_test_annual_paid");
  });

  it("webhook replay is idempotent", async () => {
    const calls = [];
    await applyMarketplaceMembershipCheckoutSessionCompleted(paidSession(), {}, null, deps(calls));
    const again = await applyMarketplaceMembershipCheckoutSessionCompleted(paidSession(), {}, null, deps(calls));
    assert.equal(again.status, "already_applied");
  });

  it("rejects unpaid, wrong amount, tampered duration", async () => {
    const calls = [];
    const unpaid = await applyMarketplaceMembershipCheckoutSessionCompleted(
      paidSession({ payment_status: "unpaid" }),
      {},
      null,
      deps(calls),
    );
    assert.equal(unpaid.status, "ignored");
    const cheap = await applyMarketplaceMembershipCheckoutSessionCompleted(
      paidSession({ amount_total: 100 }),
      {},
      null,
      deps(calls),
    );
    assert.equal(cheap.reason, "marketplace_membership_amount_mismatch");
    const s = paidSession();
    s.metadata.durationMonths = "24";
    const tampered = await applyMarketplaceMembershipCheckoutSessionCompleted(s, {}, null, deps(calls));
    assert.equal(tampered.reason, "marketplace_membership_duration_mismatch");
    assert.equal(calls.length, 0);
  });

  it("referral processing stays generic for marketplace memberships", () => {
    const controller = read("src/controllers/stripeWebhookController.js");
    assert.match(
      controller,
      /purpose === "marketplace_membership_checkout"[\s\S]{0,400}processCheckoutSession\(session, PAYMENT_TYPES\.MARKETPLACE_MEMBERSHIP, result\)/,
    );
    assert.doesNotMatch(read("src/services/referralPaymentBridge.js"), /annual_basic/);
  });
});

/**
 * Fake DB for resolveFreelancerOrderValueRange: plans rows, marketplace tier bands,
 * and the annual-only membership lookup (catalog_category = 'annual').
 */
function rangeClient({ planRow = null, annualMembership = null } = {}) {
  const tiers = {
    silver: { id: 8, tier_code: "silver", project_min_value_jod: "1", max_real_order_value_jod: "20", unlimited_real_order_value: false, is_active: true },
    pro: { id: 3, tier_code: "pro", project_min_value_jod: "1", max_real_order_value_jod: "50", unlimited_real_order_value: false, is_active: true },
    elite: { id: 4, tier_code: "elite", project_min_value_jod: "1", max_real_order_value_jod: null, unlimited_real_order_value: true, is_active: true },
  };
  return {
    async query(sql, params = []) {
      if (/FROM plans\s+WHERE id = \$1/.test(sql)) return { rows: planRow ? [planRow] : [] };
      if (/catalog_category = 'annual'/.test(sql)) return { rows: annualMembership ? [annualMembership] : [] };
      if (/FROM marketplace_membership_plans\s+WHERE lower\(tier_code\) = \$1/.test(sql)) {
        return { rows: tiers[params[0]] ? [tiers[params[0]]] : [] };
      }
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
    },
  };
}

describe("Order-value band — existing tiers unchanged, Annual uses its own band", () => {
  const { resolveFreelancerOrderValueRange } = require("../src/services/planOrderValueEligibility");
  const bridge = (tier) => ({ id: 900, name: `marketplace_membership_${tier}`, order_value_min_jod: null, order_value_max_jod: null, subscription_plan_id: null });
  const expectedTier = { silver: [1, 20], pro: [1, 50], elite: [1, null] };

  for (const tier of ["silver", "pro", "elite"]) {
    it(`admin-assigned ${tier.toUpperCase()} (bridge) → its marketplace band`, async () => {
      const out = await resolveFreelancerOrderValueRange(42, { planId: 900 }, rangeClient({ planRow: bridge(tier) }));
      assert.deepEqual([out.minOrderValue, out.maxOrderValue], expectedTier[tier]);
    });

    it(`Stripe-purchased ${tier.toUpperCase()} on the free plan → unchanged legacy band (3–7, as on main)`, async () => {
      // Annual-only lookup returns nothing for regular marketplace tiers.
      const out = await resolveFreelancerOrderValueRange(42, { planId: 1 }, rangeClient());
      assert.deepEqual([out.minOrderValue, out.maxOrderValue], [3, 7]);
      assert.equal(out.resolvedFromMarketplaceTier, undefined);
    });
  }

  it("Annual SILVER on the free plan → its own SILVER band (1–20)", async () => {
    const out = await resolveFreelancerOrderValueRange(
      42,
      { planId: 1 },
      rangeClient({
        annualMembership: { id: 21, tier_code: "annual_basic", project_min_value_jod: "1", max_real_order_value_jod: "20", unlimited_real_order_value: false },
      }),
    );
    assert.deepEqual([out.minOrderValue, out.maxOrderValue], [1, 20]);
    assert.equal(out.resolvedFromMarketplaceTier, "annual_basic");
  });

  it("annual band lookup is limited to catalog_category = 'annual'", () => {
    const src = read("src/services/planOrderValueEligibility.js");
    assert.match(src, /AND p\.catalog_category = 'annual'/);
    assert.doesNotMatch(src, /resolveCurrentPaidMembershipOrderValueRange/);
  });
});

describe("Annual limits enforced even while the global Bid Credits engine is OFF", () => {
  const {
    freelancerHasAnnualBidEnforcement,
    planHasAnnualBidEnforcement,
  } = require("../src/utils/annualPlanBidEnforcement");

  it("true only for a current Annual Plans membership", async () => {
    let seen = null;
    const yes = { query: async (sql, params) => ((seen = { sql, params }), { rows: [{ "?column?": 1 }] }) };
    const no = { query: async () => ({ rows: [] }) };
    assert.equal(await freelancerHasAnnualBidEnforcement(yes, 42), true);
    assert.match(seen.sql, /p\.catalog_category = 'annual'/);
    assert.match(seen.sql, /m\.is_current = TRUE/);
    assert.deepEqual(seen.params[1], ["purchased_pending_start", "active", "cancel_at_period_end"]);
    assert.equal(await freelancerHasAnnualBidEnforcement(no, 42), false);
    assert.equal(await planHasAnnualBidEnforcement(yes, 21), true);
    assert.equal(await planHasAnnualBidEnforcement(no, 8), false);
  });

  it("fails safe (no enforcement change) when migration 206 is not applied", async () => {
    const missing = { query: async () => { const e = new Error("column does not exist"); e.code = "42703"; throw e; } };
    assert.equal(await freelancerHasAnnualBidEnforcement(missing, 42), false);
    assert.equal(await planHasAnnualBidEnforcement(missing, 21), false);
  });

  it("charge, quote, distribution and summary OR the global switch with the Annual scope", () => {
    const charge = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.match(charge, /!isBidCreditsEngineActive\(settings\) &&\s+!\(await freelancerHasAnnualBidEnforcement\(client, freelancerUserId\)\)/);
    assert.match(charge, /isBidCreditsEngineActive\(settings\) \|\|\s+\(freelancerUserId != null && \(await freelancerHasAnnualBidEnforcement\(null, freelancerUserId\)\)\)/);
    const dist = read("src/services/marketplaceBidCreditDistributionService.js");
    assert.match(dist, /isBidCreditsEngineActive\(settings\) \|\|\s+\(await planHasAnnualBidEnforcement\(client, row\.marketplace_plan_id\)\)/);
    const summary = read("src/services/marketplaceBidCreditsService.js");
    assert.match(summary, /isBidCreditsEngineActive\(settings\) \|\| \(await freelancerHasAnnualBidEnforcement\(client, fid\)\)/);
  });
});

describe("Priced bid INSERT — single parameter type for moderation_status", () => {
  it("casts $5 so Postgres does not deduce varchar and text for one parameter", () => {
    const src = read("src/services/ordersService.js");
    assert.match(src, /\$4, \$5::varchar, \$6, \$7, CASE WHEN \$5::varchar = 'held'/);
    assert.doesNotMatch(src, /CASE WHEN \$5 = 'held'/);
  });
});

describe("Annual Basic — canonical resolver / display / courses", () => {
  it("bridge plan name resolves to ANNUAL_BASIC; special offers do not", () => {
    assert.equal(tierFromSubscriptionPlan({ name: "marketplace_membership_annual_basic" }), "ANNUAL_BASIC");
    assert.equal(tierFromSubscriptionPlan({ name: "marketplace_membership_silver" }), "SILVER");
    assert.equal(tierFromSubscriptionPlan({ name: "marketplace_membership_special_offer" }), null);
  });

  it("plan-restriction canonical SQL no longer hard-codes four tiers", () => {
    const src = read("src/services/marketplacePlanRestrictionsService.js");
    assert.doesNotMatch(src, /\(starter\|silver\|pro\|elite\)/);
    assert.doesNotMatch(src, /IN \('STARTER','SILVER','PRO','ELITE'\)/);
  });

  it("course gating treats Annual SILVER as SILVER (no auto-enrolment)", () => {
    assert.equal(normalizeMembershipTierForCourses("annual_basic"), "silver");
  });
});
