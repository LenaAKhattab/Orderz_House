/**
 * Marketplace Membership Phase 1 — service validation & mapping (no DB required for pure helpers).
 * Run: node --test test/marketplaceMembershipPlansService.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_membership_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  assertRealOrderAccessConfig,
  assertCashMonthsConfig,
  assertTokensPerCycle,
  mapMarketplaceMembershipPlan,
  mapPublicMarketplaceMembershipPlan,
  resolveRealOrderAccessFromPlan,
} = require("../src/services/marketplaceMembershipPlansService");
const {
  resolveMarketplaceMembershipPayablePricing,
  assertValidMarketplaceSalePatch,
} = require("../src/utils/marketplaceMembershipSalePricing");
const {
  MARKETPLACE_MEMBERSHIP_TIER_CODES,
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
  isValidMarketplaceTierCode,
} = require("../src/constants/marketplaceMembershipPlans");

describe("marketplace membership tier codes", () => {
  it("lists E1 active codes plus retained legacy codes", () => {
    assert.deepStrictEqual([...MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES], [
      "starter",
      "silver",
      "pro",
      "elite",
    ]);
    assert.deepStrictEqual([...MARKETPLACE_MEMBERSHIP_TIER_CODES], [
      "starter",
      "silver",
      "pro",
      "elite",
      "free",
      "start",
      "active",
      "pay_as_you_work",
    ]);
  });

  it("validates snake_case tier codes", () => {
    assert.strictEqual(isValidMarketplaceTierCode("elite"), true);
    assert.strictEqual(isValidMarketplaceTierCode("pay_as_you_work"), true);
    assert.strictEqual(isValidMarketplaceTierCode("Elite"), false);
    assert.strictEqual(isValidMarketplaceTierCode("pay-as-you-work"), false);
    assert.strictEqual(isValidMarketplaceTierCode(""), false);
  });
});

describe("real-order access config", () => {
  it("requires positive max when not unlimited", () => {
    assert.throws(
      () => assertRealOrderAccessConfig({ unlimitedRealOrderValue: false, maxRealOrderValueJod: null }),
      (err) => err.publicCode === "INVALID_MAX_REAL_ORDER_VALUE",
    );
    const ok = assertRealOrderAccessConfig({
      unlimitedRealOrderValue: false,
      maxRealOrderValueJod: 10,
    });
    assert.strictEqual(ok.maxRealOrderValueJod, 10);
    assert.strictEqual(ok.unlimitedRealOrderValue, false);
  });

  it("requires null max when unlimited", () => {
    assert.throws(
      () => assertRealOrderAccessConfig({ unlimitedRealOrderValue: true, maxRealOrderValueJod: 100 }),
      (err) => err.publicCode === "UNLIMITED_REQUIRES_NULL_MAX",
    );
    const ok = assertRealOrderAccessConfig({
      unlimitedRealOrderValue: true,
      maxRealOrderValueJod: null,
    });
    assert.strictEqual(ok.unlimitedRealOrderValue, true);
    assert.strictEqual(ok.maxRealOrderValueJod, null);
  });
});

describe("cash / tokens validation", () => {
  it("enforces cash month ordering", () => {
    assert.throws(
      () =>
        assertCashMonthsConfig({
          cashAllowed: true,
          minimumCashMonths: 6,
          maximumPrepaidMonths: 3,
        }),
      (err) => err.publicCode === "INVALID_CASH_MONTHS_ORDER",
    );
  });

  it("rejects negative token counts", () => {
    assert.throws(() => assertTokensPerCycle(-1), (err) => err.publicCode === "INVALID_INCLUDED_TOKENS");
    assert.strictEqual(assertTokensPerCycle(0), 0);
  });
});

describe("sale pricing for marketplace plans", () => {
  it("applies percentage off monthly_price_jod", () => {
    const pricing = resolveMarketplaceMembershipPayablePricing({
      monthly_price_jod: 10,
      sale_enabled: true,
      sale_percentage: 20,
      sale_reason: "عرض",
      stripe_price_currency: "JOD",
    });
    assert.strictEqual(pricing.active, true);
    assert.strictEqual(pricing.originalPriceJod, 10);
    assert.strictEqual(pricing.effectivePriceJod, 8);
  });

  it("rejects invalid sale patch", () => {
    assert.throws(
      () =>
        assertValidMarketplaceSalePatch(
          { saleEnabled: true, salePercentage: 20, saleReason: "x" },
          { monthlyPriceJod: 0 },
        ),
      (err) => err.publicCode === "SALE_NOT_ALLOWED_ON_FREE_PLAN",
    );
  });
});

describe("mapping", () => {
  const eliteRow = {
    id: 4,
    tier_code: "elite",
    name_ar: "Elite",
    name_en: "Elite",
    slug: "elite",
    description_ar: "x",
    description_en: "x",
    is_active: true,
    sort_order: 40,
    monthly_price_jod: "49.990",
    stripe_product_id: null,
    stripe_price_id: null,
    stripe_price_amount_minor: null,
    stripe_price_currency: "JOD",
    max_real_order_value_jod: null,
    unlimited_real_order_value: true,
    included_tokens_per_cycle: 0,
    cash_allowed: false,
    minimum_cash_months: 1,
    maximum_prepaid_months: 1,
    elite_direct_orders_enabled: true,
    sale_enabled: false,
    sale_percentage: null,
    sale_reason: null,
    sale_reason_en: null,
    created_at: null,
    updated_at: null,
  };

  it("maps admin and public shapes with access/capabilities nesting", () => {
    const admin = mapMarketplaceMembershipPlan(eliteRow);
    assert.strictEqual(admin.tierCode, "elite");
    assert.strictEqual(admin.unlimitedRealOrderValue, true);
    assert.strictEqual(admin.eliteDirectOrdersEnabled, true);

    const pub = mapPublicMarketplaceMembershipPlan(eliteRow);
    assert.strictEqual(pub.access.unlimited, true);
    assert.strictEqual(pub.access.maxRealOrderValueJod, null);
    assert.strictEqual(pub.capabilities.eliteDirectOrders, true);
    assert.strictEqual(pub.cash.allowed, false);
  });

  it("resolveRealOrderAccessFromPlan returns unlimited for elite", () => {
    const access = resolveRealOrderAccessFromPlan(mapMarketplaceMembershipPlan(eliteRow));
    assert.deepStrictEqual(access, { unlimited: true, maxRealOrderValueJod: null });
  });
});

describe("isolation from legacy / fake systems", () => {
  it("service source does not import plansService or fakeOrders", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceMembershipPlansService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /require\([\"'].*plansService/);
    assert.doesNotMatch(src, /planOrderValueEligibility/);
    assert.doesNotMatch(src, /fakeOrdersService|fake_order_settings_plans/);
    assert.doesNotMatch(src, /FROM\s+plans\b/);
    assert.doesNotMatch(src, /FROM\s+freelancer_subscriptions\b/);
    assert.doesNotMatch(src, /JOIN\s+freelancer_subscriptions\b/);
  });

  it("routes do not mount under legacy /admin/plans", () => {
    const publicRoutes = fs.readFileSync(
      path.join(__dirname, "../src/routes/marketplaceMembershipPlansRoutes.js"),
      "utf8",
    );
    const adminRoutes = fs.readFileSync(
      path.join(__dirname, "../src/routes/superAdminMarketplaceMembershipPlansRoutes.js"),
      "utf8",
    );
    assert.match(publicRoutes, /\/marketplace-membership-plans/);
    assert.match(adminRoutes, /\/marketplace-membership-plans/);
    assert.doesNotMatch(publicRoutes, /plan-pages/);
  });

  it("public /plans uses Marketplace Membership; slug path stays legacy-isolated", () => {
    const plansPage = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/pages/Plans.jsx"),
      "utf8",
    );
    const usePlans = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/hooks/usePlansPage.js"),
      "utf8",
    );
    const checkout = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/hooks/useFreelancerPlansCheckout.js"),
      "utf8",
    );
    assert.match(usePlans, /listPublicMarketplaceMembershipPlansRequest/);
    assert.match(usePlans, /fetchPublicPlans:\s*Boolean\(slug\)/);
    assert.match(usePlans, /getPublicPlanPageBySlugRequest/);
    assert.match(usePlans, /marketplace_membership/);
    assert.match(usePlans, /legacy_page_package/);
    assert.doesNotMatch(checkout, /listPublicMarketplaceMembership/);
    assert.doesNotMatch(plansPage, /listPublicPlansRequest/);
  });
});
