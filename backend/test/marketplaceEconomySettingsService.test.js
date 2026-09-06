/**
 * Marketplace Economy Settings — service validation after Priority Bid / Fairness update.
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
  MARKETPLACE_ECONOMY_ENGINE_DEPENDENCIES,
  mapRow,
  mergePatch,
  normalizeLegacyPatchKeys,
  assertMarketplaceEconomyRealOrdersOnly,
  getPriorityBidLoserReleasePercentage,
  isPriorityBiddingEngineActive,
  isFairWorkDistributionActive,
  isWorkTokensEngineActive,
} = require("../src/services/marketplaceEconomySettingsService");
const {
  PRIORITY_BID_USES_BY_TIER,
  DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,
  FREELANCER_FORBIDDEN_FAIRNESS_FIELDS,
  WORK_TOKEN_LEDGER_EVENT_TYPES,
  defaultPriorityBidUsesForTier,
} = require("../src/constants/marketplaceEconomy");

describe("marketplace economy defaults (manager-aligned)", () => {
  it("keeps engines OFF and Priority Bid default strategy HIGHEST_TOKEN_ONLY", () => {
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.workTokenValueJod, 0.1);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.normalApplicationTokensPerOrderJod, 1);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.normalApplicationTokenRefundPercentage, 100);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.priorityBiddingEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.fairWorkDistributionEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.workTokensEnabled, false);
    assert.strictEqual(
      MARKETPLACE_ECONOMY_DEFAULTS.priorityBidAssignmentStrategy,
      DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,
    );
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.priorityBidAllowIncrease, true);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.priorityBidAllowDecrease, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.priorityBidReturnUseOnOrderCancel, true);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.tokenWeight, 100);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULTS.fairnessWeight, 0);
  });

  it("documents wallet/cycle dependencies and snapshot fields", () => {
    assert.ok(MARKETPLACE_ECONOMY_ENGINE_DEPENDENCIES.priorityBid.some((d) => /wallet/i.test(d)));
    assert.ok(MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS.includes("priorityBidAssignmentStrategy"));
    assert.ok(MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS.includes("normalApplicationTokenRefundPercentage"));
    assert.ok(!MARKETPLACE_ECONOMY_SNAPSHOT_FIELDS.includes("bidTokensPerOrderJod"));
  });

  it("Priority Bid losers always release 100%", () => {
    assert.strictEqual(getPriorityBidLoserReleasePercentage(), 100);
  });

  it("per-tier Priority Bid uses match manager requirements", () => {
    assert.deepStrictEqual(PRIORITY_BID_USES_BY_TIER, {
      pay_as_you_work: 1,
      active: 2,
      pro: 3,
      elite: 4,
    });
    assert.strictEqual(defaultPriorityBidUsesForTier("pro"), 3);
  });

  it("defines reservation ledger event vocabulary", () => {
    assert.ok(WORK_TOKEN_LEDGER_EVENT_TYPES.includes("PRIORITY_BID_RESERVE"));
    assert.ok(WORK_TOKEN_LEDGER_EVENT_TYPES.includes("PRIORITY_BID_RELEASE"));
    assert.ok(WORK_TOKEN_LEDGER_EVENT_TYPES.includes("PRIORITY_BID_CONSUME"));
  });

  it("lists Freelancer-forbidden fairness fields", () => {
    assert.ok(FREELANCER_FORBIDDEN_FAIRNESS_FIELDS.includes("fairnessScore"));
    assert.ok(FREELANCER_FORBIDDEN_FAIRNESS_FIELDS.includes("eligibleAttemptsWithoutAward"));
  });
});

describe("normal application vs Priority Bid separation", () => {
  it("maps renamed normal-application columns", () => {
    const mapped = mapRow({
      work_token_value_jod: "0.100",
      normal_application_tokens_per_order_jod: "1.000",
      normal_application_token_refund_percentage: "100.00",
      platform_commission_percentage: "30",
      cash_processing_fee_jod: "5",
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
      priority_bidding_enabled: false,
      priority_bid_duration_minutes: 30,
      priority_bid_minimum_tokens: 1,
      priority_bid_maximum_tokens: null,
      priority_bid_show_highest: true,
      priority_bid_show_position: false,
      priority_bid_allow_increase: true,
      priority_bid_allow_decrease: false,
      priority_bid_allow_withdrawal: false,
      priority_bid_withdrawal_releases_tokens: true,
      priority_bid_withdrawal_returns_use: false,
      priority_bid_return_use_on_order_cancel: true,
      priority_bid_auto_assignment_enabled: true,
      priority_bid_assignment_strategy: "HIGHEST_TOKEN_ONLY",
      fair_work_distribution_enabled: false,
      assignment_strategy: "HIGHEST_TOKEN_ONLY",
      fairness_weight: 0,
      token_weight: 100,
      performance_weight: 0,
      recency_weight: 0,
      workload_weight: 0,
      eligible_loss_priority_effect: "INCREASE_PRIORITY",
      award_reset_policy: "RESET_TO_ZERO",
      decline_priority_effect: "NO_BOOST",
      freelancer_cancel_priority_effect: "NO_BOOST",
      work_tokens_enabled: false,
      marketplace_commission_enabled: false,
      cash_membership_payments_enabled: false,
      elite_engine_enabled: false,
      verification_bonuses_enabled: false,
    });
    assert.strictEqual(mapped.normalApplicationTokensPerOrderJod, 1);
    assert.strictEqual(mapped.priorityBidAssignmentStrategy, "HIGHEST_TOKEN_ONLY");
    assert.strictEqual(mapped.bidTokensPerOrderJod, undefined);
  });

  it("normalizes legacy patch keys to normal application fields", () => {
    const normalized = normalizeLegacyPatchKeys({
      bidTokensPerOrderJod: 2,
      applicationTokenRefundPercentage: 50,
      priorityBiddingEnabled: true,
    });
    assert.strictEqual(normalized.normalApplicationTokensPerOrderJod, 2);
    assert.strictEqual(normalized.normalApplicationTokenRefundPercentage, 50);
    assert.strictEqual(normalized.bidTokensPerOrderJod, undefined);
    assert.strictEqual(normalized.priorityBiddingEnabled, true);
  });

  it("accepts normalApplicationTokenRefundPercentage = 100", () => {
    const next = mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
      normalApplicationTokenRefundPercentage: 100,
    });
    assert.strictEqual(next.normalApplicationTokenRefundPercentage, 100);
  });

  it("rejects normalApplicationTokenRefundPercentage = 80 until non-100 policy exists", () => {
    assert.throws(
      () =>
        mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
          normalApplicationTokenRefundPercentage: 80,
        }),
      (err) => err.publicCode === "FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED",
    );
  });

  it("rejects normalApplicationTokenRefundPercentage = 70 until non-100 policy exists", () => {
    assert.throws(
      () =>
        mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
          normalApplicationTokenRefundPercentage: 70,
        }),
      (err) => err.publicCode === "FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED",
    );
  });

  it("rejects legacy applicationTokenRefundPercentage alias when not 100", () => {
    assert.throws(
      () =>
        mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
          applicationTokenRefundPercentage: 50,
        }),
      (err) => err.publicCode === "FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED",
    );
  });

  it("direct assertNormalApplicationTokenRefundPercentageCurrentPolicy rejects non-100", () => {
    const {
      assertNormalApplicationTokenRefundPercentageCurrentPolicy,
      CURRENT_NORMAL_APPLICATION_REFUND_PERCENTAGE_ONLY,
    } = require("../src/services/marketplaceEconomySettingsService");
    assert.strictEqual(CURRENT_NORMAL_APPLICATION_REFUND_PERCENTAGE_ONLY, 100);
    assert.strictEqual(assertNormalApplicationTokenRefundPercentageCurrentPolicy(100), 100);
    assert.throws(
      () => assertNormalApplicationTokenRefundPercentageCurrentPolicy(80),
      (err) => err.publicCode === "FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED",
    );
  });

  it("accepts Priority Bid strategy updates without enabling engines by default", () => {
    const next = mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
      priorityBidAssignmentStrategy: "FAIR_DISTRIBUTION_FIRST",
      fairnessWeight: 40,
      tokenWeight: 60,
    });
    assert.strictEqual(next.priorityBidAssignmentStrategy, "FAIR_DISTRIBUTION_FIRST");
    assert.strictEqual(next.priorityBiddingEnabled, false);
    assert.strictEqual(next.fairWorkDistributionEnabled, false);
  });

  it("rejects HYBRID assignment strategy until weight policy is defined (Phase 7)", () => {
    assert.throws(
      () =>
        mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
          assignmentStrategy: "HYBRID",
        }),
      (err) => err.publicCode === "FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED",
    );
    assert.throws(
      () =>
        mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
          priorityBidAssignmentStrategy: "HYBRID",
        }),
      (err) => err.publicCode === "FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED",
    );
  });

  it("rejects invalid Priority Bid max < min", () => {
    assert.throws(
      () =>
        mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
          priorityBidMinimumTokens: 100,
          priorityBidMaximumTokens: 50,
        }),
      (err) => err.publicCode === "INVALID_PRIORITY_BID_BOUNDS",
    );
  });
});

describe("real economic order gate", () => {
  it("blocks fake/training", () => {
    assert.throws(
      () => assertMarketplaceEconomyRealOrdersOnly({ kind: "fake" }),
      (err) => err.publicCode === "MARKETPLACE_ECONOMY_REAL_ORDERS_ONLY",
    );
  });

  it("allows non-fake real sources (customer is not the only valid source)", () => {
    assert.doesNotThrow(() =>
      assertMarketplaceEconomyRealOrdersOnly({ orderSource: "admin_created" }),
    );
    assert.doesNotThrow(() =>
      assertMarketplaceEconomyRealOrdersOnly({ orderSource: "faz3at" }),
    );
  });
});

describe("engine helpers", () => {
  it("Priority Bid engine requires both priority + wallet flags", () => {
    assert.strictEqual(isPriorityBiddingEngineActive(MARKETPLACE_ECONOMY_DEFAULTS), false);
    assert.strictEqual(
      isPriorityBiddingEngineActive({
        ...MARKETPLACE_ECONOMY_DEFAULTS,
        priorityBiddingEnabled: true,
        workTokensEnabled: false,
      }),
      false,
    );
    assert.strictEqual(
      isPriorityBiddingEngineActive({
        ...MARKETPLACE_ECONOMY_DEFAULTS,
        priorityBiddingEnabled: true,
        workTokensEnabled: true,
      }),
      true,
    );
    assert.strictEqual(isFairWorkDistributionActive(MARKETPLACE_ECONOMY_DEFAULTS), false);
    assert.strictEqual(isWorkTokensEngineActive(MARKETPLACE_ECONOMY_DEFAULTS), false);
  });
});

describe("isolation", () => {
  it("service does not import fake/training or implement users.tokens wallet shortcut", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceEconomySettingsService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /fakeOrdersService|fake_order_settings/);
    assert.doesNotMatch(src, /planOrderValueEligibility|require\([\"'].*stripe/i);
    assert.doesNotMatch(src, /UPDATE\s+users\b|FROM\s+users\b/i);
    assert.match(src, /normalApplicationTokensPerOrderJod/);
    assert.match(src, /priorityBiddingEnabled|priority_bid_assignment_strategy/);
    assert.match(src, /users\.tokens/); // documents forbidden shortcut only
  });

  it("134 migration file remains free of economy settings and priority bid columns", () => {
    const sql134 = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/134_marketplace_membership_plans.sql"),
      "utf8",
    );
    assert.doesNotMatch(sql134, /marketplace_economy_settings/);
    assert.doesNotMatch(sql134, /priority_bid_uses_per_cycle/);
  });
});
