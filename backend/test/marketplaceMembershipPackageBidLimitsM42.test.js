/**
 * Marketplace-M4.2 — package bid limits + pending-start allowance alignment.
 * Mocked/static only. No Production / migrations / Stripe / seed.
 *
 * Run: node --test test/marketplaceMembershipPackageBidLimitsM42.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_membership_m42_placeholder";

const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { E1_PLAN_SPECS } = require("../src/constants/marketplaceMembershipPlans");
const {
  computePendingStartApplicationBidAllowance,
  resolvePlanDailyBidSpendLimit,
  ensurePurchasedPendingStartApplicationBidAllowance,
  adoptPendingStartAllowanceIntoActiveCycle,
  buildPendingStartAllowanceIdempotencyKey,
} = require("../src/services/marketplacePendingStartBidAllowanceService");
const { isBenefitUsableStatus } = require("../src/constants/marketplaceMemberships");
const {
  decideMarketplaceMembershipFirstOrderStart,
} = require("../src/utils/marketplaceMembershipPendingStart");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("M4.2 package card = enforced limits (source of truth)", () => {
  it("E1_PLAN_SPECS match product card numbers", () => {
    assert.equal(E1_PLAN_SPECS.starter.totalBids, 20);
    assert.equal(E1_PLAN_SPECS.starter.dailyBidLimit, 2);
    assert.equal(E1_PLAN_SPECS.silver.totalBids, 40);
    assert.equal(E1_PLAN_SPECS.silver.dailyBidLimit, 3);
    assert.equal(E1_PLAN_SPECS.pro.totalBids, 100);
    assert.equal(E1_PLAN_SPECS.pro.dailyBidLimit, 7);
    assert.equal(E1_PLAN_SPECS.elite.totalBids, 150);
    assert.equal(E1_PLAN_SPECS.elite.dailyBidLimit, 10);
  });

  it("A/B/C — pending-start total = package monthlyBidAllowance (not arbitrary cap)", () => {
    assert.equal(
      computePendingStartApplicationBidAllowance({
        monthlyBidAllowance: 40,
        dailyBidSpendLimit: 3,
        tierCode: "silver",
      }),
      40,
    );
    assert.equal(
      computePendingStartApplicationBidAllowance({
        monthlyBidAllowance: 100,
        dailyBidSpendLimit: 7,
        tierCode: "pro",
      }),
      100,
    );
    assert.equal(
      computePendingStartApplicationBidAllowance({
        monthlyBidAllowance: 150,
        dailyBidSpendLimit: 10,
        tierCode: "elite",
      }),
      150,
    );
  });

  it("D — STARTER defaults 20 / 2 when plan fields missing", () => {
    assert.equal(computePendingStartApplicationBidAllowance({ tierCode: "starter" }), 20);
    assert.equal(resolvePlanDailyBidSpendLimit({ tierCode: "starter" }), 2);
  });

  it("frontend PlanCard metrics come from plan.monthlyBidAllowance / dailyBidSpendLimit", () => {
    const mapper = read("../frontend/src/lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans.js");
    const body = read("../frontend/src/components/plans/MembershipPlanCardBody.jsx");
    const ar = JSON.parse(read("../frontend/src/locales/ar/plans.json"));
    assert.match(mapper, /monthlyBidAllowance/);
    assert.match(mapper, /dailyBidSpendLimit/);
    assert.match(body, /primaryMetrics/);
    assert.match(body, /dailyLimit|dailyBidSpendLimit/);
    assert.equal(ar.membership.bidsAvailable, "عرض متاح");
    assert.equal(ar.membership.bidsPerDay, "عروض يوميًا");
  });
});

describe("M4.2 ensure grants full package total", () => {
  it("SILVER pending-start grant amount = 40", async () => {
    const calls = [];
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
        return { created: true, idempotent: false, grant: { id: 1, amountGranted: input.amount } };
      },
    );
    try {
      const out = await ensurePurchasedPendingStartApplicationBidAllowance({
        client: { query: async () => ({ rows: [] }) },
        freelancerUserId: 9,
        membership: {
          id: 55,
          status: "purchased_pending_start",
          plan: { monthlyBidAllowance: 40, dailyBidSpendLimit: 3, tierCode: "silver" },
        },
      });
      assert.equal(out.granted, true);
      assert.equal(out.amount, 40);
      assert.equal(out.dailyBidSpendLimit, 3);
      assert.equal(calls[0].amount, 40);
      assert.equal(calls[0].cycleId, null);
      assert.equal(calls[0].metadata.priorityBidUnlocked, false);
      assert.equal(calls[0].metadata.packageTotalBids, 40);
      assert.match(String(calls[0].reason), /package_bid_allowance/);
    } finally {
      schemaSpy.mock.restore();
      grantSpy.mock.restore();
    }
  });
});

describe("M4.2 E — no double grant on term start (adopt)", () => {
  it("seeds distribution total_unlocked from pre-start grant amount", async () => {
    const queries = [];
    const client = {
      query: async (sql, params) => {
        const s = String(sql);
        queries.push({ s, params });
        if (/FROM marketplace_bid_credit_grants[\s\S]*FOR UPDATE/i.test(s)) {
          return {
            rows: [
              {
                id: 88,
                freelancer_user_id: 9,
                amount_granted: 40,
                amount_consumed: 5,
                expires_at: new Date("2026-11-01T00:00:00.000Z"),
                metadata: {},
              },
            ],
          };
        }
        if (/FROM marketplace_membership_bid_distribution_months/i.test(s)) {
          return {
            rows: [{ id: 3, monthly_bid_allowance_snapshot: 40, total_unlocked: 0 }],
          };
        }
        return { rows: [] };
      },
    };

    const schemaSpy = mock.method(
      require("../src/utils/marketplaceBidCreditsSchema"),
      "marketplaceBidCreditsSchemaReady",
      async () => true,
    );
    try {
      const out = await adoptPendingStartAllowanceIntoActiveCycle({
        client,
        membershipId: 55,
        cycleId: 12,
        paidTermEndsAt: new Date("2026-09-24T12:00:00.000Z"),
        freelancerUserId: 9,
      });
      assert.equal(out.adopted, true);
      assert.equal(out.grantedAmount, 40);
      assert.equal(out.amountConsumed, 5);
      const unlockUpdate = queries.find((q) => /SET total_unlocked = GREATEST/i.test(q.s));
      assert.ok(unlockUpdate);
      assert.equal(unlockUpdate.params[1], 40);
      const grantUpdate = queries.find((q) => /SET cycle_id = COALESCE/i.test(q.s));
      assert.ok(grantUpdate);
    } finally {
      schemaSpy.mock.restore();
    }
  });

  it("wiring: cycle activation adopts before reconcile (not revoke)", () => {
    const cycles = read("src/services/marketplaceMembershipCyclesService.js");
    const memberships = read("src/services/marketplaceMembershipsService.js");
    assert.match(cycles, /adoptPendingStartAllowanceIntoActiveCycle/);
    assert.match(cycles, /ensureDistributionMonthForCycle/);
    assert.match(cycles, /reconcileDistributionMonth/);
    // Term-start path no longer revokes unused remainder before cycle create.
    assert.doesNotMatch(memberships, /revokeUnusedPendingStartApplicationBidAllowance/);
  });
});

describe("M4.2 daily cap + Priority Bid + term start", () => {
  it("daily spend service includes purchased_pending_start", () => {
    const src = read("src/services/marketplaceMembershipDailyBidSpendService.js");
    assert.match(src, /purchased_pending_start/);
    assert.match(src, /daily_bid_spend_limit/);
  });

  it("F — Priority Bid remains benefit-usable / active-only", () => {
    assert.equal(isBenefitUsableStatus("purchased_pending_start"), false);
    const priority = read("src/services/marketplacePriorityBidUsageService.js");
    assert.match(priority, /isBenefitUsableStatus/);
    assert.doesNotMatch(priority, /isApplicationEligibleStatus/);
  });

  it("G — bid alone does not start term; assignment does", () => {
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: null,
      }),
      "reject_missing_order",
    );
    const subs = read("src/services/subscriptionsService.js");
    assert.match(subs, /maybeStartMarketplaceMembershipOnFirstRealOrder/);
  });
});

describe("M4.2 pure double-grant math", () => {
  it("used N during pending-start → remaining package = total - N after adopt seed", () => {
    const packageTotal = 40;
    const preStartGranted = 40;
    const used = 7;
    const seededUnlocked = Math.min(preStartGranted, packageTotal);
    const remainingToUnlock = Math.max(0, packageTotal - seededUnlocked);
    const remainingSpendable = preStartGranted - used + remainingToUnlock;
    assert.equal(seededUnlocked, 40);
    assert.equal(remainingToUnlock, 0);
    assert.equal(remainingSpendable, 33);
    assert.ok(remainingSpendable + used === packageTotal);
  });

  it("legacy smaller M4.1 grant still tops up without exceeding package", () => {
    const packageTotal = 40;
    const preStartGranted = 15;
    const used = 4;
    const seededUnlocked = Math.min(preStartGranted, packageTotal);
    const remainingToUnlock = Math.max(0, packageTotal - seededUnlocked);
    const remainingSpendable = preStartGranted - used + remainingToUnlock;
    assert.equal(remainingToUnlock, 25);
    assert.equal(remainingSpendable, 36);
    assert.equal(remainingSpendable + used, packageTotal);
  });
});
