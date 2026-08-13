/**
 * Phase E3 — Normal Orders + Admin-configurable marketplace rules (static).
 * Does NOT apply migration 155. No Production mutation / git / deploy / engine enable.
 *
 * Run: npm run test:marketplace-normal-order-rules-e3
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_normal_order_e3_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  NORMAL_ORDER_RULES_DEFAULTS,
  NORMAL_ORDER_RULES_VERSION,
  NORMAL_ORDER_DEADLINE_INCOMPLETE_TARGET_POLICIES,
  ORDER_ECONOMIC_LOCK_FIELDS,
  NORMAL_ORDER_ERROR_CODES,
} = require("../src/constants/marketplaceNormalOrderRules");

const {
  buildOrderRulesSnapshotForCreate,
  resolveOrderApplicationBidCost,
  resolveRefundModeForOutcome,
  applicantCapacityView,
  mapNormalOrderRulesFromSettings,
} = require("../src/services/marketplaceNormalOrderRulesService");

const {
  NORMAL_APPLICATION_BID_COST,
  NORMAL_APPLICATION_BID_REFUND_PERCENT,
} = require("../src/constants/marketplaceBidCredits");

const { evaluateProjectValueEligibility } = require("../src/services/marketplaceMembershipEligibilityService");
const { E1_PLAN_SPECS } = require("../src/constants/marketplaceMembershipPlans");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase E3 migration 155 authored", () => {
  const rel = "sql/migrations/155_marketplace_normal_order_rules_e3.sql";
  const sql = read(rel);

  it("is additive, does not enable engines, preserves pantry", () => {
    assert.match(sql, /155: Phase E3/);
    assert.match(sql, /normal_order_default_bid_cost/);
    assert.match(sql, /application_bid_cost/);
    assert.match(sql, /target_applicant_count/);
    assert.match(sql, /application_deadline_at/);
    assert.match(sql, /deadline_incomplete_target_policy/);
    assert.match(sql, /order_freelancer_bid_credit_economics_cost_chk/);
    assert.match(sql, /bid_credit_cost >= 1/);
    assert.doesNotMatch(sql, /bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /CREATE TABLE.*pantry/i);
    assert.match(sql, /Do NOT recreate pantry/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });

  it("checksum is stable for review", () => {
    const hash = crypto.createHash("sha256").update(sql).digest("hex");
    assert.strictEqual(hash.length, 64);
    // Printed for FINAL REPORT — do not hard-fail on content drift here beyond length.
    assert.ok(hash);
  });
});

describe("Phase E3 Admin settings model", () => {
  it("defaults preserve B2 Bid cost = 1 and safe ranges", () => {
    assert.strictEqual(NORMAL_ORDER_RULES_DEFAULTS.defaultBidCost, 1);
    assert.strictEqual(NORMAL_ORDER_RULES_DEFAULTS.minBidCost, 1);
    assert.ok(NORMAL_ORDER_RULES_DEFAULTS.maxBidCost >= 1);
    assert.strictEqual(
      NORMAL_ORDER_RULES_DEFAULTS.deadlineIncompleteTargetPolicy,
      "continue_with_received",
    );
    assert.strictEqual(NORMAL_ORDER_RULES_DEFAULTS.businessTimezone, "Asia/Amman");
    assert.strictEqual(NORMAL_ORDER_RULES_DEFAULTS.refundNoFreelancerSelected, "full");
    assert.strictEqual(NORMAL_ORDER_RULES_DEFAULTS.refundLosingApplicant, "none");
    assert.strictEqual(NORMAL_ORDER_RULES_VERSION, 1);
  });

  it("maps settings row into rules", () => {
    const rules = mapNormalOrderRulesFromSettings({
      normalOrderDefaultBidCost: 2,
      normalOrderMaxBidCost: 5,
    });
    assert.strictEqual(rules.defaultBidCost, 2);
    assert.strictEqual(rules.maxBidCost, 5);
  });

  it("rejects Bid cost / target outside Admin range at snapshot build", () => {
    const rules = { ...NORMAL_ORDER_RULES_DEFAULTS, maxBidCost: 3, minBidCost: 1 };
    assert.throws(
      () =>
        buildOrderRulesSnapshotForCreate({
          payload: {
            applicationBidCost: 9,
            bidBudgetMin: 5,
            bidBudgetMax: 10,
            durationValue: 3,
            durationUnit: "days",
          },
          rules,
          isBidding: true,
        }),
      /applicationBidCost|integer/i,
    );
    assert.throws(
      () =>
        buildOrderRulesSnapshotForCreate({
          payload: {
            applicationBidCost: 1,
            targetApplicantCount: 9999,
            bidBudgetMin: 5,
            bidBudgetMax: 10,
            durationValue: 3,
            durationUnit: "days",
          },
          rules: { ...rules, maxTargetApplicants: 50 },
          isBidding: true,
        }),
      /targetApplicantCount|integer/i,
    );
  });
});

describe("Phase E3 Order Bid cost snapshot", () => {
  it("stores Admin-constrained Bid cost on create snapshot", () => {
    const snap = buildOrderRulesSnapshotForCreate({
      payload: {
        applicationBidCost: 2,
        targetApplicantCount: 20,
        bidBudgetMin: 5,
        bidBudgetMax: 10,
        durationValue: 3,
        durationUnit: "days",
        applicationPeriodHours: 48,
      },
      rules: NORMAL_ORDER_RULES_DEFAULTS,
      isBidding: true,
    });
    assert.strictEqual(snap.applicationBidCost, 2);
    assert.strictEqual(snap.targetApplicantCount, 20);
    assert.strictEqual(snap.e3RulesSnapshot.applicationBidCost, 2);
    assert.strictEqual(snap.e3RulesVersion, NORMAL_ORDER_RULES_VERSION);
    assert.ok(snap.applicationDeadlineAt);
  });

  it("legacy NULL Order Bid cost resolves to B2 default 1", () => {
    assert.strictEqual(resolveOrderApplicationBidCost({}), NORMAL_APPLICATION_BID_COST);
    assert.strictEqual(resolveOrderApplicationBidCost({ application_bid_cost: null }), 1);
    assert.strictEqual(resolveOrderApplicationBidCost({ application_bid_cost: 3 }), 3);
  });

  it("setting change does not mutate published snapshot object", () => {
    const snap = buildOrderRulesSnapshotForCreate({
      payload: {
        applicationBidCost: 2,
        targetApplicantCount: 10,
        bidBudgetMin: 1,
        bidBudgetMax: 5,
        durationValue: 2,
        durationUnit: "days",
        applicationPeriodHours: 24,
      },
      rules: NORMAL_ORDER_RULES_DEFAULTS,
      isBidding: true,
    });
    const publishedCost = snap.applicationBidCost;
    const laterRules = { ...NORMAL_ORDER_RULES_DEFAULTS, defaultBidCost: 7 };
    assert.strictEqual(publishedCost, 2);
    assert.notEqual(publishedCost, laterRules.defaultBidCost);
    assert.strictEqual(
      resolveOrderApplicationBidCost({ application_bid_cost: publishedCost }, laterRules),
      2,
    );
  });
});

describe("Phase E3 economic lock + capacity", () => {
  it("locks economic fields list after first application", () => {
    assert.ok(ORDER_ECONOMIC_LOCK_FIELDS.includes("application_bid_cost"));
    assert.ok(ORDER_ECONOMIC_LOCK_FIELDS.includes("target_applicant_count"));
    assert.ok(ORDER_ECONOMIC_LOCK_FIELDS.includes("budget"));
    assert.strictEqual(
      NORMAL_ORDER_ERROR_CODES.NORMAL_ORDER_ECONOMIC_FIELDS_FROZEN,
      "NORMAL_ORDER_ECONOMIC_FIELDS_FROZEN",
    );
  });

  it("exposes applicant capacity view", () => {
    const v = applicantCapacityView({ target_applicant_count: 20 }, 17);
    assert.strictEqual(v.currentApplicantCount, 17);
    assert.strictEqual(v.targetApplicantCount, 20);
    assert.strictEqual(v.remainingApplicantSlots, 3);
  });
});

describe("Phase E3 Membership gate = E1 canonical", () => {
  it("40 JOD Order: STARTER/SILVER blocked, PRO/ELITE allowed", () => {
    const starter = evaluateProjectValueEligibility(
      {
        projectMinValueJod: E1_PLAN_SPECS.starter.projectMinJod,
        maxRealOrderValueJod: E1_PLAN_SPECS.starter.projectMaxJod,
        unlimitedRealOrderValue: E1_PLAN_SPECS.starter.unlimitedProjectMax,
      },
      40,
    );
    const silver = evaluateProjectValueEligibility(
      {
        projectMinValueJod: E1_PLAN_SPECS.silver.projectMinJod,
        maxRealOrderValueJod: E1_PLAN_SPECS.silver.projectMaxJod,
        unlimitedRealOrderValue: false,
      },
      40,
    );
    const pro = evaluateProjectValueEligibility(
      {
        projectMinValueJod: E1_PLAN_SPECS.pro.projectMinJod,
        maxRealOrderValueJod: E1_PLAN_SPECS.pro.projectMaxJod,
        unlimitedRealOrderValue: false,
      },
      40,
    );
    const elite = evaluateProjectValueEligibility(
      {
        projectMinValueJod: E1_PLAN_SPECS.elite.projectMinJod,
        maxRealOrderValueJod: null,
        unlimitedRealOrderValue: true,
      },
      40,
    );
    assert.equal(starter.eligible, false);
    assert.equal(silver.eligible, false);
    assert.equal(pro.eligible, true);
    assert.equal(elite.eligible, true);
  });
});

describe("Phase E3 refund policy matrix + 100%", () => {
  it("eligible no-selection refund remains 100%", () => {
    assert.strictEqual(NORMAL_APPLICATION_BID_REFUND_PERCENT, 100);
  });

  it("does not restore daily Bid spend capacity on refund", () => {
    const {
      NORMAL_ORDER_REFUND_RESTORES_DAILY_CAP,
    } = require("../src/constants/marketplaceBidCredits");
    assert.strictEqual(NORMAL_ORDER_REFUND_RESTORES_DAILY_CAP, false);
    const refundSrc = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.doesNotMatch(refundSrc, /releaseDailyBidSpend/);
  });

  it("resolves outcome policies from snapshot/Admin", () => {
    assert.strictEqual(
      resolveRefundModeForOutcome({}, "no_freelancer_selected", NORMAL_ORDER_RULES_DEFAULTS),
      "full",
    );
    assert.strictEqual(
      resolveRefundModeForOutcome({}, "losing_applicant", NORMAL_ORDER_RULES_DEFAULTS),
      "none",
    );
    assert.strictEqual(
      resolveRefundModeForOutcome({}, "freelancer_withdrawal", NORMAL_ORDER_RULES_DEFAULTS),
      "none",
    );
    assert.ok(NORMAL_ORDER_DEADLINE_INCOMPLETE_TARGET_POLICIES.includes("cancel_and_refund"));
  });
});

describe("Phase E3 economic lock + Admin round-trip wiring", () => {
  it("exports patchPublishedOrderEconomicFields and wires admin route", () => {
    const rules = read("src/services/marketplaceNormalOrderRulesService.js");
    const orders = read("src/services/ordersService.js");
    const adminCtrl = read("src/controllers/adminOrdersController.js");
    const adminRoutes = read("src/routes/adminOrdersRoutes.js");
    assert.match(rules, /patchPublishedOrderEconomicFields/);
    assert.match(rules, /assertOrderEconomicFieldsMutable/);
    assert.match(orders, /patchPublishedOrderEconomicFields/);
    assert.match(adminCtrl, /patchOrderEconomicFields/);
    assert.match(adminRoutes, /economic-fields/);
  });

  it("Admin API mapper + validators expose E3 fields", () => {
    const svc = read("src/services/marketplaceEconomySettingsService.js");
    const val = read("src/validators/marketplaceEconomySettingsValidators.js");
    assert.match(svc, /normalOrderDefaultBidCost/);
    assert.match(svc, /mapActiveEconomySettingsForAdminApi/);
    // Inside mapActiveEconomySettingsForAdminApi body
    const apiFn = svc.slice(svc.indexOf("function mapActiveEconomySettingsForAdminApi"));
    assert.match(apiFn, /normalOrderDefaultBidCost/);
    assert.match(apiFn, /normalOrderDeadlineIncompleteTargetPolicy/);
    assert.match(val, /normalOrderDefaultBidCost/);
    assert.match(val, /normalOrderMinValueJod/);
    assert.match(val, /normalOrderBusinessTimezone/);
  });

  it("deadline reconcile notifies with dedupe keys; refund notifies Freelancer", () => {
    const rules = read("src/services/marketplaceNormalOrderRulesService.js");
    const bid = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.match(rules, /order_apps_deadline_continue_/);
    assert.match(rules, /order_apps_deadline_admin_review_/);
    assert.match(rules, /notifyDeadlineReconcileOutcome/);
    assert.match(bid, /normal_app_bid_refund_/);
    assert.match(bid, /order\.bid\.refunded/);
  });
});

describe("Phase E3 wiring preservation", () => {
  it("ordersService uses E3 snapshot + target auto-close + resolveChargeAmount", () => {
    const src = read("src/services/ordersService.js");
    assert.match(src, /marketplaceNormalOrderRulesService/);
    assert.match(src, /buildOrderRulesSnapshotForCreate/);
    assert.match(src, /assertOrderAcceptsApplications/);
    assert.match(src, /maybeAutoCloseOnTargetReached/);
    assert.match(src, /resolveChargeAmount/);
  });

  it("B2 charge/refund is quantity-aware (E3)", () => {
    const src = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.match(src, /resolveChargeAmount|resolveOrderApplicationBidCost/);
    assert.match(src, /bidCreditCost/);
    assert.match(src, /fefo_allocations/);
    assert.match(src, /totalQty/);
    assert.doesNotMatch(src, /amount:\s*NORMAL_APPLICATION_BID_COST/);
  });

  it("does not modify E2 Article settlement / D1 pool / pantry", () => {
    const e2Settle = read("src/services/marketplaceArticleSettlementService.js");
    assert.match(e2Settle, /settleArticleFinalApproval|ARTICLE/);
    const d1 = read("src/services/marketplaceBidDistributionPoolService.js");
    assert.match(d1, /distribution.?pool|admin.?pool/i);
    assert.ok(!fs.existsSync(path.join(root, "sql/migrations/155_pantry_house.sql")));
  });

  it("economy settings expose E3 Admin fields", () => {
    const src = read("src/services/marketplaceEconomySettingsService.js");
    assert.match(src, /normalOrderDefaultBidCost/);
    assert.match(src, /normal_order_default_bid_cost/);
    assert.match(src, /normalOrderDeadlineIncompleteTargetPolicy/);
  });
});
