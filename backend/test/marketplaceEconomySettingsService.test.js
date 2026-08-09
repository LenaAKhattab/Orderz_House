/**
 * Marketplace Economy Settings Phase 2 — service validation & isolation (no DB required for pure helpers).
 * Run: node --test test/marketplaceEconomySettingsService.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_economy_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  MARKETPLACE_ECONOMY_DEFAULTS,
  MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS,
  mapRow,
  mergePatch,
  assertMarketplaceEconomyRealOrdersOnly,
  isWorkTokensEngineActive,
  isEliteEngineActive,
  isMarketplaceCommissionActive,
  isCashMembershipPaymentsActive,
  isVerificationBonusesEngineActive,
} = require("../src/services/marketplaceEconomySettingsService");

describe("marketplace economy defaults", () => {
  it("matches Phase 2 business policy with ALL engines OFF", () => {
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.workTokenValueJod, 0.1);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.bidTokensPerOrderJod, 1);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.applicationTokenRefundPercentage, 70);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.platformCommissionPercentage, 30);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.cashProcessingFeeJod, 5);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.identityVerificationBonusEnabled, true);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.identityVerificationBonusTokens, 10);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.payoutMethodVerificationBonusEnabled, true);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.payoutMethodVerificationBonusTokens, 10);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.eliteDirectOrdersPerCycle, 1);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.eliteOfferDurationMinutes, 10);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.eliteCarryForwardEnabled, true);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.eliteCarryForwardDays, 7);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.eliteMaximumCarryForward, 1);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.eliteDeclinesAffectCarryForward, false);

    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.workTokensEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.marketplaceCommissionEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.cashMembershipPaymentsEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.eliteEngineEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.verificationBonusesEnabled, false);
  });

  it("documents snapshot fields for future financial records", () => {
    assert.ok(MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS.includes("platformCommissionPercentage"));
    assert.ok(MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS.includes("applicationTokenRefundPercentage"));
    assert.ok(MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS.includes("workTokenValueJod"));
    assert.ok(MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS.includes("cashProcessingFeeJod"));
  });
});

describe("typed normalization", () => {
  it("mapRow coerces numeric strings and flags", () => {
    const mapped = mapRow({
      work_token_value_jod: "0.100",
      bid_tokens_per_order_jod: "1.000",
      application_token_refund_percentage: "70.00",
      platform_commission_percentage: "30.00",
      cash_processing_fee_jod: "5.000",
      identity_verification_bonus_enabled: true,
      identity_verification_bonus_tokens: 10,
      payout_method_verification_bonus_enabled: true,
      payout_method_verification_bonus_tokens: 10,
      elite_direct_orders_per_cycle: 1,
      elite_offer_duration_minutes: 10,
      elite_carry_forward_enabled: true,
      elite_carry_forward_days: 7,
      elite_maximum_carry_forward: 1,
      elite_declines_affect_carry_forward: false,
      work_tokens_enabled: false,
      marketplace_commission_enabled: false,
      cash_membership_payments_enabled: false,
      elite_engine_enabled: false,
      verification_bonuses_enabled: false,
      updated_by_user_id: null,
      updated_at: null,
    });
    assert.strictEqual(mapped.workTokenValueJod, 0.1);
    assert.strictEqual(mapped.workTokensEnabled, false);
    assert.strictEqual(mapped.eliteEngineEnabled, false);
  });
});

describe("mergePatch validation", () => {
  const base = { ...MARKETPLACE_ECONOMY_DEFAULTS };

  it("accepts valid atomic multi-field patch", () => {
    const next = mergePatch(base, {
      platformCommissionPercentage: 25,
      applicationTokenRefundPercentage: 80,
      workTokenValueJod: 0.15,
    });
    assert.strictEqual(next.platformCommissionPercentage, 25);
    assert.strictEqual(next.applicationTokenRefundPercentage, 80);
    assert.strictEqual(next.workTokenValueJod, 0.15);
    assert.strictEqual(next.workTokensEnabled, false);
  });

  it("rejects invalid percentages", () => {
    assert.throws(
      () => mergePatch(base, { platformCommissionPercentage: 101 }),
      (err) => err.publicCode === "INVALID_PERCENTAGE",
    );
    assert.throws(
      () => mergePatch(base, { applicationTokenRefundPercentage: -1 }),
      (err) => err.publicCode === "INVALID_PERCENTAGE",
    );
  });

  it("rejects invalid money", () => {
    assert.throws(
      () => mergePatch(base, { workTokenValueJod: 0 }),
      (err) => err.publicCode === "INVALID_MONEY",
    );
    assert.throws(
      () => mergePatch(base, { workTokenValueJod: NaN }),
      (err) => err.publicCode === "INVALID_MONEY",
    );
    assert.throws(
      () => mergePatch(base, { cashProcessingFeeJod: -1 }),
      (err) => err.publicCode === "INVALID_MONEY",
    );
  });

  it("rejects invalid bonus tokens and Elite durations", () => {
    assert.throws(
      () => mergePatch(base, { identityVerificationBonusTokens: -1 }),
      (err) => err.publicCode === "INVALID_INTEGER",
    );
    assert.throws(
      () => mergePatch(base, { eliteOfferDurationMinutes: 0 }),
      (err) => err.publicCode === "INVALID_INTEGER",
    );
  });

  it("allows feature flag updates without enabling by default", () => {
    const next = mergePatch(base, { workTokensEnabled: true });
    assert.strictEqual(next.workTokensEnabled, true);
    assert.strictEqual(next.eliteEngineEnabled, false);
  });
});

describe("real-orders-only gate", () => {
  it("blocks fake/training contexts", () => {
    assert.throws(
      () => assertMarketplaceEconomyRealOrdersOnly({ orderSource: "fake" }),
      (err) => err.publicCode === "MARKETPLACE_ECONOMY_REAL_ORDERS_ONLY",
    );
    assert.throws(
      () => assertMarketplaceEconomyRealOrdersOnly({ isTraining: true }),
      (err) => err.publicCode === "MARKETPLACE_ECONOMY_REAL_ORDERS_ONLY",
    );
  });

  it("allows real context", () => {
    assert.doesNotThrow(() =>
      assertMarketplaceEconomyRealOrdersOnly({ orderSource: "customer" }),
    );
  });
});

describe("engine helpers", () => {
  it("report disabled for defaults", () => {
    const d = MARKETPLACE_ECONOMY_DEFAULTS;
    assert.strictEqual(isWorkTokensEngineActive(d), false);
    assert.strictEqual(isEliteEngineActive(d), false);
    assert.strictEqual(isMarketplaceCommissionActive(d), false);
    assert.strictEqual(isCashMembershipPaymentsActive(d), false);
    assert.strictEqual(isVerificationBonusesEngineActive(d), false);
  });
});

describe("isolation from legacy / fake / activation fee", () => {
  it("service does not import fake/training or legacy plan domains", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceEconomySettingsService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /fakeOrdersService|fake_order_settings|fake_order_round/);
    assert.doesNotMatch(src, /planOrderValueEligibility|training\.order\.visible/);
    assert.doesNotMatch(src, /plansService|FROM\s+plans\b|freelancer_subscriptions/);
    assert.doesNotMatch(src, /subscription_activation_fee/);
    assert.doesNotMatch(src, /system_settings|getSetting|setSetting/);
    assert.doesNotMatch(src, /stripe/i);
  });

  it("activation fee service remains separate from cash processing fee", () => {
    const feeSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/subscriptionActivationFeeService.js"),
      "utf8",
    );
    assert.doesNotMatch(feeSrc, /marketplace_economy|cash_processing_fee_jod|work_token/);
    assert.match(feeSrc, /subscription_activation_fee/);
  });

  it("routes are Super Admin only under marketplace-economy-settings", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/routes/superAdminMarketplaceEconomySettingsRoutes.js"),
      "utf8",
    );
    assert.match(routes, /marketplace-economy-settings/);
    assert.match(routes, /requireSuperAdmin/);
    assert.doesNotMatch(routes, /fake|training|plansService/);
  });

  it("app mounts economy routes without public settings endpoint", () => {
    const app = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
    assert.match(app, /superAdminMarketplaceEconomySettingsRoutes/);
    assert.doesNotMatch(app, /\/api\/marketplace-economy-settings/);
  });

  it("public /plans remains legacy (no marketplace economy cutover)", () => {
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
    const cache = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/services/freelancerSessionCache.js"),
      "utf8",
    );
    assert.doesNotMatch(plansPage, /marketplace-economy|MarketplaceEconomy|getMarketplaceEconomy/);
    assert.doesNotMatch(usePlans, /marketplace-economy|getMarketplaceEconomy|listPublicMarketplace/);
    assert.doesNotMatch(checkout, /marketplace-economy|getMarketplaceEconomy|listPublicMarketplace/);
    assert.match(checkout, /fetchPublicPlansCached|getCachedPublicPlans/);
    assert.match(cache, /listPublicPlansRequest/);
    assert.doesNotMatch(cache, /marketplace-economy|getMarketplaceEconomySettings/);
  });
});
