/**
 * Marketplace-M4 — pending-start eligibility + start on first real order/article.
 * Mocked / static only. No Production / migrations / Stripe / seed / deploy.
 *
 * Run: node --test test/marketplaceMembershipLifecycleM4.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_membership_m4_placeholder";

const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  isApplicationEligibleStatus,
  isPurchasedPendingStartStatus,
  computePaidTermWindowFromDurationDays,
  decideMarketplaceMembershipFirstOrderStart,
  isRealOrderForMarketplaceMembershipStart,
  PURCHASED_PENDING_START_MESSAGE_AR,
} = require("../src/utils/marketplaceMembershipPendingStart");
const { isBenefitUsableStatus } = require("../src/constants/marketplaceMemberships");
const eligibility = require("../src/services/marketplaceMembershipEligibilityService");
const membershipsService = require("../src/services/marketplaceMembershipsService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("M4 A — pending-start apply capability (gates)", () => {
  it("purchased_pending_start + gates complete → canApply", () => {
    const out = eligibility.evaluatePendingStartApplyCapability({
      membershipStatus: "purchased_pending_start",
      verificationComplete: true,
      trainingComplete: true,
      tierCode: "silver",
    });
    assert.equal(out.entitled, true);
    assert.equal(out.termStarted, false);
    assert.equal(out.needsTraining, true);
    assert.equal(out.canApply, true);
  });

  it("purchased_pending_start + missing identity → blocked", () => {
    const out = eligibility.evaluatePendingStartApplyCapability({
      membershipStatus: "purchased_pending_start",
      verificationComplete: false,
      trainingComplete: true,
      tierCode: "pro",
    });
    assert.equal(out.canApply, false);
  });

  it("purchased_pending_start + missing training → blocked", () => {
    const out = eligibility.evaluatePendingStartApplyCapability({
      membershipStatus: "purchased_pending_start",
      verificationComplete: true,
      trainingComplete: false,
      tierCode: "elite",
    });
    assert.equal(out.canApply, false);
  });

  it("payment_pending / expired / cancelled / suspended → not entitled", () => {
    for (const status of ["payment_pending", "expired", "cancelled", "suspended"]) {
      const out = eligibility.evaluatePendingStartApplyCapability({
        membershipStatus: status,
        verificationComplete: true,
        trainingComplete: true,
        tierCode: "silver",
      });
      assert.equal(out.entitled, false, status);
      assert.equal(out.canApply, false, status);
      assert.equal(isApplicationEligibleStatus(status), false, status);
    }
  });

  it("active remains entitled; Priority Bid still requires benefit-usable", () => {
    assert.equal(isApplicationEligibleStatus("active"), true);
    assert.equal(isBenefitUsableStatus("purchased_pending_start"), false);
    assert.equal(isBenefitUsableStatus("active"), true);
  });
});

describe("M4 B/C/D/E — first-order start decision + fake/bid exclusions", () => {
  it("real order starts pending-start; dates = trigger + duration", () => {
    const startsAt = new Date("2026-08-25T15:00:00.000Z");
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: { id: 77, source_type: "client_created" },
      }),
      "start",
    );
    const { paidTermStartsAt, paidTermEndsAt } = computePaidTermWindowFromDurationDays({
      startsAt,
      durationDays: 30,
    });
    assert.equal(paidTermStartsAt.toISOString(), startsAt.toISOString());
    assert.equal(paidTermEndsAt.toISOString(), "2026-09-24T15:00:00.000Z");
  });

  it("application/bid alone does not start (no order trigger)", () => {
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: null,
      }),
      "reject_missing_order",
    );
    assert.equal(isPurchasedPendingStartStatus("purchased_pending_start"), true);
  });

  it("fake/training/simulation markers do not start", () => {
    assert.equal(
      isRealOrderForMarketplaceMembershipStart({
        id: 1,
        source_type: "admin_created",
        is_fake: true,
      }),
      false,
    );
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: { id: 2, source_type: "admin_created", is_training: true },
      }),
      "reject_non_real",
    );
  });

  it("idempotent: already active does not reset; wrong statuses skipped", () => {
    const firstStart = new Date("2026-08-01T00:00:00.000Z");
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "active",
        paidTermStartsAt: firstStart,
        firstOrderStartedAt: firstStart,
        orderRow: { id: 99, source_type: "client_created" },
      }),
      "noop_already_active",
    );
    for (const status of ["expired", "cancelled", "suspended", "payment_pending"]) {
      assert.equal(
        decideMarketplaceMembershipFirstOrderStart({
          membershipStatus: status,
          orderRow: { id: 3, source_type: "client_created" },
        }),
        "skip_wrong_status",
        status,
      );
    }
  });
});

describe("M4 service startMarketplaceMembershipOnFirstRealOrder (mocked client)", () => {
  function makeStartClient({ mem, order, updated }) {
    const calls = [];
    return {
      calls,
      query: async (sql, params) => {
        const s = String(sql);
        calls.push({ sql: s, params });
        if (/FROM freelancer_marketplace_memberships[\s\S]*FOR UPDATE/i.test(s)) {
          return { rows: mem ? [mem] : [] };
        }
        if (/FROM orders\s+WHERE id/i.test(s)) {
          return { rows: order ? [order] : [] };
        }
        if (/UPDATE freelancer_marketplace_memberships/i.test(s) && /purchased_pending_start/i.test(s)) {
          return { rows: updated ? [updated] : [] };
        }
        if (/INSERT INTO freelancer_marketplace_membership_audit/i.test(s) || /membership_audit/i.test(s)) {
          return { rows: [] };
        }
        if (/SELECT \* FROM freelancer_marketplace_memberships WHERE id/i.test(s)) {
          return { rows: [updated || mem] };
        }
        return { rows: [] };
      },
    };
  }

  it("B — pending-start + real order → active with term window + trigger id", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const mem = {
      id: 10,
      freelancer_user_id: 42,
      marketplace_plan_id: 3,
      is_current: true,
      status: "purchased_pending_start",
      paid_term_starts_at: null,
      paid_term_ends_at: null,
      first_order_started_at: null,
      start_trigger_order_id: null,
      purchased_at: new Date("2026-08-20T00:00:00.000Z"),
      started_at: null,
      cycle_anchor_day: null,
      cancel_at_period_end: false,
      auto_renew: false,
      source: "stripe",
    };
    const updated = {
      ...mem,
      status: "active",
      paid_term_starts_at: now,
      paid_term_ends_at: new Date(now.getTime() + 30 * 86400000),
      first_order_started_at: now,
      start_trigger_order_id: 501,
      started_at: now,
      cycle_anchor_day: 25,
    };
    const client = makeStartClient({
      mem,
      order: { id: 501, source_type: "client_created" },
      updated,
    });

    const planSpy = mock.method(
      require("../src/services/marketplaceMembershipPlansService"),
      "getMarketplaceMembershipPlanById",
      async () => ({
        id: 3,
        tierCode: "silver",
        cycleDurationDays: 30,
        priorityBidEnabled: false,
        priorityBidUsesPerCycle: 0,
      }),
    );
    const cycleSpy = mock.method(
      require("../src/services/marketplaceMembershipCyclesService"),
      "createAndActivateCycleForMembership",
      async () => ({ id: 1, cycleNumber: 1 }),
    );

    try {
      const out = await membershipsService.startMarketplaceMembershipOnFirstRealOrder({
        freelancerUserId: 42,
        orderId: 501,
        triggeredAt: now,
        client,
      });
      assert.equal(out.started, true);
      assert.equal(out.membership.status, "active");
      assert.ok(out.membership.paidTermStartsAt);
      assert.ok(out.membership.paidTermEndsAt);
      assert.equal(String(out.membership.startTriggerOrderId), "501");
      assert.match(String(out.reason), /first_real_order/);
    } finally {
      planSpy.mock.restore();
      cycleSpy.mock.restore();
    }
  });

  it("D — fake markers on orders row → no start", async () => {
    const client = makeStartClient({
      mem: {
        id: 10,
        freelancer_user_id: 42,
        marketplace_plan_id: 3,
        is_current: true,
        status: "purchased_pending_start",
        paid_term_starts_at: null,
        first_order_started_at: null,
      },
      order: { id: 9, source_type: "admin_created", is_fake: true },
      updated: null,
    });
    const out = await membershipsService.startMarketplaceMembershipOnFirstRealOrder({
      freelancerUserId: 42,
      orderId: 9,
      client,
    });
    assert.equal(out.started, false);
    assert.equal(out.reason, "non_real_order");
  });

  it("E — already active → idempotent noop", async () => {
    const started = new Date("2026-08-01T00:00:00.000Z");
    const client = makeStartClient({
      mem: {
        id: 10,
        freelancer_user_id: 42,
        marketplace_plan_id: 3,
        is_current: true,
        status: "active",
        paid_term_starts_at: started,
        first_order_started_at: started,
        start_trigger_order_id: 100,
      },
      order: { id: 200, source_type: "client_created" },
      updated: null,
    });
    const out = await membershipsService.startMarketplaceMembershipOnFirstRealOrder({
      freelancerUserId: 42,
      orderId: 200,
      client,
    });
    assert.equal(out.started, false);
    assert.equal(out.idempotent, true);
    assert.equal(out.reason, "already_active");
  });

  it("H — article assignment trigger starts without start_trigger_order_id", async () => {
    const now = new Date("2026-08-25T14:00:00.000Z");
    const mem = {
      id: 11,
      freelancer_user_id: 7,
      marketplace_plan_id: 4,
      is_current: true,
      status: "purchased_pending_start",
      paid_term_starts_at: null,
      paid_term_ends_at: null,
      first_order_started_at: null,
      start_trigger_order_id: null,
      started_at: null,
      cycle_anchor_day: null,
      cancel_at_period_end: false,
      auto_renew: false,
      source: "stripe",
    };
    const updated = {
      ...mem,
      status: "active",
      paid_term_starts_at: now,
      paid_term_ends_at: new Date(now.getTime() + 30 * 86400000),
      first_order_started_at: now,
      start_trigger_order_id: null,
      started_at: now,
      cycle_anchor_day: 25,
    };
    const client = makeStartClient({ mem, order: null, updated });
    const planSpy = mock.method(
      require("../src/services/marketplaceMembershipPlansService"),
      "getMarketplaceMembershipPlanById",
      async () => ({ id: 4, tierCode: "pro", cycleDurationDays: 30 }),
    );
    const cycleSpy = mock.method(
      require("../src/services/marketplaceMembershipCyclesService"),
      "createAndActivateCycleForMembership",
      async () => null,
    );
    try {
      const out = await membershipsService.startMarketplaceMembershipOnFirstRealOrder({
        freelancerUserId: 7,
        articleApplicationId: 888,
        triggerSource: "marketplace_article_application",
        triggeredAt: now,
        client,
      });
      assert.equal(out.started, true);
      assert.match(String(out.reason), /article/);
      assert.equal(out.membership.startTriggerOrderId, null);
    } finally {
      planSpy.mock.restore();
      cycleSpy.mock.restore();
    }
  });
});

describe("M4 wiring — lifecycle hooks in source", () => {
  it("wires start inside activateCurrentSubscriptionOnFirstAcceptedOrder (legacy path)", () => {
    const src = read("src/services/subscriptionsService.js");
    assert.match(src, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
    assert.match(src, /maybeStartMarketplaceMembershipOnFirstRealOrder/);
  });

  it("ordersService still uses legacy first-accepted activation (unchanged call sites)", () => {
    const src = read("src/services/ordersService.js");
    assert.match(src, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
    // Direct marketplace start stays centralized in subscriptionsService — not duplicated.
    assert.doesNotMatch(src, /startMarketplaceMembershipOnFirstRealOrder/);
  });

  it("marketplace article selection wires membership start", () => {
    const src = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(src, /maybeStartMembershipAfterArticleSelection/);
    assert.match(src, /triggerSource:\s*["']marketplace_article_application["']/);
    assert.match(src, /isApplicationEligibleStatus/);
    assert.match(src, /assertMarketplaceApplyGates/);
  });

  it("create/apply paths do not start term on submit alone", () => {
    const articleSrc = read("src/services/marketplaceArticleApplicationsService.js");
    const submitIdx = articleSrc.indexOf("async function submitArticleApplication");
    const helperIdx = articleSrc.indexOf("async function maybeStartMembershipAfterArticleSelection");
    const selectIdx = articleSrc.indexOf("async function selectArticleApplication");
    assert.ok(submitIdx > 0 && selectIdx > submitIdx);
    // Exclude the M4 helper definition that sits just above select.
    const submitEnd = helperIdx > submitIdx && helperIdx < selectIdx ? helperIdx : selectIdx;
    const submitBody = articleSrc.slice(submitIdx, submitEnd);
    assert.doesNotMatch(submitBody, /maybeStartMembershipAfterArticleSelection/);
    assert.doesNotMatch(submitBody, /startMarketplaceMembershipOnFirstRealOrder/);
    assert.doesNotMatch(submitBody, /await maybeStartMembershipAfterArticleSelection/);
  });

  it("snapshot exposes pending-start M5 fields", () => {
    const src = read("src/services/marketplaceMembershipsService.js");
    assert.match(src, /termStarted/);
    assert.match(src, /canApply/);
    assert.match(src, /messageKey/);
    assert.match(src, /marketplace_membership\.purchased_pending_start/);
    assert.match(src, /PURCHASED_PENDING_START_MESSAGE_AR/);
  });

  it("F — admin createAndActivate export preserved", () => {
    assert.equal(typeof membershipsService.createAndActivateMarketplaceMembership, "function");
    assert.equal(typeof membershipsService.createPurchasedPendingStartMembership, "function");
  });
});

describe("M4 I — M2/M3 regression (static + message)", () => {
  it("checkout session create path still does not grant membership", () => {
    const src = read("src/services/marketplaceMembershipCheckoutService.js");
    const createIdx = src.indexOf("async function createMarketplaceMembershipCheckoutSession");
    const applyIdx = src.indexOf("async function applyMarketplaceMembershipCheckoutSessionCompleted");
    assert.ok(createIdx > 0 && applyIdx > createIdx);
    const createBody = src.slice(createIdx, applyIdx);
    assert.match(createBody, /mode:\s*MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE|mode:\s*["']payment["']/);
    assert.doesNotMatch(createBody, /createPurchasedPendingStartMembership/);
    assert.doesNotMatch(createBody, /createAndActivateMarketplaceMembership/);
    assert.match(createBody, /termStarted:\s*false/);
  });

  it("webhook grant path still creates purchased_pending_start only", () => {
    const webhook = read("src/controllers/stripeWebhookController.js");
    const checkoutSvc = read("src/services/marketplaceMembershipCheckoutService.js");
    assert.match(webhook, /applyMarketplaceMembershipCheckoutSessionCompleted/);
    assert.match(checkoutSvc, /createPurchasedPendingStartMembership/);
    assert.match(checkoutSvc, /purchased_pending_start|termStarted:\s*false/);
  });

  it("Arabic pending-start copy still present for M5", () => {
    assert.match(PURCHASED_PENDING_START_MESSAGE_AR, /تم شراء العضوية/);
    assert.match(PURCHASED_PENDING_START_MESSAGE_AR, /أول طلب/);
  });
});
