/**
 * Activation fee hardening: audit table, concurrent/stale sessions, admin offline, free plan.
 * Run: npm run test:subscription-activation-fee-hardening  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/subscription_activation_fee_hardening_test";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  SUBSCRIPTION_ACTIVATION_FEE_JOD,
  ACTIVATION_FEE_VALIDITY_DAYS,
  ACTIVATION_FEE_SOURCES,
  CHECKOUT_KIND,
  CHECKOUT_SESSION_STATUS,
  PURPOSE_ACTIVATION_FEE_ONLY,
  PURPOSE_SUBSCRIPTION_PURCHASE,
  isActivationFeeCurrent,
  activationFeeMinorUnits,
  recordActivationFeePayment,
  recordActivationFeeFromStripeSession,
  markActivationFeePaidOffline,
  freelancerNeedsSubscriptionActivationFee,
  prepareFreelancerCheckoutSessionCreation,
  supersedeOpenCheckoutSessions,
  isFreeDisplayPlanEligibleForActivationFeeCheckout,
} = require("../src/services/subscriptionActivationFeeService");

function createMockClient(handlers) {
  return {
    query: async (sql, params) => {
      const key = String(sql).replace(/\s+/g, " ").trim();
      for (const [pattern, fn] of handlers) {
        if (typeof pattern === "string" ? key.includes(pattern) : pattern.test(key)) {
          return fn(sql, params);
        }
      }
      throw new Error(`Unexpected query: ${key.slice(0, 120)}`);
    },
  };
}

describe("rolling 365-day activation fee rule", () => {
  it("requires fee again after 365 days", () => {
    const paidAt = new Date("2026-01-01T12:00:00Z");
    const within = new Date("2026-06-22T12:00:00Z");
    const after = new Date("2027-01-02T12:00:00Z");
    assert.strictEqual(isActivationFeeCurrent(paidAt, within), true);
    assert.strictEqual(isActivationFeeCurrent(paidAt, after), false);
    assert.strictEqual(ACTIVATION_FEE_VALIDITY_DAYS, 365);
    assert.strictEqual(SUBSCRIPTION_ACTIVATION_FEE_JOD, 25);
    assert.strictEqual(activationFeeMinorUnits(), 25000);
  });
});

describe("recordActivationFeePayment idempotency", () => {
  it("records stripe payment once per session id", async () => {
    const payments = [];
    let userPaidAt = null;
    const client = createMockClient([
      ["subscription_activation_fee_payments WHERE stripe_session_id", () => ({ rows: [] })],
      ["subscription_activation_fee_payments WHERE stripe_payment_intent_id", () => ({ rows: [] })],
      [
        "INSERT INTO subscription_activation_fee_payments",
        (_sql, params) => {
          const row = {
            id: 1,
            user_id: params[0],
            stripe_session_id: params[1],
            stripe_payment_intent_id: params[2],
            amount_minor: params[3],
          };
          payments.push(row);
          return { rows: [row] };
        },
      ],
      [
        "UPDATE users",
        (_sql, params) => {
          userPaidAt = params[1];
          return { rows: [] };
        },
      ],
    ]);

    const first = await recordActivationFeePayment(
      {
        userId: 42,
        stripeSessionId: "cs_test_1",
        stripePaymentIntentId: "pi_test_1",
        amountMinor: 25000,
        source: ACTIVATION_FEE_SOURCES.STRIPE,
      },
      client,
    );
    assert.strictEqual(first.recorded, true);
    assert.strictEqual(payments.length, 1);
    assert.ok(userPaidAt);

    const duplicateClient = createMockClient([
      ["subscription_activation_fee_payments WHERE stripe_session_id", () => ({ rows: [{ id: 1 }] })],
    ]);
    const second = await recordActivationFeePayment(
      { userId: 42, stripeSessionId: "cs_test_1", amountMinor: 25000 },
      duplicateClient,
    );
    assert.strictEqual(second.recorded, false);
    assert.strictEqual(second.duplicate, true);
  });
});

describe("recordActivationFeeFromStripeSession", () => {
  it("skips recording when activation fee is already current (stale session protection)", async () => {
    const recent = new Date("2026-06-01T12:00:00Z");
    const client = createMockClient([
      [
        "FROM users u",
        () => ({
          rows: [{ user_paid_at: recent, audit_paid_at: recent }],
        }),
      ],
    ]);
    const result = await recordActivationFeeFromStripeSession(
      {
        freelancerUserId: 7,
        stripeSessionId: "cs_stale",
        stripePaymentIntentId: "pi_stale",
        activationFeeMinor: 25000,
        paidAt: new Date("2026-06-22T12:00:00Z"),
      },
      client,
    );
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, "activation_fee_already_current");
  });
});

describe("markActivationFeePaidOffline", () => {
  it("creates admin_offline audit record and updates user timestamp", async () => {
    let insertedSource = null;
    const client = createMockClient([
      ["FROM users u", () => ({ rows: [{ user_paid_at: null, audit_paid_at: null }] })],
      ["subscription_activation_fee_payments WHERE stripe_session_id", () => ({ rows: [] })],
      ["subscription_activation_fee_payments WHERE stripe_payment_intent_id", () => ({ rows: [] })],
      [
        "INSERT INTO subscription_activation_fee_payments",
        (_sql, params) => {
          insertedSource = params[6];
          return { rows: [{ id: 9, source: params[6], user_id: params[0] }] };
        },
      ],
      ["UPDATE users", () => ({ rows: [] })],
    ]);

    const result = await markActivationFeePaidOffline(
      { adminUserId: 1, freelancerUserId: 55, notes: "paid at office" },
      client,
    );
    assert.strictEqual(result.recorded, true);
    assert.strictEqual(insertedSource, ACTIVATION_FEE_SOURCES.ADMIN_OFFLINE);
  });

  it("does not create duplicate when fee already current", async () => {
    const recent = new Date("2026-06-01T12:00:00Z");
    const client = createMockClient([
      ["FROM users u", () => ({ rows: [{ user_paid_at: recent, audit_paid_at: recent }] })],
    ]);
    const result = await markActivationFeePaidOffline(
      { adminUserId: 1, freelancerUserId: 55 },
      client,
    );
    assert.strictEqual(result.recorded, false);
    assert.strictEqual(result.alreadyPaid, true);
  });
});

describe("freelancerNeedsSubscriptionActivationFee", () => {
  it("new freelancer needs activation fee", async () => {
    const client = createMockClient([
      ["FROM users u", () => ({ rows: [{ user_paid_at: null, audit_paid_at: null }] })],
    ]);
    assert.strictEqual(await freelancerNeedsSubscriptionActivationFee(10, client), true);
  });

  it("paid freelancer within 365 days does not need fee again", async () => {
    const recent = new Date("2026-06-01T12:00:00Z");
    const client = createMockClient([
      ["FROM users u", () => ({ rows: [{ user_paid_at: recent, audit_paid_at: recent }] })],
    ]);
    assert.strictEqual(
      await freelancerNeedsSubscriptionActivationFee(10, client, new Date("2026-06-22T12:00:00Z")),
      false,
    );
  });
});

describe("prepareFreelancerCheckoutSessionCreation prevents concurrent fee-bearing sessions", () => {
  it("supersedes open checkout sessions before creating a new one", async () => {
    const updates = [];
    const mockStripe = {
      checkout: {
        sessions: {
          retrieve: async () => ({ status: "open" }),
          expire: async () => ({}),
        },
      },
    };
    const client = createMockClient([
      ["SELECT id FROM users WHERE id", () => ({ rows: [{ id: 99 }] })],
      [
        "FROM freelancer_subscription_checkout_sessions",
        () => ({
          rows: [
            { id: 1, stripe_session_id: "cs_old_1", includes_activation_fee: true, checkout_kind: "subscription" },
            { id: 2, stripe_session_id: "cs_old_2", includes_activation_fee: false, checkout_kind: "subscription" },
          ],
        }),
      ],
      [
        "UPDATE freelancer_subscription_checkout_sessions",
        (_sql, params) => {
          updates.push({ id: params[0], status: params[1] });
          return { rows: [] };
        },
      ],
      ["FROM users u", () => ({ rows: [{ user_paid_at: null, audit_paid_at: null }] })],
    ]);

    const result = await prepareFreelancerCheckoutSessionCreation(
      { stripe: mockStripe, freelancerUserId: 99 },
      client,
    );
    assert.strictEqual(result.needsActivationFee, true);
    assert.strictEqual(result.superseded.length, 2);
    assert.strictEqual(updates.length, 2);
    assert.ok(updates.every((u) => u.status === CHECKOUT_SESSION_STATUS.EXPIRED));
  });
});

describe("supersedeOpenCheckoutSessions feeBearingOnly filter", () => {
  it("only supersedes fee-bearing sessions when feeBearingOnly=true", async () => {
    const updates = [];
    const client = createMockClient([
      [
        "FROM freelancer_subscription_checkout_sessions",
        () => ({
          rows: [{ id: 5, stripe_session_id: "cs_fee", includes_activation_fee: true }],
        }),
      ],
      [
        "UPDATE freelancer_subscription_checkout_sessions",
        (_sql, params) => {
          updates.push(params);
          return { rows: [] };
        },
      ],
    ]);

    await supersedeOpenCheckoutSessions(
      { stripe: null, freelancerUserId: 1, feeBearingOnly: true },
      client,
    );
    assert.strictEqual(updates.length, 1);
  });
});

describe("free plan activation-fee-only checkout eligibility", () => {
  it("free visible active plan is eligible for activation-fee-only path", () => {
    assert.strictEqual(
      isFreeDisplayPlanEligibleForActivationFeeCheckout({
        deleted_at: null,
        is_active: true,
        is_visible: true,
        price_jod: 0,
      }),
      true,
    );
    assert.strictEqual(
      isFreeDisplayPlanEligibleForActivationFeeCheckout({
        deleted_at: null,
        is_active: true,
        is_visible: true,
        price_jod: 25,
      }),
      false,
    );
  });
});

describe("checkout and webhook wiring", () => {
  const checkoutPath = path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js");
  const webhookPath = path.join(__dirname, "..", "src", "controllers", "stripeWebhookController.js");
  const subsPath = path.join(__dirname, "..", "src", "services", "subscriptionsService.js");
  const adminRoutesPath = path.join(__dirname, "..", "src", "routes", "adminSubscriptionsRoutes.js");
  const migrationPath = path.join(
    __dirname,
    "..",
    "sql",
    "migrations",
    "091_subscription_activation_fee_audit_and_checkout_sessions.sql",
  );

  it("new paid plan checkout includes plan line + activation fee helpers", () => {
    const src = fs.readFileSync(checkoutPath, "utf8");
    assert.ok(src.includes("prepareFreelancerCheckoutSessionCreation"));
    assert.ok(src.includes("trackFreelancerCheckoutSession"));
    assert.ok(src.includes("buildActivationFeeStripeLineItem"));
    assert.ok(src.includes("planAmountMinor"));
    assert.ok(src.includes("activationFeeMinor"));
    assert.ok(src.includes("needsActivationFee ? activationMinor : 0"));
  });

  it("checkout skips activation fee when not needed (upgrade same year)", () => {
    const src = fs.readFileSync(checkoutPath, "utf8");
    assert.ok(src.includes("needsActivationFee ? activationMinor : 0"));
    assert.ok(src.includes("if (needsActivationFee)"));
    assert.ok(src.includes("lineItems.push(buildActivationFeeStripeLineItem"));
  });

  it("tracks checkout sessions and supersedes on confirm", () => {
    const src = fs.readFileSync(checkoutPath, "utf8");
    assert.ok(src.includes("recordActivationFeeFromStripeSession"));
    assert.ok(src.includes("markCheckoutSessionStatus"));
    assert.ok(src.includes("supersedeOpenCheckoutSessions"));
    assert.ok(!src.includes("recordSubscriptionActivationFeePaid(freelancerUserId"));
  });

  it("webhook records fee via audit helper and handles activation-fee-only purpose", () => {
    const src = fs.readFileSync(webhookPath, "utf8");
    assert.ok(src.includes("recordActivationFeeFromStripeSession"));
    assert.ok(src.includes("applyCheckoutSessionFreelancerActivationFeeOnlyCompleted"));
    assert.ok(src.includes("PURPOSE_ACTIVATION_FEE_ONLY"));
    assert.ok(!src.includes("recordSubscriptionActivationFeePaid(freelancerUserId"));
  });

  it("free plan routes to activation-fee-only checkout when fee is due", () => {
    const src = fs.readFileSync(checkoutPath, "utf8");
    assert.ok(src.includes("createFreelancerActivationFeeOnlyCheckoutSession"));
    assert.ok(src.includes("isFreeDisplayPlanEligibleForActivationFeeCheckout"));
    assert.ok(src.includes("PURPOSE_ACTIVATION_FEE_ONLY"));
    assert.ok(src.includes(`CHECKOUT_KIND.ACTIVATION_FEE_ONLY`));
  });

  it("page-specific plan uses subscription_plan_id for checkout", () => {
    const src = fs.readFileSync(checkoutPath, "utf8");
    assert.ok(src.includes("subscription_plan_id"));
    assert.ok(src.includes("checkoutPlanId"));
    assert.ok(src.includes("displayPlanId: String(pid)"));
  });

  it("admin assignment exposes activation fee status without auto-marking paid", () => {
    const subs = fs.readFileSync(subsPath, "utf8");
    assert.ok(subs.includes("getActivationFeeStatus"));
    assert.ok(subs.includes("activationFeeStatus"));
    assert.ok(!subs.includes("markActivationFeePaidOffline"));
    assert.ok(!subs.includes("recordActivationFeePayment"));
  });

  it("admin offline mark-paid endpoint exists", () => {
    const routes = fs.readFileSync(adminRoutesPath, "utf8");
    assert.ok(routes.includes("/subscriptions/activation-fee/mark-paid-offline"));
    assert.ok(routes.includes("markActivationFeePaidOfflineAdmin"));
  });

  it("migration 091 defines audit and checkout session tables", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("subscription_activation_fee_payments"));
    assert.ok(sql.includes("freelancer_subscription_checkout_sessions"));
    assert.ok(sql.includes("uq_activation_fee_payments_stripe_session"));
    assert.ok(sql.includes("includes_activation_fee"));
  });

  it("subscription purchase purpose constant matches Stripe metadata", () => {
    assert.strictEqual(PURPOSE_SUBSCRIPTION_PURCHASE, "freelancer_subscription_purchase");
    assert.strictEqual(PURPOSE_ACTIVATION_FEE_ONLY, "freelancer_activation_fee_only");
  });
});
