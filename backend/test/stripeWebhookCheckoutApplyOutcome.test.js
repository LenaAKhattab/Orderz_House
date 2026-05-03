/**
 * Checkout webhook apply outcomes: retryable mismatches must not be treated as processed-only successes.
 * Run: npm run test:stripe-checkout-apply  |  npm test
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/stripe_checkout_apply_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  applyCheckoutSessionCompleted,
  applyPaymentIntentOutcome,
  markStripeWebhookEventProcessed,
  markStripeWebhookEventFailed,
  claimStripeWebhookEvent,
} = require("../src/controllers/stripeWebhookController");

/** Mirrors processed vs retryable routing from handleStripeWebhook + finalizeWebhookApplyResult. */
function finalizeOutcome(applyResult) {
  const status = applyResult?.status;
  if (status === "retryable_failure") {
    return { markProcessed: false, markFailed: true };
  }
  if (status === "applied" || status === "already_applied" || status === "ignored") {
    return { markProcessed: true, markFailed: false };
  }
  return { markProcessed: false, markFailed: true };
}

/** Minimal mock client connection */
function createMockPool(scenario) {
  return {
    connect: async () => ({
      query: async (sql) => {
        const s = String(sql);
        if (s.includes("BEGIN")) return {};
        if (s.includes("ROLLBACK")) return {};
        if (s.includes("COMMIT")) return {};
        if (s.includes("FROM orders") && s.includes("FOR UPDATE")) {
          return { rows: scenario.orderRow ? [scenario.orderRow] : [] };
        }
        if (s.includes("order_freelancer_bids")) {
          return { rows: scenario.bidRow ? [scenario.bidRow] : [] };
        }
        if (s.includes("UPDATE orders") && s.includes("RETURNING") && scenario.updateReturnsId) {
          return { rows: [{ id: scenario.orderRow?.id || 42 }] };
        }
        if (s.includes("SELECT id FROM client_order_payments") && s.includes("provider_checkout_session_id")) {
          return { rows: scenario.pendingPaymentMatch ? [{ id: 1 }] : [] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };
}

const { ORDER_STATUSES } = require("../src/services/orderFlowService");

describe("applyCheckoutSessionCompleted outcomes (mock pool)", () => {
  const baseSession = {
    id: "cs_test_1",
    payment_status: "paid",
    amount_total: 5000,
    currency: "jod",
    client_reference_id: "42",
    payment_intent: "pi_1",
    metadata: {
      purpose: "client_fixed_order",
      orderId: "42",
      clientUserId: "1",
    },
  };

  const fixedOrderRowPending = {
    id: 42,
    payment_status: "pending",
    order_status: ORDER_STATUSES.PENDING_PAYMENT,
    project_type: "fixed",
    source_type: "client_created",
    created_by_user_id: 1,
    currency_code: "JOD",
    budget: 50,
    stripe_checkout_session_id: "cs_test_1",
    stripe_checkout_expected_amount_minor: 5000,
    bid_budget_min: null,
    bid_budget_max: null,
    duration_value: 1,
    duration_unit: "days",
    assigned_freelancer_id: null,
    selected_bid_id: null,
  };

  it("older checkout session still authorized when order row points at a newer session id", async () => {
    const scenario = {
      updateReturnsId: true,
      orderRow: {
        ...fixedOrderRowPending,
        stripe_checkout_session_id: "cs_newer_tab",
      },
    };
    const pool = createMockPool(scenario);
    const out = await applyCheckoutSessionCompleted({ ...baseSession, id: "cs_test_1" }, pool);
    assert.strictEqual(out.status, "applied");
    assert.strictEqual(finalizeOutcome(out).markProcessed, true);
  });

  it("older bid checkout session still authorized when order row points at a newer session id", async () => {
    const bidOrderRow = {
      id: 42,
      payment_status: "pending",
      order_status: ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION,
      project_type: "bidding",
      source_type: "client_created",
      created_by_user_id: 1,
      currency_code: "JOD",
      bid_budget_min: 10,
      bid_budget_max: 100,
      stripe_checkout_session_id: "cs_bid_newer",
      stripe_checkout_expected_amount_minor: 5000,
      duration_value: 1,
      duration_unit: "days",
      assigned_freelancer_id: null,
      selected_bid_id: 9,
    };
    const bidSession = {
      id: "cs_bid_old",
      payment_status: "paid",
      amount_total: 5000,
      currency: "jod",
      client_reference_id: "42:9",
      payment_intent: "pi_bid",
      metadata: {
        purpose: "client_selected_bid",
        orderId: "42",
        bidId: "9",
        clientUserId: "1",
      },
    };
    const scenario = {
      updateReturnsId: true,
      orderRow: bidOrderRow,
      bidRow: {
        id: 9,
        order_id: 42,
        freelancer_user_id: 100,
        amount: 50,
        status: "selected_pending_payment",
      },
    };
    const pool = createMockPool(scenario);
    const out = await applyCheckoutSessionCompleted(bidSession, pool);
    assert.strictEqual(out.status, "applied");
  });

  it("duplicate webhook apply yields already_applied when order UPDATE matches no row", async () => {
    const scenario = {
      updateReturnsId: false,
      orderRow: {
        ...fixedOrderRowPending,
        stripe_checkout_session_id: "cs_newer_tab",
      },
    };
    const pool = createMockPool(scenario);
    const out = await applyCheckoutSessionCompleted({ ...baseSession, id: "cs_test_1" }, pool);
    assert.strictEqual(out.status, "already_applied");
  });

  it("missing client_reference_id / metadata → ignored (not retryable)", async () => {
    const scenario = { updateReturnsId: true, orderRow: { ...fixedOrderRowPending, stripe_checkout_session_id: "cs_other" } };
    const pool = createMockPool(scenario);
    const out = await applyCheckoutSessionCompleted(
      {
        ...baseSession,
        id: "cs_test_1",
        client_reference_id: "",
        metadata: { purpose: "client_fixed_order", orderId: "42", clientUserId: "1" },
      },
      pool,
    );
    assert.strictEqual(out.status, "ignored");
    assert.strictEqual(out.reason, "client_reference_mismatch");
  });

  it("amount mismatch → retryable_failure", async () => {
    const scenario = {
      orderRow: {
        ...fixedOrderRowPending,
        stripe_checkout_expected_amount_minor: 9999,
      },
    };
    const pool = createMockPool(scenario);
    const out = await applyCheckoutSessionCompleted({ ...baseSession, amount_total: 5000 }, pool);
    assert.strictEqual(out.status, "retryable_failure");
    assert.strictEqual(out.reason, "amount_mismatch");
  });

  it("missing order when paid → retryable_failure", async () => {
    const pool = createMockPool({ orderRow: null });
    const out = await applyCheckoutSessionCompleted(baseSession, pool);
    assert.strictEqual(out.status, "retryable_failure");
    assert.strictEqual(out.reason, "order_not_found");
  });

  it("already paid order → already_applied", async () => {
    const scenario = {
      orderRow: {
        ...fixedOrderRowPending,
        payment_status: "paid",
      },
    };
    const pool = createMockPool(scenario);
    const out = await applyCheckoutSessionCompleted(baseSession, pool);
    assert.strictEqual(out.status, "already_applied");
    const fin = finalizeOutcome(out);
    assert.strictEqual(fin.markProcessed, true);
  });

  it("unknown purpose → ignored (safe to mark processed)", async () => {
    const pool = createMockPool({});
    const out = await applyCheckoutSessionCompleted(
      {
        ...baseSession,
        metadata: { purpose: "something_else" },
      },
      pool,
    );
    assert.strictEqual(out.status, "ignored");
    assert.strictEqual(finalizeOutcome(out).markProcessed, true);
  });
});

describe("applyPaymentIntentOutcome outcomes (mock pool)", () => {
  const piBase = {
    id: "pi_x",
    amount: 5000,
    currency: "jod",
    metadata: {
      purpose: "client_fixed_order",
      orderId: "7",
    },
  };

  const fixedPending = {
    id: 7,
    payment_status: "pending",
    order_status: ORDER_STATUSES.PENDING_PAYMENT,
    project_type: "fixed",
    source_type: "client_created",
    created_by_user_id: 1,
    currency_code: "JOD",
    budget: 50,
    stripe_checkout_expected_amount_minor: 5000,
    stripe_payment_intent_id: null,
    bid_budget_min: null,
    bid_budget_max: null,
    duration_value: 1,
    duration_unit: "days",
    assigned_freelancer_id: null,
    selected_bid_id: null,
  };

  it("amount mismatch on paid PI → retryable_failure", async () => {
    const pool = createMockPool({
      orderRow: { ...fixedPending, stripe_checkout_expected_amount_minor: 111 },
    });
    const out = await applyPaymentIntentOutcome({ ...piBase, amount: 5000 }, "paid", pool);
    assert.strictEqual(out.status, "retryable_failure");
    assert.strictEqual(out.reason, "amount_mismatch");
  });
});

describe("stripe_webhook_events lifecycle with checkout outcomes", () => {
  function makeDb() {
    const rows = new Map();
    return {
      rows,
      query: async (sql, params) => {
        const s = String(sql);
        const id = params[0];
        if (s.includes("INSERT INTO stripe_webhook_events") && s.includes("ON CONFLICT")) {
          if (!rows.has(id)) {
            rows.set(id, { status: "processing" });
            return { rowCount: 1 };
          }
          return { rowCount: 0 };
        }
        if (s.includes("SELECT status FROM stripe_webhook_events")) {
          const r = rows.get(id);
          return { rows: r ? [{ status: r.status }] : [] };
        }
        if (s.includes("SET status = 'processed'")) {
          const r = rows.get(id);
          if (r?.status === "processing") {
            r.status = "processed";
            return { rowCount: 1 };
          }
          return { rowCount: 0 };
        }
        if (s.includes("SET status = 'failed'") && s.includes("last_error")) {
          const r = rows.get(id);
          if (r?.status === "processing") {
            r.status = "failed";
            r.last_error = params[1];
            return { rowCount: 1 };
          }
          return { rowCount: 0 };
        }
        throw new Error(`unexpected sql in lifecycle test: ${s.slice(0, 80)}`);
      },
    };
  }

  it("retryable_failure stores last_error on failed row", async () => {
    const db = makeDb();
    const evt = "evt_retryable";
    await claimStripeWebhookEvent(evt, db);
    await markStripeWebhookEventFailed(evt, "amount_mismatch", db);
    assert.strictEqual(db.rows.get(evt)?.status, "failed");
    assert.strictEqual(db.rows.get(evt)?.last_error, "amount_mismatch");
  });

  it("processed row after successful apply path", async () => {
    const db = makeDb();
    const evt = "evt_ok";
    await claimStripeWebhookEvent(evt, db);
    await markStripeWebhookEventProcessed(evt, db);
    assert.strictEqual(db.rows.get(evt)?.status, "processed");
  });
});
