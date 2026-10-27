const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  createTrainingPackageCheckoutSession,
  getMyTrainingPackages,
  applyTrainingPackageCheckoutSessionCompleted,
  applyTrainingPackageCheckoutSessionExpired,
  applyTrainingPackagePaymentFailed,
  cancelTrainingPackageCheckout,
} = require("../src/services/trainingPackageCheckoutService");

function createHarness() {
  const purchases = [];
  let seq = 1;
  // Per-user advisory lock (pg_advisory_xact_lock) — held until COMMIT/ROLLBACK.
  const locks = new Map();
  const handle = (sql, params) => {
    if (sql.includes("FROM users")) {
      return { rows: [{ id: params[0], role: "freelancer", is_active: true }] };
    }
    if (sql.includes("status = 'paid'") && sql.includes("LIMIT 1")) {
      const paid = purchases.filter((p) => p.user_id === params[0] && p.status === "paid");
      return { rows: paid.slice(-1).map((p) => ({ id: p.id, package_code: p.package_code })) };
    }
    if (sql.includes("FROM user_referrals")) {
      return { rows: [] };
    }
    if (sql.includes("FROM training_package_purchases") && sql.includes("package_code = $2")) {
      const rows = purchases
        .filter((p) => p.user_id === params[0] && p.package_code === params[1] && p.status === "pending")
        .sort((a, b) => b.id - a.id);
      return { rows: rows.map((p) => ({ ...p })) };
    }
    if (sql.includes("FROM training_package_purchases") && sql.includes("stripe_checkout_session_id = $2")) {
      const row = purchases.find(
        (p) => p.user_id === params[0] && p.stripe_checkout_session_id === params[1] && p.status === "pending",
      );
      return { rows: row ? [{ ...row }] : [] };
    }
    if (sql.includes("FROM training_package_purchases") && sql.includes("LIMIT 50")) {
      const rows = purchases.filter((p) => p.user_id === params[0]).sort((a, b) => b.id - a.id);
      return { rows: rows.map((p) => ({ ...p })) };
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
        created_at: new Date().toISOString(),
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
        (p) =>
          p.id === params[0] &&
          p.status === "pending" &&
          (params.length < 2 || p.stripe_checkout_session_id === params[1]),
      );
      if (row) row.status = "cancelled";
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (sql.includes("SET status = 'failed'")) {
      const row = purchases.find((p) => p.id === params[0] && p.status === "pending");
      if (row) row.status = "failed";
      return { rows: [] };
    }
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
    throw new Error(`unhandled ${sql.slice(0, 120)}`);
  };
  const db = {
    async query(sql, params) {
      return handle(sql, params);
    },
    async connect() {
      let release = null;
      let lockKey = null;
      const unlock = () => {
        if (lockKey != null && locks.get(lockKey)?.release === release) locks.delete(lockKey);
        if (release) release();
        release = null;
        lockKey = null;
      };
      return {
        async query(sql, params) {
          if (sql === "BEGIN") return { rows: [] };
          if (sql === "COMMIT" || sql === "ROLLBACK") {
            unlock();
            return { rows: [] };
          }
          if (sql.includes("pg_advisory_xact_lock")) {
            lockKey = params[0];
            while (locks.has(lockKey)) await locks.get(lockKey).done;
            let resolveDone;
            const done = new Promise((r) => {
              resolveDone = r;
            });
            release = resolveDone;
            locks.set(lockKey, { done, release });
            return { rows: [] };
          }
          return handle(sql, params);
        },
        release() {},
      };
    },
  };
  // Stripe Checkout Sessions held by the fake provider.
  const sessions = new Map();
  const stripe = {
    last: null,
    lastOptions: null,
    createCalls: 0,
    retrieveError: null,
    checkout: {
      sessions: {
        create: async (payload, options) => {
          stripe.createCalls += 1;
          stripe.last = payload;
          stripe.lastOptions = options;
          await new Promise((r) => setTimeout(r, 5));
          const id = `cs_test_${stripe.createCalls}`;
          const session = {
            id,
            url: `https://checkout.stripe.test/${id}`,
            status: "open",
            payment_status: "unpaid",
            amount_total: payload.line_items[0].price_data.unit_amount,
            payment_intent: null,
            metadata: payload.metadata,
          };
          sessions.set(id, session);
          return { ...session };
        },
        retrieve: async (id) => {
          if (stripe.retrieveError) throw stripe.retrieveError;
          const s = sessions.get(id);
          if (!s) {
            const err = new Error("No such checkout.session");
            err.type = "StripeInvalidRequestError";
            err.code = "resource_missing";
            err.statusCode = 404;
            throw err;
          }
          return { ...s };
        },
        expire: async (id) => {
          const s = sessions.get(id);
          if (s && s.status === "open") s.status = "expired";
          return { ...s };
        },
      },
    },
  };
  const settings = {
    async getSetting() {
      return null;
    },
  };
  return { db, stripe, sessions, purchases, settings };
}

const USER = 9;
const PKG = "content_writing_training";

function buy(h, packageCode = PKG) {
  return createTrainingPackageCheckoutSession(
    { freelancerUserId: USER, packageCode },
    { db: h.db, stripe: h.stripe, settings: h.settings },
  );
}

function myPackages(h) {
  return getMyTrainingPackages(USER, { db: h.db, stripe: h.stripe });
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

  it("failed payment does not create a paid training package", async () => {
    const h = createHarness();
    await buy(h, "basic");
    await applyTrainingPackagePaymentFailed(
      { id: "pi_fail", metadata: { purpose: "training_package_purchase", purchase_id: String(h.purchases[0].id) } },
      h.db,
    );
    assert.equal(h.purchases[0].status, "failed");
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

describe("abandoned training checkout recovery (Stripe is the source of truth)", () => {
  const prevClient = process.env.CLIENT_URL;
  beforeEach(() => {
    process.env.CLIENT_URL = "https://staging.orderzhouse.test";
  });
  afterEach(() => {
    process.env.CLIENT_URL = prevClient;
  });

  it("A/B/C: open session after browser Back or closed tab is resumable, never 'pending'", async () => {
    const h = createHarness();
    await buy(h);
    const mine = await myPackages(h);
    assert.equal(mine.pending, null, "an open checkout is not a payment being confirmed");
    assert.deepEqual(
      mine.checkouts.map((c) => [c.packageCode, c.state]),
      [[PKG, "open"]],
    );
    assert.equal(h.purchases[0].status, "pending");
  });

  it("D: Continue payment returns the same open Stripe session (no new session)", async () => {
    const h = createHarness();
    const first = await buy(h);
    const again = await buy(h);
    assert.equal(h.stripe.createCalls, 1);
    assert.equal(again.resumed, true);
    assert.equal(again.sessionId, first.sessionId);
    assert.equal(again.checkoutUrl, first.checkoutUrl);
    assert.equal(h.purchases.length, 1);
  });

  it("E: expired Stripe session closes the old attempt and a new checkout is created", async () => {
    const h = createHarness();
    const first = await buy(h);
    h.sessions.get(first.sessionId).status = "expired";
    const mine = await myPackages(h);
    assert.deepEqual(mine.checkouts, []);
    assert.equal(mine.pending, null);
    assert.equal(h.purchases[0].status, "cancelled", "history kept, attempt closed");
    const second = await buy(h);
    assert.notEqual(second.sessionId, first.sessionId);
    assert.equal(h.stripe.createCalls, 2);
    assert.equal(h.stripe.lastOptions.idempotencyKey, `training_pkg_checkout_${second.purchaseId}`);
    assert.notEqual(second.purchaseId, first.purchaseId);
  });

  it("E: expired session is reconciled directly on purchase too (no status read first)", async () => {
    const h = createHarness();
    const first = await buy(h);
    h.sessions.get(first.sessionId).status = "expired";
    const second = await buy(h);
    assert.equal(h.purchases[0].status, "cancelled");
    assert.notEqual(second.sessionId, first.sessionId);
  });

  it("F: checkout.session.expired webhook closes the attempt idempotently", async () => {
    const h = createHarness();
    const first = await buy(h);
    const session = { id: first.sessionId, metadata: h.stripe.last.metadata };
    const a = await applyTrainingPackageCheckoutSessionExpired(session, h.db);
    const b = await applyTrainingPackageCheckoutSessionExpired(session, h.db);
    assert.equal(a.status, "applied");
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(h.purchases[0].status, "cancelled");
    const other = await applyTrainingPackageCheckoutSessionExpired(
      { id: "cs_other", metadata: { purpose: "marketplace_membership_checkout" } },
      h.db,
    );
    assert.equal(other.status, "ignored");
    const src = fs.readFileSync(path.join(__dirname, "../src/controllers/stripeWebhookController.js"), "utf8");
    assert.match(src, /eventType === "checkout\.session\.expired"/);
    assert.ok(src.includes("applyResult = await applyCheckoutSessionExpired(event.data.object);"));
    assert.ok(src.includes("return trainingCheckout.applyTrainingPackageCheckoutSessionExpired(session, dbPool);"));
  });

  it("G: complete + paid is applied through the trusted path and never sold again", async () => {
    const h = createHarness();
    const first = await buy(h);
    Object.assign(h.sessions.get(first.sessionId), {
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_paid_1",
    });
    const mine = await myPackages(h);
    assert.equal(h.purchases[0].status, "paid");
    assert.equal(mine.current.packageCode, PKG);
    await assert.rejects(() => buy(h), (err) => err.publicCode === "TRAINING_PACKAGE_ALREADY_CURRENT");
    assert.equal(h.stripe.createCalls, 1);
  });

  it("G: purchase click on a paid-but-unapplied session does not create a second session", async () => {
    const h = createHarness();
    const first = await buy(h);
    Object.assign(h.sessions.get(first.sessionId), { status: "complete", payment_status: "paid" });
    await assert.rejects(() => buy(h), (err) => err.publicCode === "TRAINING_PACKAGE_ALREADY_CURRENT");
    assert.equal(h.purchases[0].status, "paid");
    assert.equal(h.stripe.createCalls, 1);
  });

  it("H: complete + unpaid (async settlement) is processing — no duplicate charge", async () => {
    const h = createHarness();
    const first = await buy(h);
    Object.assign(h.sessions.get(first.sessionId), { status: "complete", payment_status: "unpaid" });
    const mine = await myPackages(h);
    assert.equal(mine.pending?.packageCode, PKG);
    assert.deepEqual(mine.checkouts.map((c) => c.state), ["processing"]);
    await assert.rejects(() => buy(h), (err) => err.publicCode === "TRAINING_PACKAGE_PAYMENT_PROCESSING");
    assert.equal(h.stripe.createCalls, 1);
    assert.equal(h.purchases[0].status, "pending");
  });

  it("I: Stripe unreachable keeps the attempt and refuses to create another session", async () => {
    const h = createHarness();
    await buy(h);
    h.stripe.retrieveError = Object.assign(new Error("connect ETIMEDOUT"), { type: "StripeConnectionError" });
    const mine = await myPackages(h);
    assert.deepEqual(mine.checkouts.map((c) => c.state), ["unknown"]);
    assert.equal(mine.pending, null);
    await assert.rejects(
      () => buy(h),
      (err) =>
        err.publicCode === "TRAINING_PACKAGE_PAYMENT_STATUS_UNAVAILABLE" &&
        err.statusCode === 503 &&
        err.message === "تعذر التحقق من حالة الدفع حاليًا. حاول مرة أخرى بعد قليل.",
    );
    assert.equal(h.purchases[0].status, "pending");
    assert.equal(h.stripe.createCalls, 1);
  });

  it("J/K: double click and two tabs produce one active attempt and one Stripe session", async () => {
    const h = createHarness();
    const results = await Promise.all([buy(h), buy(h), buy(h)]);
    assert.equal(h.stripe.createCalls, 1);
    assert.equal(h.purchases.length, 1);
    assert.equal(new Set(results.map((r) => r.sessionId)).size, 1);
  });

  it("L: legacy stuck rows self-heal — missing session and session-less rows are closed", async () => {
    const h = createHarness();
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    h.purchases.push(
      { id: 101, user_id: USER, package_code: PKG, status: "pending", stripe_checkout_session_id: "cs_live_gone", amount_jod: 35, created_at: old },
      { id: 102, user_id: USER, package_code: "basic", status: "pending", stripe_checkout_session_id: null, amount_jod: 10, created_at: old },
    );
    const mine = await myPackages(h);
    assert.deepEqual(mine.checkouts, []);
    assert.equal(mine.pending, null);
    assert.deepEqual(h.purchases.map((p) => p.status), ["cancelled", "cancelled"]);
    const fresh = await buy(h);
    assert.ok(fresh.sessionId);
  });

  it("L: legacy duplicate open sessions — newest is resumed, older ones expired at Stripe", async () => {
    const h = createHarness();
    const first = await buy(h);
    // Simulate a pre-fix second attempt for the same package.
    const s2 = await h.stripe.checkout.sessions.create({ line_items: [{ price_data: { unit_amount: 35000 } }], metadata: {} });
    h.purchases.push({ id: 50, user_id: USER, package_code: PKG, status: "pending", stripe_checkout_session_id: s2.id, amount_jod: 35, created_at: new Date().toISOString() });
    const again = await buy(h);
    assert.equal(again.sessionId, s2.id, "newest open attempt is resumed");
    assert.equal(h.sessions.get(first.sessionId).status, "expired");
    assert.equal(h.purchases.find((p) => p.id === 1).status, "cancelled");
  });

  it("cancel_url return is not authoritative — an open session stays resumable", async () => {
    const h = createHarness();
    const first = await buy(h);
    const res = await cancelTrainingPackageCheckout(
      { freelancerUserId: USER, sessionId: first.sessionId },
      { db: h.db, stripe: h.stripe },
    );
    assert.equal(res.cancelled, false);
    assert.equal(res.state, "open");
    h.sessions.get(first.sessionId).status = "expired";
    const res2 = await cancelTrainingPackageCheckout(
      { freelancerUserId: USER, sessionId: first.sessionId },
      { db: h.db, stripe: h.stripe },
    );
    assert.equal(res2.cancelled, true);
    assert.equal(h.purchases[0].status, "cancelled");
  });

  it("success URL / browser navigation never marks paid; reconciliation logs carry no URL or PII", async () => {
    const h = createHarness();
    const lines = [];
    const orig = console.log;
    console.log = (line) => lines.push(String(line));
    try {
      await buy(h);
      await myPackages(h);
    } finally {
      console.log = orig;
    }
    assert.equal(h.purchases[0].status, "pending");
    assert.ok(lines.some((l) => l.includes("training_package_checkout_reconcile")));
    for (const l of lines) {
      assert.ok(!l.includes("checkout.stripe.test"), "no checkout URL in logs");
      assert.ok(!/@/.test(l), "no email in logs");
    }
  });
});
