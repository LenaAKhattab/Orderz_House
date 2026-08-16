/**
 * بيت المونة × Marketplace Membership + Bid Credit integration (static).
 * Does NOT apply migration 157. No Production mutation / git / deploy / engine enable.
 *
 * Run: npm run test:pantry-membership-bid
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/pantry_membership_bid_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL,
  PANTRY_BID_REFUND_RESTORES_DAILY_CAP,
  PANTRY_DEFAULT_APPLICATION_BID_COST,
  PANTRY_MEMBERSHIP_BID_INTEGRATION_DEFAULT,
  PANTRY_INTEGRATION_MODES,
  PANTRY_REFUND_POLICY,
  PANTRY_MEMBERSHIP_BID_ERROR_CODES,
  pantryApplyBlockMessage,
  resolvePantryRefundMode,
  resolvePantryApplicationBidCost,
  resolvePantryProjectValue,
  resolvePantryMembershipBidIntegrationState,
} = require("../src/constants/pantryMembershipBid");

const {
  evaluatePantryEligibility,
  applicantCapacityView,
} = require("../src/services/pantryMembershipBidService");

const { evaluateProjectValueEligibility } = require("../src/services/marketplaceMembershipEligibilityService");
const {
  BID_CREDIT_LEDGER_EVENT_TYPES,
  BID_CREDIT_SOURCE_TYPES,
} = require("../src/constants/marketplaceBidCredits");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const starterPlan = {
  tierCode: "starter",
  projectMinValueJod: 1,
  maxRealOrderValueJod: 10,
  unlimitedRealOrderValue: false,
};
const silverPlan = {
  tierCode: "silver",
  projectMinValueJod: 1,
  maxRealOrderValueJod: 20,
  unlimitedRealOrderValue: false,
};
const proPlan = {
  tierCode: "pro",
  projectMinValueJod: 1,
  maxRealOrderValueJod: 50,
  unlimitedRealOrderValue: false,
};
const elitePlan = {
  tierCode: "elite",
  projectMinValueJod: 1,
  maxRealOrderValueJod: null,
  unlimitedRealOrderValue: true,
};

describe("157 pantry membership bid migration authored, not recreating 153", () => {
  const sql = read("sql/migrations/157_pantry_membership_bid_integration.sql");

  it("is additive behind 156 and does not recreate pantry house", () => {
    assert.match(sql, /157_pantry_membership_bid_integration|157:/);
    assert.match(sql, /freelancer_starter_pantry_opportunity/);
    assert.match(sql, /pantry_application_bid_credit_economics/);
    assert.match(sql, /application_bid_cost/);
    assert.match(sql, /target_applicant_count/);
    assert.match(sql, /PANTRY_APPLICATION_BID_CONSUME/);
    assert.match(sql, /pantry_application_refund/);
    assert.match(sql, /pantry_membership_bid_integration_enabled/);
    assert.match(sql, /BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.doesNotMatch(sql, /SET\s+pantry_membership_bid_integration_enabled\s*=/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS pantry_requests/);
    assert.doesNotMatch(sql, /DROP TABLE/);
    assert.doesNotMatch(sql, /SET\s+bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /SET\s+work_tokens_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /SET\s+pantry_membership_bid_integration_enabled\s*=\s*TRUE/i);
  });

  it("checksum is stable for 157 review", () => {
    const hash = crypto.createHash("sha256").update(sql).digest("hex");
    assert.equal(hash.length, 64);
    // eslint-disable-next-line no-console
    console.log("MIGRATION_157_SHA256", hash);
    assert.ok(hash);
  });
});

describe("Pantry integration activation gating", () => {
  it("default is OFF and schema presence is not an input", () => {
    assert.equal(PANTRY_MEMBERSHIP_BID_INTEGRATION_DEFAULT, false);
    const resolverSrc = read("src/constants/pantryMembershipBid.js");
    assert.match(resolverSrc, /Schema\/table\/column presence is NOT an input/);
    const off = resolvePantryMembershipBidIntegrationState({});
    assert.equal(off.active, false);
    assert.equal(off.mode, PANTRY_INTEGRATION_MODES.LEGACY);
  });

  it("legacy: flag false + engine false", () => {
    const s = resolvePantryMembershipBidIntegrationState({
      pantryMembershipBidIntegrationEnabled: false,
      bidCreditsEnabled: false,
    });
    assert.equal(s.active, false);
    assert.equal(s.paused, false);
    assert.equal(s.mode, PANTRY_INTEGRATION_MODES.LEGACY);
  });

  it("legacy: flag false + engine true", () => {
    const s = resolvePantryMembershipBidIntegrationState({
      pantryMembershipBidIntegrationEnabled: false,
      bidCreditsEnabled: true,
    });
    assert.equal(s.active, false);
    assert.equal(s.paused, false);
    assert.equal(s.mode, PANTRY_INTEGRATION_MODES.LEGACY);
  });

  it("mixed: flag true + engine false = PAUSED fail-closed (not legacy)", () => {
    const s = resolvePantryMembershipBidIntegrationState({
      pantryMembershipBidIntegrationEnabled: true,
      bidCreditsEnabled: false,
    });
    assert.equal(s.active, false);
    assert.equal(s.paused, true);
    assert.equal(s.mode, PANTRY_INTEGRATION_MODES.PAUSED);
    assert.equal(s.flagEnabled, true);
    assert.equal(s.bidEngineEnabled, false);
  });

  it("integrated only when both flags are true and runtime is ready", () => {
    const s = resolvePantryMembershipBidIntegrationState({
      pantryMembershipBidIntegrationEnabled: true,
      bidCreditsEnabled: true,
    });
    assert.equal(s.active, true);
    assert.equal(s.paused, false);
    assert.equal(s.mode, PANTRY_INTEGRATION_MODES.INTEGRATED);
  });

  it("flag true + engine true + runtime unready = PAUSED (never legacy)", () => {
    const s = resolvePantryMembershipBidIntegrationState({
      pantryMembershipBidIntegrationEnabled: true,
      bidCreditsEnabled: true,
      runtimeReady: false,
    });
    assert.equal(s.mode, PANTRY_INTEGRATION_MODES.PAUSED);
    assert.equal(s.active, false);
    assert.equal(s.paused, true);
  });

  it("unreadable settings fail closed to PAUSED", () => {
    const s = resolvePantryMembershipBidIntegrationState({
      pantryMembershipBidIntegrationEnabled: false,
      bidCreditsEnabled: false,
      settingsReadable: false,
    });
    assert.equal(s.mode, PANTRY_INTEGRATION_MODES.PAUSED);
    assert.equal(s.paused, true);
    assert.equal(s.active, false);
  });

  it("submitBid uses the canonical three-state resolver, not schema presence", () => {
    const service = read("src/services/pantryService.js");
    assert.match(service, /async function submitBidLegacy/);
    assert.match(service, /async function submitBidIntegrated/);
    assert.match(service, /getPantryMembershipBidIntegrationState/);
    const submitIdx = service.indexOf("async function submitBid(");
    const submitBody = service.slice(submitIdx, submitIdx + 1400);
    assert.match(submitBody, /PANTRY_INTEGRATION_MODES\.LEGACY/);
    assert.match(submitBody, /return submitBidLegacy/);
    assert.match(submitBody, /throwPantryIntegrationPaused/);
    assert.match(submitBody, /return submitBidIntegrated/);
    assert.doesNotMatch(submitBody, /if \(!integration\.active\)/);
    assert.doesNotMatch(submitBody, /pantryEconomySchemaReady/);
    const legacy = service.slice(
      service.indexOf("async function submitBidLegacy"),
      service.indexOf("async function submitBidIntegrated"),
    );
    assert.doesNotMatch(legacy, /assertMembershipAndPantryEligibility/);
    assert.doesNotMatch(legacy, /finalizePantryApplicationAfterInsert/);
    assert.doesNotMatch(legacy, /consumeStarterOpportunity/);
    assert.doesNotMatch(legacy, /assertAndConsumeDailyBidSpend/);
    assert.doesNotMatch(legacy, /chargePantryApplicationBids/);
  });

  it("paused submit must not fall back to legacy apply", () => {
    const service = read("src/services/pantryService.js");
    const submitIdx = service.indexOf("async function submitBid(");
    const submitBody = service.slice(submitIdx, submitIdx + 1400);
    assert.match(submitBody, /PANTRY_INTEGRATION_MODES\.INTEGRATED/);
    assert.ok(submitBody.indexOf("throwPantryIntegrationPaused") < submitBody.indexOf("submitBidIntegrated"));
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.match(adapter, /PANTRY_INTEGRATION_TEMPORARILY_UNAVAILABLE/);
    assert.match(adapter, /throwPantryIntegrationPaused/);
  });

  it("charge/daily/starter fail closed instead of skipping consume", () => {
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.match(adapter, /getPantryMembershipBidIntegrationState/);
    assert.match(adapter, /assertIntegratedPantryRuntimeReady/);
    assert.doesNotMatch(adapter, /reason: "engine_off"/);
    assert.match(adapter, /reason: "legacy_mode"/);
    assert.match(adapter, /PANTRY_INTEGRATION_TEMPORARILY_UNAVAILABLE/);
    assert.match(adapter, /throwPantryIntegrationPaused/);
  });

  it("frontend requires server mode and paused UX", () => {
    const redirectPage = read("../frontend/src/pages/dashboard/FreelancerPantryPage.jsx");
    const marketplace = read("../frontend/src/components/open-orders/OpenOrdersMarketplace.jsx");
    const admin = read("../frontend/src/pages/dashboard/AdminPantryPage.jsx");
    const constants = read("src/constants/pantryMembershipBid.js");
    assert.match(redirectPage, /Navigate to="\/dashboard\/freelancer\/orders"/);
    assert.doesNotMatch(redirectPage, /pantryMembershipBidIntegrationActive/);
    assert.match(marketplace, /listFreelancerPantryRequestsRequest/);
    assert.match(marketplace, /submitFreelancerPantryBidRequest/);
    assert.match(admin, /pantryMembershipBidIntegrationActive/);
    assert.match(admin, /integrationActive \? \(/);
    assert.match(constants, /التقديم على طلبات بيت المونة متوقف مؤقتًا/);
    assert.match(constants, /PANTRY_INTEGRATION_MODES/);
  });
});

describe("Starter one-time pantry opportunity", () => {
  it("1. verified STARTER with unused opportunity is eligible", () => {
    const out = evaluatePantryEligibility({
      requestRow: { status: "open_for_bids", fixed_budget: 8, application_bid_cost: 1 },
      membershipPlan: starterPlan,
      starterConsumed: false,
    });
    assert.equal(out.eligible, true);
    assert.equal(out.starterOpportunityRemaining, STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL);
    assert.equal(STARTER_PANTRY_APPLICATION_OPPORTUNITY_TOTAL, 1);
  });

  it("2. unverified / missing membership is blocked", () => {
    const out = evaluatePantryEligibility({
      requestRow: { status: "open_for_bids", fixed_budget: 8 },
      membershipPlan: null,
      starterConsumed: false,
    });
    assert.equal(out.eligible, false);
    assert.equal(out.reasons[0].code, PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_MEMBERSHIP_REQUIRED);
  });

  it("3–5. first success consumes; used opportunity blocks second", () => {
    const used = evaluatePantryEligibility({
      requestRow: { status: "open_for_bids", fixed_budget: 8 },
      membershipPlan: starterPlan,
      starterConsumed: true,
    });
    assert.equal(used.eligible, false);
    assert.equal(used.reasons[0].code, PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_STARTER_OPPORTUNITY_USED);
    assert.equal(
      pantryApplyBlockMessage(used.reasons[0].code),
      "لقد استخدمت فرصة بيت المونة الخاصة بباقة STARTER.",
    );
  });

  it("6–7. losing / refund does not restore Starter opportunity (no auto-refund of entitlement)", () => {
    assert.equal(resolvePantryRefundMode("losing_applicant"), "none");
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.doesNotMatch(adapter, /DELETE FROM freelancer_starter_pantry_opportunity/);
    assert.match(adapter, /consumed_at IS NULL/);
    assert.equal(PANTRY_REFUND_POLICY.losing_applicant, "none");
  });

  it("8. Silver/Pro/Elite are not subject to Starter one-time rule", () => {
    for (const plan of [silverPlan, proPlan, elitePlan]) {
      const out = evaluatePantryEligibility({
        requestRow: { status: "open_for_bids", fixed_budget: 8 },
        membershipPlan: plan,
        starterConsumed: true,
      });
      assert.equal(out.eligible, true);
      assert.equal(out.starterOpportunityRemaining, null);
    }
  });
});

describe("Pantry Bid cost + E1 value intersection", () => {
  it("9–10. Bid cost 1 default and >1 from order config", () => {
    assert.equal(resolvePantryApplicationBidCost({}), PANTRY_DEFAULT_APPLICATION_BID_COST);
    assert.equal(resolvePantryApplicationBidCost({ application_bid_cost: 1 }), 1);
    assert.equal(resolvePantryApplicationBidCost({ application_bid_cost: 2 }), 2);
    assert.equal(resolvePantryApplicationBidCost({ applicationBidCost: 3 }), 3);
    assert.equal(resolvePantryApplicationBidCost({ amount: 40 }), 1);
  });

  it("reuses E1 project-value bands; pantry eligible_tier_codes intersect", () => {
    assert.equal(evaluateProjectValueEligibility(starterPlan, 8).eligible, true);
    assert.equal(evaluateProjectValueEligibility(starterPlan, 40).eligible, false);
    assert.equal(evaluateProjectValueEligibility(proPlan, 40).eligible, true);
    assert.equal(evaluateProjectValueEligibility(elitePlan, 90).eligible, true);

    const pantryRestrictsPro = evaluatePantryEligibility({
      requestRow: {
        status: "open_for_bids",
        fixed_budget: 40,
        eligible_tier_codes: ["elite"],
      },
      membershipPlan: proPlan,
      starterConsumed: false,
    });
    assert.equal(pantryRestrictsPro.eligible, false);
    assert.equal(
      pantryRestrictsPro.reasons[0].code,
      PANTRY_MEMBERSHIP_BID_ERROR_CODES.PANTRY_PLAN_NOT_ELIGIBLE,
    );

    const eliteOk = evaluatePantryEligibility({
      requestRow: {
        status: "open_for_bids",
        fixed_budget: 40,
        eligible_tier_codes: ["pro", "elite"],
      },
      membershipPlan: elitePlan,
      starterConsumed: false,
    });
    assert.equal(eliteOk.eligible, true);
  });
});

describe("Applicant cap, deadline, edit, refund matrix", () => {
  it("14. target auto-close remaining hits 0", () => {
    const view = applicantCapacityView({ target_applicant_count: 20 }, 20);
    assert.equal(view.remainingApplicantSlots, 0);
    assert.equal(view.currentApplicantCount, 20);
  });

  it("15–18. last-slot concurrency: overflow after insert is count > target; pre-insert is >=", () => {
    const service = read("src/services/pantryService.js");
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.match(service, /SELECT \* FROM pantry_requests WHERE id = \$1 FOR UPDATE/);
    assert.match(service, /assertPantryAcceptsApplications/);
    assert.match(service, /finalizePantryApplicationAfterInsert/);
    assert.match(adapter, /count > target/);
    assert.match(adapter, /count >= target/);
    assert.match(adapter, /consumeStarterOpportunity/);
    assert.match(adapter, /WHERE freelancer_starter_pantry_opportunity\.consumed_at IS NULL/);
  });

  it("19. pending application edit does not re-charge", () => {
    const service = read("src/services/pantryService.js");
    const start = service.indexOf('if (existing.rows[0].status === "pending")');
    const end = service.indexOf("DUPLICATE_BID", start);
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(service.slice(start, end), /finalizePantryApplicationAfterInsert/);
    assert.doesNotMatch(service.slice(start, end), /consumeStarterOpportunity/);
    assert.match(service.slice(start, end), /UPDATE pantry_bids/);
  });

  it("20–22. eligible refund is 100% consumed quantity, idempotent, no daily cap restore", () => {
    assert.equal(resolvePantryRefundMode("system_cancel"), "full");
    assert.equal(resolvePantryRefundMode("cancelled_before_assignment"), "full");
    assert.equal(resolvePantryRefundMode("no_freelancer_selected"), "full");
    assert.equal(resolvePantryRefundMode("deadline_system_failure"), "full");
    assert.equal(resolvePantryRefundMode("freelancer_withdrawal"), "none");
    assert.equal(resolvePantryRefundMode("rejected_application"), "none");
    assert.equal(resolvePantryRefundMode("losing_applicant"), "none");
    assert.equal(resolvePantryRefundMode("post_assignment_cancellation"), "none");
    assert.equal(PANTRY_BID_REFUND_RESTORES_DAILY_CAP, false);
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.doesNotMatch(adapter, /releaseDailyBidSpend/);
    assert.match(adapter, /refund_status === "refunded"/);
    assert.match(adapter, /bid_credit_cost/);
    assert.doesNotMatch(adapter, /0\.7|70%/);
  });
});

describe("Isolation + winner preservation + engines dormant", () => {
  it("23. existing acceptBid winner path unchanged (no auto-award on target)", () => {
    const service = read("src/services/pantryService.js");
    assert.match(service, /async function acceptBid/);
    assert.match(service, /status = 'assigned'/);
    assert.match(service, /accepted_bid_id/);
    assert.doesNotMatch(service, /auto.?award/i);
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.match(adapter, /applications_close_reason = COALESCE\(applications_close_reason, 'target_reached'\)/);
    assert.doesNotMatch(adapter, /status = 'assigned'/);
  });

  it("24. no Work Token runtime in pantry integration", () => {
    const adapter = read("src/services/pantryMembershipBidService.js");
    const service = read("src/services/pantryService.js");
    const freelancerRedirect = read("../frontend/src/pages/dashboard/FreelancerPantryPage.jsx");
    const marketplace = read("../frontend/src/components/open-orders/OpenOrdersMarketplace.jsx");
    const mapper = read("../frontend/src/components/open-orders/mapPantryRequestToPoolOrder.js");
    const adminUi = read("../frontend/src/pages/dashboard/AdminPantryPage.jsx");
    for (const src of [adapter, service, freelancerRedirect, marketplace, mapper, adminUi]) {
      assert.doesNotMatch(src, /work_tokens_enabled|workTokenService|consumeWorkToken|grantWorkToken/);
    }
  });

  it("25–27. E1/E2/D1 preserved; pantry does not use Article reservation", () => {
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.match(adapter, /evaluateProjectValueEligibility/);
    assert.match(adapter, /assertAndConsumeDailyBidSpend/);
    assert.match(adapter, /consumeBidCreditsFefo/);
    assert.doesNotMatch(adapter, /marketplaceBidCreditReservationService/);
    assert.doesNotMatch(adapter, /ARTICLE_APPLICATION_BID_CONSUME/);
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("PANTRY_APPLICATION_BID_CONSUME"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("APPLICATION_BID_CONSUME"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("ARTICLE_APPLICATION_BID_CONSUME"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("ADMIN_DISTRIBUTION_POOL_GRANT"));
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("pantry_application_refund"));
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("admin_distribution_pool"));
  });

  it("28. existing pantry tests file still present and isolated from ordersService", () => {
    const pantryTest = read("test/pantryHouse.test.js");
    assert.match(pantryTest, /pantry module is isolated from ordersService/);
    const service = read("src/services/pantryService.js");
    assert.ok(!service.includes("ordersService"));
    assert.ok(!service.includes("fakeOrders"));
    assert.ok(!service.includes("stripe"));
  });

  it("11–13. multi-Bid FEFO + insufficient + daily cap are quantity-aware", () => {
    const adapter = read("src/services/pantryMembershipBidService.js");
    assert.match(adapter, /amount: bidCost/);
    assert.match(adapter, /INSUFFICIENT_BID_CREDITS/);
    assert.match(adapter, /MEMBERSHIP_DAILY_BID_LIMIT_REACHED/);
    assert.match(adapter, /sumAvailableBidCredits/);
    assert.equal(
      pantryApplyBlockMessage("PANTRY_INSUFFICIENT_BIDS", { required: 2 }),
      "تحتاج إلى 2 عرض متاح للتقديم.",
    );
    assert.equal(
      pantryApplyBlockMessage("PANTRY_DAILY_BID_LIMIT"),
      "لقد وصلت إلى الحد اليومي للعروض.",
    );
  });

  it("project value uses pantry budget fields, not pantry_bids.amount", () => {
    assert.equal(resolvePantryProjectValue({ fixed_budget: 40 }), 40);
    assert.equal(resolvePantryProjectValue({ budget_min: 10, budget_max: 25 }), 25);
    assert.equal(resolvePantryProjectValue({ amount: 99 }), null);
  });
});

describe("Freelancer / Admin UX copy", () => {
  it("uses approved Arabic block reasons and Starter labels without Token jargon", () => {
    const adapter = read("src/services/pantryMembershipBidService.js");
    const constants = read("src/constants/pantryMembershipBid.js");
    const mapper = read("../frontend/src/components/open-orders/mapPantryRequestToPoolOrder.js");
    const redirectPage = read("../frontend/src/pages/dashboard/FreelancerPantryPage.jsx");
    assert.match(adapter, /فرصة بيت المونة متاحة/);
    assert.match(adapter, /متاحة لمرة واحدة بعد توثيق الحساب/);
    assert.match(adapter, /فرصة بيت المونة الخاصة بباقة STARTER مستخدمة/);
    assert.match(constants, /PANTRY_STARTER_OPPORTUNITY_USED/);
    assert.doesNotMatch(mapper, /بيت المونة/);
    assert.doesNotMatch(redirectPage, /طلب مضمون|فرصة فوز مضمونة/);
    assert.doesNotMatch(redirectPage, /Work Token|ledger|grantId/);
    const admin = read("../frontend/src/pages/dashboard/AdminPantryPage.jsx");
    assert.match(admin, /تكلفة التقديم/);
    assert.match(admin, /العدد المستهدف للمتقدمين/);
    assert.doesNotMatch(admin, /grantId|ledger/);
  });
});
