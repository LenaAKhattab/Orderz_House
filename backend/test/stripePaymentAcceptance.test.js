/**
 * Stripe payment acceptance: JOD minor units (three-decimal, chargeable), selected-bid Checkout recovery
 * (one canonical Session per order), payment-attempt observability (record only, no PII).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/stripe_acceptance_placeholder";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_stripe_acceptance";
process.env.CLIENT_URL = process.env.CLIENT_URL || "https://staging.orderzhouse.test";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// ---- fake Stripe ----
const stripeState = { sessions: new Map(), creates: [], expires: [], retrieveError: null, charges: new Map(), pis: new Map() };
function FakeStripe() {
  return {
    checkout: {
      sessions: {
        create: async (payload, opts) => {
          const id = `cs_test_bid_${stripeState.creates.length + 1}`;
          stripeState.creates.push({ payload, opts });
          const s = {
            id, url: `https://checkout.stripe.test/${id}`, status: "open", payment_status: "unpaid", metadata: payload.metadata,
            amount_total: payload.line_items[0].price_data.unit_amount,
          };
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
    paymentIntents: { retrieve: async (id) => ({ ...stripeState.pis.get(String(id)) }) },
    charges: { retrieve: async (id) => ({ ...stripeState.charges.get(String(id)) }) },
  };
}
require.cache[require.resolve("stripe")] = { exports: FakeStripe };

// ---- stubs for side services used while selecting an offer ----
const stub = (rel, exports) => {
  require.cache[require.resolve(rel)] = { exports };
};
stub("../src/services/marketplacePriorityAuctionService", { assertNoActivePriorityAuctionBlockingAssignment: async () => {} });
stub("../src/services/freelancerAccountRestrictionsService", { assertOrderAssignmentAllowed: async () => {} });
stub("../src/services/marketplaceFairDistributionService", { recordAwarded: async () => {} });
stub("../src/services/notificationService", { createIfNotExists: async () => {}, create: async () => {} });

// ---- fake DB ----
const db = { order: null, bids: new Map(), payments: [], failInsert: false };
function handle(sql, params = []) {
  const s = sql.trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
  if (s.includes("FROM orders WHERE id = $1 FOR UPDATE")) return { rows: db.order ? [{ ...db.order }] : [] };
  if (s.includes("FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE")) {
    const b = db.bids.get(Number(params[0]));
    return { rows: b ? [{ ...b }] : [] };
  }
  if (s.includes("SELECT provider_checkout_session_id AS sid, bid_id")) {
    return { rows: db.payments.filter((p) => p.status === "pending").slice().reverse().map((p) => ({ sid: p.sid, bid_id: p.bid_id })) };
  }
  if (s.includes("UPDATE client_order_payments") && s.includes("SET status = 'expired'")) {
    for (const p of db.payments) if (p.status === "pending" && p.sid === params[1]) p.status = "expired";
    return { rows: [] };
  }
  if (s.includes("SET status = 'pending', updated_at = NOW()") && s.includes("order_freelancer_bids")) {
    const b = db.bids.get(Number(params[0]));
    if (b && b.status === "selected_pending_payment") b.status = "pending";
    return { rows: [] };
  }
  if (s.includes("SET status = 'selected_pending_payment'")) {
    db.bids.get(Number(params[0])).status = "selected_pending_payment";
    return { rows: [] };
  }
  if (s.includes("SET selected_bid_id = $2")) {
    db.order.selected_bid_id = params[1];
    db.order.payment_status = "pending";
    db.order.order_status = params[2];
    return { rows: [] };
  }
  if (s.includes("SELECT COUNT(*)::int AS n FROM client_order_payments")) return { rows: [{ n: db.payments.length }] };
  if (s.includes("FROM users")) return { rows: [{ email: "client@example.test" }] };
  if (s.includes("SET stripe_checkout_session_id = $2")) {
    db.order.stripe_checkout_session_id = params[1];
    return { rows: [] };
  }
  if (s.includes("INSERT INTO client_order_payments")) {
    if (db.failInsert) throw new Error("insert failed");
    db.payments.push({ status: "pending", sid: params[4], bid_id: params[2], purpose: params[5] });
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
const { amountMajorToStripeMinor, chargeableStripeMinor } = require("../src/utils/stripeMoney");
const funnel = require("../src/services/stripePaymentFunnelLog");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const origLog = console.log;
const quiet = async (fn) => {
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = origLog;
  }
};

beforeEach(() => {
  stripeState.sessions.clear();
  stripeState.creates.length = 0;
  stripeState.expires.length = 0;
  stripeState.retrieveError = null;
  db.order = {
    id: 601, source_type: "client_created", created_by_user_id: 42, project_type: "bidding", order_status: "open_for_bids",
    payment_status: "unpaid", is_published: true, is_open_for_pool: true, assigned_freelancer_id: null, selected_bid_id: null,
    bid_budget_min: "5", bid_budget_max: "50", title: "Logo", stripe_checkout_session_id: null, budget_mode: "range",
  };
  db.bids = new Map([
    [77, { id: 77, order_id: 601, freelancer_user_id: 900, amount: "20.000", status: "pending", moderation_status: "published" }],
    [78, { id: 78, order_id: 601, freelancer_user_id: 901, amount: "35.000", status: "pending", moderation_status: "published" }],
  ]);
  db.payments = [];
  db.failInsert = false;
});

const select = (bidId) => quiet(() => checkout.createClientSelectedBidCheckoutSession({ clientUserId: 42, orderId: 601, bidId }));

describe("JOD minor units (three-decimal currency)", () => {
  it("1 / 10 / 20 / 35 / 50 JOD → exact Stripe integers", () => {
    assert.equal(amountMajorToStripeMinor(1, "JOD"), 1000);
    assert.equal(amountMajorToStripeMinor(10, "JOD"), 10000);
    assert.equal(amountMajorToStripeMinor(20, "JOD"), 20000);
    assert.equal(amountMajorToStripeMinor(35, "JOD"), 35000);
    assert.equal(amountMajorToStripeMinor(50, "JOD"), 50000);
    assert.equal(amountMajorToStripeMinor("35.000", "jod"), 35000);
  });

  it("current price points are exact and chargeable (last minor digit 0); no float drift", () => {
    for (const [jod, minor] of [[19, 19000], [39, 39000], [59, 59000], [100, 100000], [49, 49000], [349, 349000], [1.99, 1990], [24.99, 24990], [44.99, 44990], [0.5, 500]]) {
      assert.equal(amountMajorToStripeMinor(jod, "JOD"), minor);
      assert.equal(minor % 10, 0);
    }
    assert.equal(amountMajorToStripeMinor(0.1 + 0.2, "JOD"), 300);
    assert.equal(amountMajorToStripeMinor(1.005, "JOD"), 1005);
    assert.equal(amountMajorToStripeMinor(19, "USD"), 1900);
  });

  it("derived amounts are rounded to a chargeable JOD amount; whole prices unchanged", () => {
    assert.equal(chargeableStripeMinor(16625, "JOD"), 16630);
    assert.equal(chargeableStripeMinor(19000, "JOD"), 19000);
    assert.equal(chargeableStripeMinor(1999, "USD"), 1999);
    for (const rel of ["../src/utils/planSalePricing", "../src/utils/marketplaceMembershipSalePricing"]) {
      const { applyPercentageDiscountMajor } = require(rel);
      for (const [price, pctOff] of [[19, 12.5], [39, 37.5], [59, 33], [50, 15], [19, 33.333], [19, 10]]) {
        const r = applyPercentageDiscountMajor(price, pctOff, "JOD");
        assert.equal(r.effectiveMinor % 10, 0, `${rel} ${price}@${pctOff}`);
        assert.equal(r.effectiveMinor + r.discountMinor, r.originalMinor);
      }
    }
  });

  it("every Checkout creation uses the shared helper and Stripe's canonical Checkout behaviour", () => {
    const dir = path.join(__dirname, "../src/services");
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      if (!src.includes("checkout.sessions.create(")) continue;
      assert.ok(/amountMajorToStripeMinor|activationFeeMinorUnits/.test(src), `${f} uses the minor-unit helper`);
      assert.ok(!/unit_amount:\s*[^,\n]*\*\s*100\b/.test(src), `${f} has no ad-hoc *100`);
      // Dynamic payment methods (Apple Pay / Google Pay / Link from the Dashboard) and Stripe-managed 3DS.
      assert.ok(!src.includes("payment_method_types"), `${f} does not restrict payment methods`);
      assert.ok(!src.includes("request_three_d_secure"), `${f} does not force or suppress 3DS`);
    }
  });
});

describe("selected-bid payment: one canonical Checkout Session per order", () => {
  it("selecting an offer creates one Session with an attempt-specific idempotency key", async () => {
    const out = await select(77);
    assert.equal(out.resumed, false);
    assert.equal(stripeState.creates.length, 1);
    assert.equal(stripeState.creates[0].opts.idempotencyKey, "client_selected_bid:601:77:attempt:1");
    assert.equal(stripeState.creates[0].payload.line_items[0].price_data.unit_amount, 20000);
    assert.equal(db.order.order_status, "awaiting_payment_after_bid_selection");
    assert.equal(db.bids.get(77).status, "selected_pending_payment");
  });

  it("Back / «Continue payment» for the same offer resumes the SAME Session", async () => {
    const first = await select(77);
    const again = await select(77);
    assert.equal(again.resumed, true);
    assert.equal(again.sessionId, first.sessionId);
    assert.equal(stripeState.creates.length, 1);
  });

  it("expired Session → history 'expired', fresh Session for the same order and offer", async () => {
    const first = await select(77);
    stripeState.sessions.get(first.sessionId).status = "expired";
    const next = await select(77);
    assert.equal(next.resumed, false);
    assert.notEqual(next.sessionId, first.sessionId);
    assert.equal(stripeState.creates[1].opts.idempotencyKey, "client_selected_bid:601:77:attempt:2");
    assert.deepEqual(db.payments.map((p) => p.status), ["expired", "pending"]);
    assert.equal(stripeState.expires.length, 0);
  });

  it("choosing another offer closes the previous Session at Stripe first (a stale tab can never pay it)", async () => {
    const first = await select(77);
    const other = await select(78);
    assert.deepEqual(stripeState.expires, [first.sessionId]);
    assert.equal(stripeState.sessions.get(first.sessionId).status, "expired");
    assert.equal(stripeState.creates[1].payload.line_items[0].price_data.unit_amount, 35000);
    assert.equal(db.bids.get(77).status, "pending");
    assert.equal(db.bids.get(78).status, "selected_pending_payment");
    assert.equal(db.order.stripe_checkout_session_id, other.sessionId);
  });

  it("processing → 409, Stripe unreachable → 503; no new Session either way", async () => {
    const first = await select(77);
    Object.assign(stripeState.sessions.get(first.sessionId), { status: "complete", payment_status: "unpaid" });
    await assert.rejects(select(77), (e) => e.statusCode === 409 && e.publicCode === "CLIENT_ORDER_PAYMENT_PROCESSING");
    stripeState.retrieveError = Object.assign(new Error("down"), { type: "StripeConnectionError" });
    await assert.rejects(select(77), (e) => e.statusCode === 503 && e.publicCode === "CLIENT_ORDER_PAYMENT_STATUS_UNAVAILABLE");
    assert.equal(stripeState.creates.length, 1);
  });

  it("a paid Session for an offer that is no longer selected is never re-sold: review required", async () => {
    const first = await select(77);
    Object.assign(stripeState.sessions.get(first.sessionId), { status: "complete", payment_status: "paid" });
    db.order.selected_bid_id = 78;
    await assert.rejects(select(78), (e) => e.statusCode === 409 && e.publicCode === "CLIENT_ORDER_PAYMENT_REVIEW_REQUIRED");
    assert.equal(stripeState.creates.length, 1);
  });

  it("already paid and assigned → alreadyPaid, no Stripe call", async () => {
    Object.assign(db.order, { assigned_freelancer_id: 900, payment_status: "paid", order_status: "in_progress" });
    const out = await select(77);
    assert.equal(out.alreadyPaid, true);
    assert.equal(stripeState.creates.length, 0);
  });

  it("a Session that could not be recorded is closed at Stripe (never payable)", async () => {
    db.failInsert = true;
    await assert.rejects(select(77));
    assert.equal(stripeState.creates.length, 1);
    assert.deepEqual(stripeState.expires, ["cs_test_bid_1"]);
  });

  it("paid at Stripe → applied through the trusted confirmation path (source contract)", () => {
    const src = read("src/services/stripeCheckoutService.js");
    const wrapper = src.slice(src.indexOf("async function createClientSelectedBidCheckoutSession("));
    assert.ok(wrapper.includes("await confirmClientSelectedBidPayment({ clientUserId, orderId, bidId: out.paidBidId });"));
    const ctrl = read("src/controllers/clientOrdersController.js");
    assert.equal(ctrl.split("requiresPayment: !out.alreadyPaid,").length - 1, 2);
    const list = read("src/services/ordersService.js");
    assert.ok(list.includes("o.order_status === ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION;"));
    assert.ok(list.includes("selectedBidId: row.selected_bid_id != null ? String(row.selected_bid_id) : null,"));
  });
});

describe("payment attempt observability (record only, no PII)", () => {
  const charge = (extra) => ({ status: "failed", paid: false, outcome: {}, payment_method_details: { type: "card", card: { country: "JO", brand: "visa", funding: "debit" } }, ...extra });

  it("one mutually exclusive category per attempt", () => {
    assert.equal(funnel.chargeOutcomeCategory({ status: "succeeded", paid: true }), "succeeded");
    assert.equal(funnel.chargeOutcomeCategory(charge({ outcome: { type: "blocked", reason: "rule" } })), "radar_blocked_rule");
    assert.equal(funnel.chargeOutcomeCategory(charge({ outcome: { type: "blocked", reason: "highest_risk_level" } })), "radar_blocked_risk");
    assert.equal(funnel.chargeOutcomeCategory(charge({ outcome: { type: "issuer_declined", reason: "insufficient_funds" } })), "issuer_insufficient_funds");
    assert.equal(funnel.chargeOutcomeCategory(charge({ outcome: { type: "issuer_declined", reason: "generic_decline" } })), "issuer_generic_decline");
    // Authentication failure is reported once (not also as a generic decline).
    assert.equal(
      funnel.chargeOutcomeCategory(charge({ failure_code: "payment_intent_authentication_failure", outcome: { type: "issuer_declined", reason: "generic_decline" } })),
      "authentication_failed",
    );
    assert.equal(funnel.chargeOutcomeCategory(charge({ outcome: { type: "invalid", reason: "incorrect_number" } })), "invalid_payment_details");
  });

  it("flows and amount bands", () => {
    assert.equal(funnel.paymentFlowOf({ purpose: "marketplace_membership_checkout", tierCode: "annual_basic" }), "annual_silver");
    assert.equal(funnel.paymentFlowOf({ purpose: "marketplace_membership_checkout", specialOfferPackage: "1" }), "special_offer");
    assert.equal(funnel.paymentFlowOf({ purpose: "client_selected_bid" }), "client_selected_bid");
    assert.equal(funnel.amountBucket(50000, "jod"), "35-50");
    assert.equal(funnel.amountBucket(19000, "jod"), "10-20");
  });

  it("payment_intent.payment_failed is recorded without PII and ignored for other businesses on the account", async () => {
    stripeState.charges.set("ch_1", charge({ outcome: { type: "issuer_declined", reason: "insufficient_funds", network_status: "declined_by_network" } }));
    const lines = [];
    console.log = (x) => lines.push(String(x));
    try {
      const pi = {
        id: "pi_1", amount: 19000, currency: "jod", latest_charge: "ch_1", customer: "cus_secret",
        receipt_email: "client@example.test", metadata: { purpose: "marketplace_membership_checkout", tierCode: "silver", userId: "42", userEmail: "client@example.test" },
        last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" },
      };
      const out = await funnel.recordPaymentAttemptFailed(pi, { stripe: FakeStripe() });
      assert.equal(out.status, "applied");
      const other = await funnel.recordPaymentAttemptFailed({ id: "pi_2", metadata: {} }, { stripe: FakeStripe() });
      assert.equal(other.status, "ignored");
    } finally {
      console.log = origLog;
    }
    assert.equal(lines.length, 1);
    const ev = JSON.parse(lines[0]);
    assert.equal(ev.event, "payment_attempt_failed");
    assert.equal(ev.flow, "membership_silver");
    assert.equal(ev.outcome, "issuer_insufficient_funds");
    assert.equal(ev.cardCountryGroup, "JO");
    assert.equal(ev.amountBucket, "10-20");
    assert.ok(!/client@example|cus_secret|pi_1|ch_1|"42"/.test(lines[0]), "no email, customer, ids");
  });

  it("an expired Session is classified: without attempt vs last failed attempt", async () => {
    stripeState.pis.set("pi_9", { id: "pi_9", latest_charge: "ch_9" });
    stripeState.charges.set("ch_9", charge({ outcome: { type: "blocked", reason: "rule", rule: "block_if_high_fraud_dispute_score" } }));
    const lines = [];
    console.log = (x) => lines.push(String(x));
    try {
      const base = { currency: "jod", amount_total: 19000, mode: "payment", metadata: { purpose: "marketplace_membership_checkout", tierCode: "silver" } };
      await funnel.recordCheckoutSessionTerminal({ ...base, payment_intent: null }, "checkout.session.expired", { stripe: FakeStripe() });
      await funnel.recordCheckoutSessionTerminal({ ...base, payment_intent: "pi_9" }, "checkout.session.expired", { stripe: FakeStripe() });
    } finally {
      console.log = origLog;
    }
    const [a, b] = lines.map((l) => JSON.parse(l));
    assert.equal(a.outcome, "expired_without_attempt");
    assert.equal(b.lastAttempt, "radar_blocked_rule");
    assert.equal(b.radarRule, "block_if_high_fraud_dispute_score");
  });

  it("the webhook never changes order / package state on a failed attempt (Checkout retries in the same Session)", () => {
    const src = read("src/controllers/stripeWebhookController.js");
    const branch = src.slice(src.indexOf('eventType === "payment_intent.payment_failed"'), src.indexOf('eventType === "invoice.paid"'));
    assert.ok(branch.includes("paymentFunnel.recordPaymentAttemptFailed(event.data.object, { stripe })"));
    assert.ok(!branch.includes("applyPaymentIntentOutcome"));
  });
});
