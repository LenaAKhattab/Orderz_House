/**
 * Marketplace-M3 — Stripe webhook grants purchased_pending_start.
 * Mocked only. No live Stripe / Production / migrations / deploy.
 *
 * Run: node --test test/marketplaceMembershipWebhookM3.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_membership_m3_placeholder";
process.env.CLIENT_URL = process.env.CLIENT_URL || "https://example-orderzhouse.test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_marketplace_m3_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
} = require("../src/constants/marketplaceMembershipCheckout");
const {
  applyMarketplaceMembershipCheckoutSessionCompleted,
} = require("../src/services/marketplaceMembershipCheckoutService");
const { applyCheckoutSessionCompleted } = require("../src/controllers/stripeWebhookController");
const { amountMajorToStripeMinor } = require("../src/utils/stripeMoney");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function paidPlan(tierCode, overrides = {}) {
  const price =
    overrides.monthlyPriceJod != null
      ? overrides.monthlyPriceJod
      : tierCode === "elite"
        ? 59
        : tierCode === "pro"
          ? 39
          : 19;
  return {
    id: overrides.id || 11,
    tierCode,
    nameAr: tierCode,
    nameEn: tierCode.toUpperCase(),
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    monthlyPriceJod: price,
    cycleDurationDays: overrides.cycleDurationDays != null ? overrides.cycleDurationDays : 30,
    saleEnabled: false,
    ...overrides,
  };
}

function baseMeta(plan, freelancerUserId = 42) {
  const expectedAmountMinor = amountMajorToStripeMinor(plan.monthlyPriceJod, "JOD");
  return {
    purpose: MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
    flow: MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
    payment_context: MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
    freelancerUserId: String(freelancerUserId),
    user_id: String(freelancerUserId),
    marketplacePlanId: String(plan.id),
    marketplace_plan_id: String(plan.id),
    plan_code: plan.tierCode,
    planCode: plan.tierCode,
    duration_days: String(plan.cycleDurationDays),
    expected_amount_minor: String(expectedAmountMinor),
    currency: "JOD",
    termStartPolicy: "first_real_order",
  };
}

function paidSession(plan, overrides = {}) {
  const meta = { ...baseMeta(plan, overrides.freelancerUserId || 42), ...(overrides.metadata || {}) };
  const expectedAmountMinor = amountMajorToStripeMinor(plan.monthlyPriceJod, "JOD");
  return {
    id: overrides.id || "cs_test_m3_silver",
    mode: overrides.mode || "payment",
    payment_status: overrides.payment_status || "paid",
    amount_total: overrides.amount_total != null ? overrides.amount_total : expectedAmountMinor,
    currency: overrides.currency || "jod",
    created: overrides.created != null ? overrides.created : 1724587200,
    metadata: meta,
  };
}

function mockGrantStore() {
  const byRef = new Map();
  return {
    byRef,
    createPurchasedPendingStartMembership: async (input) => {
      const ref = input.purchasePaymentReference;
      if (ref && byRef.has(ref)) {
        return { membership: byRef.get(ref), created: false, idempotentReplay: true };
      }
      if (input._failCode) {
        const err = new Error(input._failCode);
        err.publicCode = input._failCode;
        throw err;
      }
      const membership = {
        id: String(100 + byRef.size),
        freelancerUserId: String(input.freelancerUserId),
        marketplacePlanId: String(input.marketplacePlanId),
        status: "purchased_pending_start",
        purchasedAt: input.now || input.purchasedAt || new Date(),
        paidTermStartsAt: null,
        paidTermEndsAt: null,
        firstOrderStartedAt: null,
        startTriggerOrderId: null,
        purchasePaymentReference: ref,
        source: input.source || "stripe",
      };
      if (ref) byRef.set(ref, membership);
      return { membership, created: true, idempotentReplay: false };
    },
  };
}

describe("M3 webhook grant — happy path", () => {
  it("SILVER paid session grants purchased_pending_start with null term dates", async () => {
    const plan = paidPlan("silver");
    const store = mockGrantStore();
    const session = paidSession(plan);
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      {
        getPlanById: async () => plan,
        getPlanByTierCode: async () => plan,
        createPurchasedPendingStartMembership: store.createPurchasedPendingStartMembership,
      },
    );
    assert.equal(out.status, "applied");
    assert.equal(out.created, true);
    assert.equal(out.termStarted, false);
    assert.equal(out.membership.status, "purchased_pending_start");
    assert.equal(out.membership.paidTermStartsAt, null);
    assert.equal(out.membership.paidTermEndsAt, null);
    assert.equal(out.membership.firstOrderStartedAt, null);
    assert.equal(out.membership.startTriggerOrderId, null);
    assert.ok(out.membership.purchasedAt);
    assert.equal(out.membership.purchasePaymentReference, "cs_test_m3_silver");
    assert.equal(out.membership.source, "stripe");
  });

  it("PRO and ELITE are accepted", async () => {
    for (const code of ["pro", "elite"]) {
      const plan = paidPlan(code, { id: code === "pro" ? 12 : 13 });
      const store = mockGrantStore();
      const session = paidSession(plan, { id: `cs_test_m3_${code}` });
      const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
        session,
        session.metadata,
        null,
        {
          getPlanById: async () => plan,
          createPurchasedPendingStartMembership: store.createPurchasedPendingStartMembership,
        },
      );
      assert.equal(out.status, "applied");
      assert.equal(out.membership.status, "purchased_pending_start");
    }
  });
});

describe("M3 webhook grant — rejections", () => {
  it("STARTER is ignored", async () => {
    const plan = paidPlan("starter", { monthlyPriceJod: 0, id: 1 });
    const store = mockGrantStore();
    let granted = false;
    const session = paidSession(plan, {
      id: "cs_test_starter",
      metadata: {
        purpose: MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
        flow: MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
        plan_code: "starter",
        planCode: "starter",
        freelancerUserId: "42",
        marketplacePlanId: "1",
      },
      amount_total: 0,
    });
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      {
        getPlanById: async () => plan,
        createPurchasedPendingStartMembership: async () => {
          granted = true;
          return store.createPurchasedPendingStartMembership({});
        },
      },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "marketplace_membership_starter_not_stripe");
    assert.equal(granted, false);
  });

  it("unpaid session does not grant", async () => {
    const plan = paidPlan("silver");
    let granted = false;
    const session = paidSession(plan, { payment_status: "unpaid" });
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      {
        getPlanById: async () => plan,
        createPurchasedPendingStartMembership: async () => {
          granted = true;
        },
      },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "marketplace_membership_checkout_not_paid");
    assert.equal(granted, false);
  });

  it("invalid metadata / missing freelancer does not grant", async () => {
    const plan = paidPlan("silver");
    const expectedAmountMinor = amountMajorToStripeMinor(plan.monthlyPriceJod, "JOD");
    const session = {
      id: "cs_test_m3_nofreelancer",
      mode: "payment",
      payment_status: "paid",
      amount_total: expectedAmountMinor,
      currency: "jod",
      metadata: {
        purpose: MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
        flow: MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
        plan_code: "silver",
        marketplacePlanId: "11",
        expected_amount_minor: String(expectedAmountMinor),
      },
    };
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      { getPlanById: async () => plan },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "marketplace_membership_invalid_freelancer");
  });

  it("amount mismatch does not grant", async () => {
    const plan = paidPlan("silver");
    let granted = false;
    const session = paidSession(plan, { amount_total: 1 });
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      {
        getPlanById: async () => plan,
        createPurchasedPendingStartMembership: async () => {
          granted = true;
        },
      },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "marketplace_membership_amount_mismatch");
    assert.equal(granted, false);
  });

  it("currency mismatch does not grant", async () => {
    const plan = paidPlan("silver");
    const session = paidSession(plan, { currency: "usd" });
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      { getPlanById: async () => plan },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "marketplace_membership_currency_mismatch");
  });

  it("non-freelancer grant failure is ignored safely", async () => {
    const plan = paidPlan("silver");
    const session = paidSession(plan);
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      {
        getPlanById: async () => plan,
        createPurchasedPendingStartMembership: async () => {
          const err = new Error("not freelancer");
          err.publicCode = "MEMBERSHIP_FREELANCER_INVALID";
          throw err;
        },
      },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "marketplace_membership_freelancer_invalid");
  });

  it("flow mismatch / wrong purpose ignored", async () => {
    const plan = paidPlan("silver");
    const session = paidSession(plan, {
      metadata: {
        purpose: MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
        flow: "bid_credit_package",
        freelancerUserId: "42",
        marketplacePlanId: "11",
        plan_code: "silver",
      },
    });
    const out = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      { getPlanById: async () => plan },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "marketplace_membership_flow_mismatch");
  });
});

describe("M3 idempotency + no term start", () => {
  it("same session twice yields one membership / already_applied", async () => {
    const plan = paidPlan("silver");
    const store = mockGrantStore();
    const session = paidSession(plan, { id: "cs_test_idem" });
    const deps = {
      getPlanById: async () => plan,
      createPurchasedPendingStartMembership: store.createPurchasedPendingStartMembership,
    };
    const first = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      deps,
    );
    const second = await applyMarketplaceMembershipCheckoutSessionCompleted(
      session,
      session.metadata,
      null,
      deps,
    );
    assert.equal(first.status, "applied");
    assert.equal(second.status, "already_applied");
    assert.equal(first.membership.id, second.membership.id);
    assert.equal(store.byRef.size, 1);
    assert.equal(second.membership.paidTermStartsAt, null);
    assert.equal(second.membership.paidTermEndsAt, null);
  });

  it("webhook path does not call term-start helper", () => {
    const svc = read("src/services/marketplaceMembershipCheckoutService.js");
    assert.match(svc, /applyMarketplaceMembershipCheckoutSessionCompleted/);
    assert.doesNotMatch(svc, /startMarketplaceMembershipOnFirstRealOrder\s*\(/);
    assert.match(svc, /purchased_pending_start/);
  });
});

describe("M3 controller routing + isolation", () => {
  it("applyCheckoutSessionCompleted routes marketplace_membership_checkout", async () => {
    const ctrl = read("src/controllers/stripeWebhookController.js");
    assert.match(ctrl, /marketplace_membership_checkout/);
    assert.match(ctrl, /applyMarketplaceMembershipCheckoutSessionCompleted/);
  });

  it("unknown purpose still ignored; bid package path intact", () => {
    const ctrl = read("src/controllers/stripeWebhookController.js");
    assert.match(ctrl, /bid_credit_package_purchase/);
    assert.match(ctrl, /freelancer_subscription_purchase/);
    assert.match(ctrl, /unknown_checkout_purpose/);
  });

  it("does not create activation requests from webhook grant path", () => {
    const svc = read("src/services/marketplaceMembershipCheckoutService.js");
    assert.doesNotMatch(svc, /createActivationRequest\s*\(/);
    assert.doesNotMatch(svc, /createAndActivateMarketplaceMembership\s*\(/);
  });

  it("dispatcher returns ignored for unrelated purpose without grant", async () => {
    const out = await applyCheckoutSessionCompleted(
      {
        id: "cs_other",
        payment_status: "paid",
        metadata: { purpose: "something_else" },
      },
      {
        connect: async () => ({
          query: async () => ({ rows: [] }),
          release: () => {},
        }),
      },
    );
    assert.equal(out.status, "ignored");
    assert.equal(out.reason, "unknown_checkout_purpose");
  });
});
