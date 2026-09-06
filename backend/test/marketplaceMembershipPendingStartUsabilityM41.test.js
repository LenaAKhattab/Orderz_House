/**
 * Marketplace-M4.1 — pending-start apply/bid usability (no term start).
 * Mocked/static only. No Production / migrations / Stripe / seed.
 *
 * Run: node --test test/marketplaceMembershipPendingStartUsabilityM41.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_membership_m41_placeholder";

const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const {
  computePendingStartApplicationBidAllowance,
  ensurePurchasedPendingStartApplicationBidAllowance,
  buildPendingStartAllowanceIdempotencyKey,
} = require("../src/services/marketplacePendingStartBidAllowanceService");
const {
  isApplicationEligibleStatus,
  decideMarketplaceMembershipFirstOrderStart,
} = require("../src/utils/marketplaceMembershipPendingStart");
const { isBenefitUsableStatus } = require("../src/constants/marketplaceMemberships");
const eligibility = require("../src/services/marketplaceMembershipEligibilityService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("M4.1 allowance math + entitlement", () => {
  it("pending-start Bids equal package monthly total (aligned M4.2)", () => {
    const silver = computePendingStartApplicationBidAllowance({
      monthlyBidAllowance: 40,
      dailyBidSpendLimit: 3,
    });
    assert.equal(silver, 40);
    assert.ok(silver <= 40);
  });

  it("A — pending-start is application-eligible; Priority Bid benefit is not", () => {
    assert.equal(isApplicationEligibleStatus("purchased_pending_start"), true);
    assert.equal(isBenefitUsableStatus("purchased_pending_start"), false);
    assert.equal(isBenefitUsableStatus("active"), true);
  });

  it("B/C — gates still required for canApply", () => {
    assert.equal(
      eligibility.evaluatePendingStartApplyCapability({
        membershipStatus: "purchased_pending_start",
        verificationComplete: false,
        trainingComplete: true,
        tierCode: "silver",
      }).canApply,
      false,
    );
    assert.equal(
      eligibility.evaluatePendingStartApplyCapability({
        membershipStatus: "purchased_pending_start",
        verificationComplete: true,
        trainingComplete: false,
        tierCode: "silver",
      }).canApply,
      false,
    );
    assert.equal(
      eligibility.evaluatePendingStartApplyCapability({
        membershipStatus: "purchased_pending_start",
        verificationComplete: true,
        trainingComplete: true,
        tierCode: "silver",
      }).canApply,
      true,
    );
  });

  it("D/E — payment_pending / expired / cancelled / suspended blocked", () => {
    for (const status of ["payment_pending", "expired", "cancelled", "suspended"]) {
      assert.equal(isApplicationEligibleStatus(status), false, status);
    }
  });
});

describe("M4.1 ensurePurchasedPendingStartApplicationBidAllowance (mocked)", () => {
  it("creates package-total grant for pending-start without cycle / without term fields", async () => {
    const calls = [];
    const client = {
      query: async () => ({ rows: [] }),
    };
    const schemaSpy = mock.method(
      require("../src/utils/marketplaceBidCreditsSchema"),
      "marketplaceBidCreditsSchemaReady",
      async () => true,
    );
    const grantSpy = mock.method(
      require("../src/services/marketplaceBidCreditAccountingService"),
      "createBidCreditGrant",
      async (input) => {
        calls.push(input);
        return {
          created: true,
          idempotent: false,
          grant: { id: 9, amountGranted: input.amount, cycleId: null },
        };
      },
    );

    try {
      const out = await ensurePurchasedPendingStartApplicationBidAllowance({
        client,
        freelancerUserId: 42,
        membership: {
          id: 77,
          status: "purchased_pending_start",
          marketplacePlanId: 3,
          plan: { monthlyBidAllowance: 40, dailyBidSpendLimit: 3, tierCode: "silver" },
        },
        now: new Date("2026-08-25T12:00:00.000Z"),
      });
      assert.equal(out.granted, true);
      assert.equal(out.amount, 40);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].cycleId, null);
      assert.equal(calls[0].sourceType, "membership_daily_unlock");
      assert.equal(calls[0].eventType, "MEMBERSHIP_BID_GRANT");
      assert.match(String(calls[0].reason), /package_bid_allowance|application_allowance/);
      assert.equal(calls[0].metadata.termStarted, false);
      assert.equal(calls[0].metadata.priorityBidUnlocked, false);
      assert.equal(
        calls[0].idempotencyKey,
        buildPendingStartAllowanceIdempotencyKey(77),
      );
    } finally {
      schemaSpy.mock.restore();
      grantSpy.mock.restore();
    }
  });

  it("no-ops for active membership (I)", async () => {
    const out = await ensurePurchasedPendingStartApplicationBidAllowance({
      client: { query: async () => ({ rows: [] }) },
      freelancerUserId: 1,
      membership: { id: 2, status: "active" },
    });
    assert.equal(out.granted, false);
    assert.equal(out.reason, "not_purchased_pending_start");
  });
});

describe("M4.1 F/G — apply does not start term; assignment does", () => {
  it("F — apply/bid decision helpers do not flip pending-start", () => {
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: null,
      }),
      "reject_missing_order",
    );
    const articleSrc = read("src/services/marketplaceArticleApplicationsService.js");
    const submitIdx = articleSrc.indexOf("async function submitArticleApplication");
    const helperIdx = articleSrc.indexOf("async function maybeStartMembershipAfterArticleSelection");
    const submitBody = articleSrc.slice(submitIdx, helperIdx > 0 ? helperIdx : submitIdx + 5000);
    assert.match(submitBody, /ensurePurchasedPendingStartApplicationBidAllowance/);
    assert.doesNotMatch(submitBody, /startMarketplaceMembershipOnFirstRealOrder/);
    assert.doesNotMatch(submitBody, /maybeStartMembershipAfterArticleSelection/);
  });

  it("G — first assignment/selection still wires term start", () => {
    const subs = read("src/services/subscriptionsService.js");
    const articles = read("src/services/marketplaceArticleApplicationsService.js");
    const cycles = read("src/services/marketplaceMembershipCyclesService.js");
    assert.match(subs, /maybeStartMarketplaceMembershipOnFirstRealOrder/);
    assert.match(articles, /maybeStartMembershipAfterArticleSelection/);
    assert.match(cycles, /adoptPendingStartAllowanceIntoActiveCycle/);
    assert.match(cycles, /createAndActivateCycleForMembership|ensureDistributionMonthForCycle/);
  });
});

describe("M4.1 wiring — normal bids / articles / pantry / priority", () => {
  it("A — normal order bid charge ensures pending-start allowance", () => {
    const src = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.match(src, /ensurePurchasedPendingStartApplicationBidAllowance/);
  });

  it("A — article reserve ensures pending-start allowance", () => {
    const src = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(src, /ensurePurchasedPendingStartApplicationBidAllowance/);
    assert.match(src, /isApplicationEligibleStatus/);
    assert.match(src, /assertMarketplaceApplyGates/);
  });

  it("A — pantry spendable path ensures allowance", () => {
    const src = read("src/services/pantryMembershipBidService.js");
    assert.match(src, /ensurePurchasedPendingStartApplicationBidAllowance/);
    assert.match(src, /isApplicationEligibleStatus/);
  });

  it("H — Priority Bid / elite still require benefit-usable (active)", () => {
    const priority = read("src/services/marketplacePriorityBidUsageService.js");
    const elite = read("src/services/marketplaceEliteDirectOrderEntitlementService.js");
    assert.match(priority, /isBenefitUsableStatus/);
    assert.match(elite, /isBenefitUsableStatus/);
    assert.doesNotMatch(priority, /isApplicationEligibleStatus/);
  });

  it("daily spend includes purchased_pending_start after M4.1", () => {
    const src = read("src/services/marketplaceMembershipDailyBidSpendService.js");
    assert.match(src, /purchased_pending_start/);
  });

  it("order pool auth still allows purchased_pending_start + gates", () => {
    const src = read("src/services/orderAuthorizationService.js");
    assert.match(src, /purchased_pending_start/);
    assert.match(src, /assertMarketplaceApplyGates/);
  });
});

describe("M4.1 J — frontend + Stripe assumptions compatible", () => {
  it("M5 card does not advertise cycle/priority Bids while pending-start", () => {
    const card = read("../frontend/src/components/freelancer/FreelancerMarketplaceMembershipCard.jsx");
    assert.match(card, /purchased_pending_start/);
    assert.match(card, /benefitsUsable/);
    assert.match(card, /bidsAvailable = benefitsUsable/);
    assert.match(card, /termNotStarted|termStartsOnFirstOrder/);
  });

  it("checkout create still does not grant membership; webhook still pending-start only", () => {
    const checkout = read("src/services/marketplaceMembershipCheckoutService.js");
    const createIdx = checkout.indexOf("async function createMarketplaceMembershipCheckoutSession");
    const applyIdx = checkout.indexOf("async function applyMarketplaceMembershipCheckoutSessionCompleted");
    const createBody = checkout.slice(createIdx, applyIdx);
    assert.doesNotMatch(createBody, /createPurchasedPendingStartMembership/);
    assert.match(checkout.slice(applyIdx), /createPurchasedPendingStartMembership/);
  });
});
