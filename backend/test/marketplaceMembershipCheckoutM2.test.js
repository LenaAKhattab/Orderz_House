/**
 * Marketplace-M2 — Stripe Checkout for paid marketplace memberships.
 * Mocks Stripe only. No real Stripe / Production / webhook / grant.
 *
 * Run: node --test test/marketplaceMembershipCheckoutM2.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_membership_m2_placeholder";
process.env.CLIENT_URL = process.env.CLIENT_URL || "https://example-orderzhouse.test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_marketplace_m2_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE,
  MEMBERSHIP_CHECKOUT_SUCCESS_PAGE_CAN_GRANT,
  MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES,
  buildMarketplaceMembershipCheckoutIdempotencyKey,
} = require("../src/constants/marketplaceMembershipCheckout");
const { PAYMENT_CONTEXT } = require("../src/utils/fazaatStripeMetadata");
const {
  buildFreelancerMarketplaceMembershipCheckoutReturnUrls,
} = require("../src/config/clientUrl");
const {
  createMarketplaceMembershipCheckoutSession,
  resolvePaidMarketplacePlanForCheckout,
} = require("../src/services/marketplaceMembershipCheckoutService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function paidPlan(tierCode, overrides = {}) {
  return {
    id: overrides.id || 10,
    tierCode,
    nameAr: overrides.nameAr || tierCode,
    nameEn: overrides.nameEn || tierCode.toUpperCase(),
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    monthlyPriceJod: overrides.monthlyPriceJod != null ? overrides.monthlyPriceJod : 19,
    cycleDurationDays: overrides.cycleDurationDays != null ? overrides.cycleDurationDays : 30,
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
          return {
            id: "cs_test_m2_session",
            url: "https://checkout.stripe.test/pay/cs_test_m2_session",
          };
        },
      },
    },
  };
}

function mockDb(user = { id: 42, role: "freelancer", is_active: true, email: "f@example.com" }) {
  return {
    query: async () => ({ rows: user ? [user] : [] }),
  };
}

describe("M2 constants + return URLs", () => {
  it("locks one-time payment + no grant on success page", () => {
    assert.equal(MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE, "payment");
    assert.equal(MARKETPLACE_MEMBERSHIP_CHECKOUT_FLOW, "marketplace_membership");
    assert.equal(MARKETPLACE_MEMBERSHIP_CHECKOUT_PURPOSE, "marketplace_membership_checkout");
    assert.equal(MARKETPLACE_MEMBERSHIP_CHECKOUT_CURRENCY, "JOD");
    assert.equal(MEMBERSHIP_CHECKOUT_SUCCESS_PAGE_CAN_GRANT, "NO");
    assert.equal(PAYMENT_CONTEXT.MARKETPLACE_MEMBERSHIP, "marketplace_membership");
  });

  it("builds membershipCheckout success/cancel URLs", () => {
    const urls = buildFreelancerMarketplaceMembershipCheckoutReturnUrls(
      "https://example-orderzhouse.test",
    );
    assert.match(urls.successUrl, /membershipCheckout=success/);
    assert.match(urls.cancelUrl, /membershipCheckout=cancelled/);
    assert.match(urls.successUrl, /session_id=\{CHECKOUT_SESSION_ID\}/);
  });

  it("builds idempotency key", () => {
    assert.equal(
      buildMarketplaceMembershipCheckoutIdempotencyKey(7, 3, "abc"),
      "marketplace_membership_checkout:freelancer:7:plan:3:abc",
    );
  });
});

describe("M2 resolve paid plan", () => {
  it("accepts SILVER/PRO/ELITE", async () => {
    for (const code of ["SILVER", "pro", "Elite"]) {
      const out = await resolvePaidMarketplacePlanForCheckout(code, {
        getPlanByTierCode: async (c) =>
          paidPlan(c, { monthlyPriceJod: code.toLowerCase() === "elite" ? 59 : 19 }),
      });
      assert.equal(out.planCode, code.toLowerCase());
      assert.ok(out.expectedAmountMinor > 0);
      assert.equal(out.durationDays, 30);
    }
  });

  it("rejects STARTER", async () => {
    await assert.rejects(
      () =>
        resolvePaidMarketplacePlanForCheckout("STARTER", {
          getPlanByTierCode: async () => paidPlan("starter", { monthlyPriceJod: 0 }),
        }),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.STARTER_NOT_STRIPE,
    );
  });

  it("rejects unknown / inactive / zero-price", async () => {
    await assert.rejects(
      () =>
        resolvePaidMarketplacePlanForCheckout("gold", {
          getPlanByTierCode: async () => null,
        }),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.INVALID_PLAN_CODE,
    );
    await assert.rejects(
      () =>
        resolvePaidMarketplacePlanForCheckout("silver", {
          getPlanByTierCode: async () => null,
        }),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.PLAN_NOT_FOUND,
    );
    await assert.rejects(
      () =>
        resolvePaidMarketplacePlanForCheckout("silver", {
          getPlanByTierCode: async () => paidPlan("silver", { isActive: false }),
        }),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.PLAN_INACTIVE,
    );
    await assert.rejects(
      () =>
        resolvePaidMarketplacePlanForCheckout("silver", {
          getPlanByTierCode: async () => paidPlan("silver", { monthlyPriceJod: 0 }),
        }),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.INVALID_PRICE,
    );
  });
});

describe("M2 create checkout session (mocked Stripe)", () => {
  it("SILVER creates mode=payment session with marketplace metadata", async () => {
    const capture = {};
    const result = await createMarketplaceMembershipCheckoutSession(
      { freelancerUserId: 42, planCode: "SILVER" },
      {
        stripe: mockStripe(capture),
        db: mockDb(),
        getPlanByTierCode: async () => paidPlan("silver", { id: 11, monthlyPriceJod: 19 }),
      },
    );
    assert.equal(result.checkoutUrl, "https://checkout.stripe.test/pay/cs_test_m2_session");
    assert.equal(result.sessionId, "cs_test_m2_session");
    assert.equal(result.membershipGranted, false);
    assert.equal(result.termStarted, false);
    assert.equal(result.mode, "payment");
    assert.equal(capture.params.mode, "payment");
    assert.equal(capture.params.metadata.flow, "marketplace_membership");
    assert.equal(capture.params.metadata.payment_context, "marketplace_membership");
    assert.equal(capture.params.metadata.plan_code, "silver");
    assert.equal(capture.params.metadata.freelancerUserId || capture.params.metadata.user_id, "42");
    assert.equal(capture.params.metadata.duration_days, "30");
    assert.equal(capture.params.metadata.termStartPolicy, "first_real_order");
    assert.match(capture.params.success_url, /membershipCheckout=success/);
    assert.match(String(capture.opts?.idempotencyKey || ""), /marketplace_membership_checkout/);
  });

  it("PRO and ELITE also create checkout", async () => {
    for (const [code, price] of [
      ["PRO", 39],
      ["ELITE", 59],
    ]) {
      const capture = {};
      const result = await createMarketplaceMembershipCheckoutSession(
        { freelancerUserId: 42, planCode: code },
        {
          stripe: mockStripe(capture),
          db: mockDb(),
          getPlanByTierCode: async (c) => paidPlan(c, { monthlyPriceJod: price }),
        },
      );
      assert.ok(result.checkoutUrl);
      assert.equal(capture.params.mode, "payment");
      assert.equal(capture.params.metadata.plan_code, code.toLowerCase());
    }
  });

  it("STARTER does not create Stripe session", async () => {
    let called = false;
    await assert.rejects(
      () =>
        createMarketplaceMembershipCheckoutSession(
          { freelancerUserId: 42, planCode: "starter" },
          {
            stripe: {
              checkout: {
                sessions: {
                  create: async () => {
                    called = true;
                    return {};
                  },
                },
              },
            },
            db: mockDb(),
            getPlanByTierCode: async () => paidPlan("starter", { monthlyPriceJod: 0 }),
          },
        ),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.STARTER_NOT_STRIPE,
    );
    assert.equal(called, false);
  });

  it("rejects non-freelancer / inactive", async () => {
    await assert.rejects(
      () =>
        createMarketplaceMembershipCheckoutSession(
          { freelancerUserId: 99, planCode: "silver" },
          {
            stripe: mockStripe({}),
            db: mockDb({ id: 99, role: "client", is_active: true, email: "c@x.com" }),
            getPlanByTierCode: async () => paidPlan("silver"),
          },
        ),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.FREELANCER_INVALID,
    );
  });

  it("rejects invalid freelancer id (unauthorized shape)", async () => {
    await assert.rejects(
      () =>
        createMarketplaceMembershipCheckoutSession(
          { freelancerUserId: null, planCode: "silver" },
          { stripe: mockStripe({}), db: mockDb(), getPlanByTierCode: async () => paidPlan("silver") },
        ),
      (err) => err.publicCode === MARKETPLACE_MEMBERSHIP_CHECKOUT_ERROR_CODES.FREELANCER_INVALID,
    );
  });
});

describe("M2 wiring isolation — no grant / no activation request", () => {
  it("checkout create path does not grant membership or create activation request", () => {
    const svc = read("src/services/marketplaceMembershipCheckoutService.js");
    const createFn = svc.slice(
      svc.indexOf("async function createMarketplaceMembershipCheckoutSession"),
      svc.indexOf("async function applyMarketplaceMembershipCheckoutSessionCompleted"),
    );
    assert.doesNotMatch(createFn, /createPurchasedPendingStartMembership\s*\(/);
    assert.doesNotMatch(createFn, /createAndActivateMarketplaceMembership\s*\(/);
    assert.doesNotMatch(createFn, /createActivationRequest\s*\(/);
    assert.doesNotMatch(createFn, /INSERT\s+INTO\s+freelancer_marketplace_memberships/i);
    assert.match(createFn, /mode:\s*MARKETPLACE_MEMBERSHIP_CHECKOUT_MODE/);
    assert.match(svc, /applyMarketplaceMembershipCheckoutSessionCompleted/);
  });

  it("routes mount checkout under freelancer auth + role", () => {
    const routes = read("src/routes/freelancerMarketplaceMembershipRoutes.js");
    assert.match(routes, /requireAuth/);
    assert.match(routes, /requireRole\("freelancer"\)/);
    assert.match(routes, /\/marketplace-membership\/checkout/);
    assert.match(routes, /\/marketplace-memberships\/checkout/);
    assert.match(routes, /createMarketplaceMembershipCheckout/);
  });

  it("controller does not grant on checkout", () => {
    const ctrl = read("src/controllers/marketplaceMembershipsController.js");
    assert.match(ctrl, /createMarketplaceMembershipCheckout/);
    assert.match(ctrl, /Does NOT grant membership/);
    assert.doesNotMatch(
      ctrl.slice(ctrl.indexOf("createMarketplaceMembershipCheckout")),
      /createPurchasedPendingStartMembership|createAndActivateMarketplaceMembership|createActivationRequest/,
    );
  });

  it("frontend API helper exists but does not wire buttons in FreelancerPlansPage", () => {
    const api = read("../frontend/src/services/api.js");
    assert.match(api, /createMarketplaceMembershipCheckoutRequest/);
    assert.match(api, /\/freelancer\/marketplace-membership\/checkout/);
    const plansPage = read("../frontend/src/pages/dashboard/FreelancerPlansPage.jsx");
    assert.doesNotMatch(plansPage, /createMarketplaceMembershipCheckoutRequest/);
  });
});
