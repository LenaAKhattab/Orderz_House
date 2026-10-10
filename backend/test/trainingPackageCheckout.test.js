const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  createTrainingPackageCheckoutSession,
  applyTrainingPackageCheckoutSessionCompleted,
  applyTrainingPackagePaymentFailed,
  cancelTrainingPackageCheckout,
} = require("../src/services/trainingPackageCheckoutService");

function createHarness() {
  const purchases = [];
  let seq = 1;
  const db = {
    async query(sql, params) {
      if (sql.includes("FROM users")) {
        return { rows: [{ id: params[0], role: "freelancer", is_active: true }] };
      }
      if (sql.includes("status = 'paid'") && sql.includes("LIMIT 1")) {
        const paid = purchases.filter((p) => p.user_id === params[0] && p.status === "paid");
        return { rows: paid.slice(-1).map((p) => ({ id: p.id, package_code: p.package_code })) };
      }
      if (sql.includes("checkout_url IS NOT NULL")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO training_package_purchases")) {
        const row = {
          id: seq++,
          user_id: params[0],
          package_code: params[1],
          package_name_ar: params[2],
          package_name_en: params[3],
          amount_jod: params[4],
          currency: params[5],
          status: "pending",
          stripe_checkout_session_id: null,
          stripe_payment_intent_id: null,
          checkout_url: null,
          paid_at: null,
        };
        purchases.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (sql.includes("SET stripe_checkout_session_id")) {
        const row = purchases.find((p) => p.id === params[0]);
        row.stripe_checkout_session_id = params[1];
        row.checkout_url = params[2];
        return { rows: [] };
      }
      if (sql.includes("SET status = 'cancelled'")) {
        const row = purchases.find(
          (p) => p.user_id === params[0] && p.stripe_checkout_session_id === params[1] && p.status === "pending",
        );
        if (row) row.status = "cancelled";
        return { rows: row ? [{ id: row.id }] : [] };
      }
      throw new Error(`unhandled ${sql.slice(0, 120)}`);
    },
    async connect() {
      return {
        async query(sql, params) {
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
          if (sql.includes("FOR UPDATE")) {
            const row = purchases.find((p) => p.id === params[0]);
            return { rows: row ? [{ ...row }] : [] };
          }
          if (sql.includes("SET status = 'paid'")) {
            const row = purchases.find((p) => p.id === params[0] && p.status === "pending");
            if (row) {
              row.status = "paid";
              row.paid_at = new Date().toISOString();
              row.stripe_checkout_session_id = params[1];
              row.stripe_payment_intent_id = params[2];
            }
            return { rows: [] };
          }
          if (sql.includes("SET status = 'failed'")) {
            const row = purchases.find((p) => p.id === params[0] && p.status === "pending");
            if (row) row.status = "failed";
            return { rows: [] };
          }
          throw new Error(`txn ${sql.slice(0, 120)}`);
        },
        release() {},
      };
    },
  };
  const stripe = {
    last: null,
    checkout: {
      sessions: {
        create: async (payload) => {
          stripe.last = payload;
          return { id: `cs_test_${purchases.length || 1}`, url: "https://checkout.stripe.test/session" };
        },
      },
    },
  };
  const settings = {
    async getSetting() {
      return null;
    },
  };
  return { db, stripe, purchases, settings };
}

describe("training package Stripe checkout", () => {
  const prevClient = process.env.CLIENT_URL;
  beforeEach(() => {
    process.env.CLIENT_URL = "https://staging.orderzhouse.test";
  });
  afterEach(() => {
    process.env.CLIENT_URL = prevClient;
  });

  it("charges the server price and ignores a browser amount", async () => {
    const { db, stripe, purchases, settings } = createHarness();
    const result = await createTrainingPackageCheckoutSession(
      { freelancerUserId: 9, packageCode: "content_writing_training", priceJod: 1, amount: 999 },
      { db, stripe, settings },
    );
    assert.equal(result.amountJod, 35);
    assert.equal(result.membershipGranted, false);
    assert.equal(result.termStarted, false);
    assert.equal(stripe.last.line_items[0].price_data.unit_amount, 35000);
    assert.equal(stripe.last.line_items[0].price_data.currency, "jod");
    assert.equal(stripe.last.metadata.purchase_type, "training_package");
    assert.equal(stripe.last.metadata.training_package_code, "content_writing_training");
    assert.equal(stripe.last.metadata.user_id, "9");
    assert.equal(stripe.last.metadata.payment_context, "training_package");
    assert.notEqual(stripe.last.metadata.payment_context, "marketplace_membership");
    assert.equal(purchases[0].status, "pending");
  });

  it("rejects an unknown package code", async () => {
    const { db, stripe, settings } = createHarness();
    await assert.rejects(
      () =>
        createTrainingPackageCheckoutSession(
          { freelancerUserId: 9, packageCode: "not_a_package" },
          { db, stripe, settings },
        ),
      (err) => err.publicCode === "TRAINING_PACKAGE_INVALID",
    );
  });

  it("webhook marks paid once and ignores a mismatched amount", async () => {
    const { db, stripe, purchases, settings } = createHarness();
    const created = await createTrainingPackageCheckoutSession(
      { freelancerUserId: 9, packageCode: "content_writing_training" },
      { db, stripe, settings },
    );
    const session = {
      id: created.sessionId,
      payment_status: "paid",
      amount_total: 35000,
      payment_intent: "pi_training_1",
      metadata: stripe.last.metadata,
    };
    const first = await applyTrainingPackageCheckoutSessionCompleted(session, session.metadata, db);
    const second = await applyTrainingPackageCheckoutSessionCompleted(session, session.metadata, db);
    assert.equal(first.status, "applied");
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(purchases[0].status, "paid");

    purchases[0].status = "pending";
    const mismatch = await applyTrainingPackageCheckoutSessionCompleted(
      { ...session, amount_total: 1000 },
      session.metadata,
      db,
    );
    assert.equal(mismatch.reason, "training_package_amount_mismatch");
    assert.equal(purchases[0].status, "pending");
  });

  it("cancel and failed payment do not create a paid training package", async () => {
    const { db, stripe, purchases, settings } = createHarness();
    const created = await createTrainingPackageCheckoutSession(
      { freelancerUserId: 9, packageCode: "basic" },
      { db, stripe, settings },
    );
    const cancelled = await cancelTrainingPackageCheckout(
      { freelancerUserId: 9, sessionId: created.sessionId },
      { db },
    );
    assert.equal(cancelled.cancelled, true);
    assert.equal(purchases[0].status, "cancelled");

    purchases[0].status = "pending";
    await applyTrainingPackagePaymentFailed(
      { id: "pi_fail", metadata: { purpose: "training_package_purchase", purchase_id: String(purchases[0].id) } },
      db,
    );
    assert.equal(purchases[0].status, "failed");
  });

  it("does not touch marketplace membership, first-order dates, or LMS completion", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/trainingPackageCheckoutService.js"), "utf8");
    assert.match(src, /training_package_purchases/);
    assert.doesNotMatch(src, /freelancer_subscriptions|marketplace_memberships|has_first_order|actual_start_date|expiry_date/);
    assert.doesNotMatch(src, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
    assert.doesNotMatch(src, /resolveCanonicalMarketplacePlanForFreelancer/);
    assert.doesNotMatch(src, /course_progress|lesson_progress|certificate/i);
    const routes = fs.readFileSync(path.join(__dirname, "../src/routes/freelancerTrainingPackageRoutes.js"), "utf8");
    assert.match(routes, /requireAuth/);
    assert.match(routes, /requireRole\("freelancer"\)/);
    const users = fs.readFileSync(path.join(__dirname, "../src/services/superAdminUsersControlService.js"), "utf8");
    assert.doesNotMatch(users, /training_package_purchases|content_writing_training/);
  });
});
