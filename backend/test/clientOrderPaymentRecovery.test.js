/**
 * Client fixed-price order payment recovery: one canonical Checkout Session per pending order
 * (resume / fresh after expiry / processing / provider down / paid), safe explicit discard,
 * checkout.session.expired history, per-attempt creation idempotency.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/client_pay_recovery_placeholder";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_client_pay_recovery";
process.env.CLIENT_URL = process.env.CLIENT_URL || "https://staging.orderzhouse.test";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// ---- fake Stripe (module-level, picked up by getStripeOrNull) ----
const stripeState = { sessions: new Map(), creates: [], expires: [], retrieveError: null };
function FakeStripe() {
  return {
    checkout: {
      sessions: {
        create: async (payload, opts) => {
          const id = `cs_test_unit_${stripeState.creates.length + 1}`;
          stripeState.creates.push({ payload, opts });
          const s = { id, url: `https://checkout.stripe.test/${id}`, status: "open", payment_status: "unpaid", metadata: payload.metadata };
          stripeState.sessions.set(id, s);
          return { ...s };
        },
        retrieve: async (id) => {
          if (stripeState.retrieveError) throw stripeState.retrieveError;
          const s = stripeState.sessions.get(String(id));
          if (!s) throw Object.assign(new Error("No such checkout.session"), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
          return { ...s };
        },
        expire: async (id) => {
          stripeState.expires.push(String(id));
          const s = stripeState.sessions.get(String(id));
          if (s && s.status === "open") s.status = "expired";
          return { ...s };
        },
      },
    },
  };
}
require.cache[require.resolve("stripe")] = { exports: FakeStripe };

// ---- fake DB ----
const db = { order: null, payments: [], queries: [] };
function handle(sql, params) {
  db.queries.push(sql);
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
  if (sql.includes("FROM orders") && sql.includes("FOR UPDATE")) return { rows: db.order ? [{ ...db.order }] : [] };
  if (sql.includes("SELECT id, created_by_user_id, source_type, project_type, order_status, payment_status, stripe_checkout_session_id")) {
    return { rows: db.order ? [{ ...db.order }] : [] };
  }
  if (sql.includes("UPDATE client_order_payments") && sql.includes("SET status = 'expired'")) {
    let n = 0;
    for (const p of db.payments) {
      if (p.status === "pending" && p.provider_checkout_session_id === (params[1] ?? params[0])) {
        p.status = "expired";
        n += 1;
      }
    }
    return { rows: Array.from({ length: n }, () => ({ id: 1 })) };
  }
  if (sql.includes("SELECT COUNT(*)::int AS n FROM client_order_payments")) return { rows: [{ n: db.payments.length }] };
  if (sql.includes("SELECT provider_checkout_session_id FROM client_order_payments")) {
    return { rows: db.payments.filter((p) => p.status === "pending").map((p) => ({ provider_checkout_session_id: p.provider_checkout_session_id })) };
  }
  if (sql.includes("FROM users")) return { rows: [{ email: "client@example.test" }] };
  if (sql.includes("UPDATE orders") && sql.includes("SET stripe_checkout_session_id")) {
    db.order.stripe_checkout_session_id = params[1];
    return { rows: [] };
  }
  if (sql.includes("INSERT INTO client_order_payments")) {
    db.payments.push({ status: "pending", provider_checkout_session_id: params[4] });
    return { rows: [] };
  }
  return { rows: [] };
}
const fakePool = {
  query: async (sql, params) => handle(String(sql), params),
  connect: async () => ({ query: async (sql, params) => handle(String(sql), params), release() {} }),
  on() {},
};
require.cache[require.resolve("../src/config/db")] = { exports: { pool: fakePool } };

const checkout = require("../src/services/stripeCheckoutService");
const ordersService = require("../src/services/ordersService");

function pendingOrder(extra = {}) {
  return {
    id: 501,
    source_type: "client_created",
    created_by_user_id: 42,
    project_type: "fixed",
    order_status: "pending_payment",
    payment_status: "pending",
    budget: "15.000",
    title: "Logo",
    stripe_checkout_session_id: null,
    ...extra,
  };
}

beforeEach(() => {
  stripeState.sessions.clear();
  stripeState.creates.length = 0;
  stripeState.expires.length = 0;
  stripeState.retrieveError = null;
  db.order = pendingOrder();
  db.payments = [];
  db.queries = [];
});

const pay = () => checkout.createClientFixedOrderCheckoutSession({ clientUserId: 42, orderId: 501 });
const origLog = console.log;

describe("client fixed order: one canonical Checkout Session per pending order", () => {
  it("first payment creates a session with an attempt-specific idempotency key", async () => {
    console.log = () => {};
    try {
      const out = await pay();
      assert.equal(out.resumed, false);
      assert.equal(stripeState.creates.length, 1);
      assert.equal(stripeState.creates[0].opts.idempotencyKey, "client_fixed_order:501:attempt:1");
      assert.equal(db.order.stripe_checkout_session_id, out.sessionId);
    } finally {
      console.log = origLog;
    }
  });

  it("browser Back / tab close: «Continue payment» returns the SAME open session", async () => {
    console.log = () => {};
    try {
      const first = await pay();
      const again = await pay();
      assert.equal(again.resumed, true);
      assert.equal(again.sessionId, first.sessionId);
      assert.equal(again.checkoutUrl, first.checkoutUrl);
      assert.equal(stripeState.creates.length, 1);
    } finally {
      console.log = origLog;
    }
  });

  it("expired session → history marked expired, fresh session for the same order with a new key", async () => {
    console.log = () => {};
    try {
      const first = await pay();
      stripeState.sessions.get(first.sessionId).status = "expired";
      const fresh = await pay();
      assert.notEqual(fresh.sessionId, first.sessionId);
      assert.equal(stripeState.creates[1].opts.idempotencyKey, "client_fixed_order:501:attempt:2");
      assert.deepEqual(db.payments.map((p) => p.status), ["expired", "pending"]);
    } finally {
      console.log = origLog;
    }
  });

  it("processing (complete + unpaid) → 409, no new session", async () => {
    console.log = () => {};
    try {
      const first = await pay();
      Object.assign(stripeState.sessions.get(first.sessionId), { status: "complete", payment_status: "unpaid" });
      await assert.rejects(() => pay(), (e) => e.statusCode === 409 && e.publicCode === "CLIENT_ORDER_PAYMENT_PROCESSING");
      assert.equal(stripeState.creates.length, 1);
    } finally {
      console.log = origLog;
    }
  });

  it("Stripe unreachable → 503, order and attempt untouched, no new session", async () => {
    console.log = () => {};
    try {
      await pay();
      stripeState.retrieveError = Object.assign(new Error("ETIMEDOUT"), { type: "StripeConnectionError" });
      await assert.rejects(() => pay(), (e) => e.statusCode === 503 && e.publicCode === "CLIENT_ORDER_PAYMENT_STATUS_UNAVAILABLE");
      assert.equal(stripeState.creates.length, 1);
      assert.deepEqual(db.payments.map((p) => p.status), ["pending"]);
    } finally {
      console.log = origLog;
    }
  });

  it("paid at Stripe → applied via the trusted confirmation path (source contract), never a new session", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/stripeCheckoutService.js"), "utf8");
    assert.ok(src.includes('if (current.state === "paid") {'));
    assert.ok(src.includes("await confirmClientFixedOrderPayment({ clientUserId, orderId, sessionId: rows[0]?.stripe_checkout_session_id || null });"));
    assert.ok(src.includes("return { checkoutUrl: null, sessionId: rows[0]?.stripe_checkout_session_id || null, alreadyPaid: true };"));
  });
});

describe("explicit «Cancel order» is safe", () => {
  it("expires the open Stripe session before discarding the unpaid draft", async () => {
    console.log = () => {};
    const orig = ordersService.purgeClientUnpaidFixedOrderDraft;
    let purged = 0;
    ordersService.purgeClientUnpaidFixedOrderDraft = async () => {
      purged += 1;
      return { deleted: true };
    };
    try {
      const first = await pay();
      await checkout.cancelClientFixedOrderPaymentAttempt({ clientUserId: 42, orderId: 501 });
      assert.deepEqual(stripeState.expires, [first.sessionId]);
      assert.equal(purged, 1);
    } finally {
      ordersService.purgeClientUnpaidFixedOrderDraft = orig;
      console.log = origLog;
    }
  });

  it("refuses to discard while processing or when Stripe is unreachable", async () => {
    console.log = () => {};
    const orig = ordersService.purgeClientUnpaidFixedOrderDraft;
    let purged = 0;
    ordersService.purgeClientUnpaidFixedOrderDraft = async () => {
      purged += 1;
    };
    try {
      const first = await pay();
      Object.assign(stripeState.sessions.get(first.sessionId), { status: "complete", payment_status: "unpaid" });
      await assert.rejects(() => checkout.cancelClientFixedOrderPaymentAttempt({ clientUserId: 42, orderId: 501 }), (e) => e.statusCode === 409);
      Object.assign(stripeState.sessions.get(first.sessionId), { status: "open", payment_status: "unpaid" });
      stripeState.retrieveError = Object.assign(new Error("ETIMEDOUT"), { type: "StripeConnectionError" });
      await assert.rejects(() => checkout.cancelClientFixedOrderPaymentAttempt({ clientUserId: 42, orderId: 501 }), (e) => e.statusCode === 503);
      assert.equal(purged, 0);
      assert.deepEqual(stripeState.expires, []);
    } finally {
      ordersService.purgeClientUnpaidFixedOrderDraft = orig;
      console.log = origLog;
    }
  });
});

describe("history, webhook and creation idempotency", () => {
  it("checkout.session.expired marks the client order attempt expired (idempotent)", async () => {
    const { applyCheckoutSessionExpired } = require("../src/controllers/stripeWebhookController");
    db.payments = [{ status: "pending", provider_checkout_session_id: "cs_old" }];
    const a = await applyCheckoutSessionExpired({ id: "cs_old", metadata: { purpose: "client_fixed_order" } }, fakePool);
    const b = await applyCheckoutSessionExpired({ id: "cs_old", metadata: { purpose: "client_fixed_order" } }, fakePool);
    assert.equal(a.status, "applied");
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(db.payments[0].status, "expired");
  });

  it("create: per-attempt key looked up under a lock BEFORE any upload; stored on the order", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/services/ordersService.js"), "utf8");
    const fn = src.slice(src.indexOf("async function createClientOrder("), src.indexOf("async function purgeClientUnpaidFixedOrderDraft("));
    const lock = fn.indexOf("pg_advisory_xact_lock(hashtext('client_order_creation:'");
    const lookup = fn.indexOf("WHERE created_by_user_id = $1 AND client_creation_key = $2");
    const upload = fn.indexOf("uploadFilesToCloudinary(");
    assert.ok(lock > 0 && lookup > lock && upload > lookup, "lock → lookup → upload");
    assert.ok(fn.includes("return { ...existing, idempotentReplay: true };"));
    assert.ok(fn.includes("client_creation_key"));
    const ctrl = fs.readFileSync(path.join(__dirname, "../src/controllers/clientOrdersController.js"), "utf8");
    assert.ok(ctrl.includes("creationKey: req.body.creationKey || null,"));
    assert.ok(ctrl.includes("if (order.idempotentReplay) {"));
    const mig = fs.readFileSync(path.join(__dirname, "../sql/migrations/211_client_order_payment_recovery.sql"), "utf8");
    assert.ok(mig.includes("ON orders (created_by_user_id, client_creation_key)"));
    assert.ok(mig.includes("CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'expired'))"));
    assert.ok(!/DROP TABLE|DELETE FROM|TRUNCATE|DROP COLUMN/i.test(mig));
  });

  it("historical audit tool: dry run by default, never changes or deletes orders", () => {
    const tool = fs.readFileSync(path.join(__dirname, "../scripts/auditClientOrderPayments.js"), "utf8");
    assert.ok(tool.includes('const APPLY = process.argv.includes("--apply");'));
    assert.ok(tool.includes("if (APPLY && (state === \"expired\" || state === \"missing\")) {"));
    assert.ok(!/DELETE FROM|UPDATE orders|TRUNCATE/i.test(tool));
    assert.equal(tool.split("UPDATE ").length - 1, 1);
  });
});
