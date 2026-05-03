/**
 * Multi-session Checkout reconciliation rules shared by webhook + confirm.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  assertCheckoutSessionAuthorizedForOrder,
  resolvePaidCheckoutSessionForClientOrder,
  PURPOSE_FIXED,
  PURPOSE_BID,
} = require("../src/utils/stripeCheckoutReconcile");

const ORDER_ROW_FIXED = {
  id: 42,
  created_by_user_id: 7,
  stripe_checkout_session_id: "cs_latest",
  selected_bid_id: null,
};

describe("assertCheckoutSessionAuthorizedForOrder", () => {
  async function mockClient(rowsForPending) {
    return {
      query: async (sql) => {
        const s = String(sql);
        if (s.includes("client_order_payments")) {
          return { rows: rowsForPending };
        }
        return { rows: [] };
      },
    };
  }

  it("accepts paid session when orders.stripe_checkout_session_id matches", async () => {
    const session = {
      id: "cs_latest",
      client_reference_id: "42",
      metadata: { orderId: "42", purpose: PURPOSE_FIXED, clientUserId: "7" },
    };
    const out = await assertCheckoutSessionAuthorizedForOrder(await mockClient([]), {
      order: ORDER_ROW_FIXED,
      session,
      orderId: 42,
      purpose: PURPOSE_FIXED,
    });
    assert.strictEqual(out.ok, true);
  });

  it("accepts older session id when metadata + client_reference match (pending row optional)", async () => {
    const session = {
      id: "cs_old_tab",
      client_reference_id: "42",
      metadata: { orderId: "42", purpose: PURPOSE_FIXED, clientUserId: "7" },
    };
    const out = await assertCheckoutSessionAuthorizedForOrder(await mockClient([]), {
      order: ORDER_ROW_FIXED,
      session,
      orderId: 42,
      purpose: PURPOSE_FIXED,
    });
    assert.strictEqual(out.ok, true);
  });

  it("accepts older session when a pending client_order_payments row matches session id", async () => {
    const session = {
      id: "cs_old_tab",
      client_reference_id: "42",
      metadata: { orderId: "42", purpose: PURPOSE_FIXED, clientUserId: "7" },
    };
    const out = await assertCheckoutSessionAuthorizedForOrder(await mockClient([{ id: 1 }]), {
      order: ORDER_ROW_FIXED,
      session,
      orderId: 42,
      purpose: PURPOSE_FIXED,
    });
    assert.strictEqual(out.ok, true);
  });

  it("rejects when metadata clientUserId does not match order owner", async () => {
    const session = {
      id: "cs_x",
      client_reference_id: "42",
      metadata: { orderId: "42", purpose: PURPOSE_FIXED, clientUserId: "999" },
    };
    const out = await assertCheckoutSessionAuthorizedForOrder(await mockClient([]), {
      order: ORDER_ROW_FIXED,
      session,
      orderId: 42,
      purpose: PURPOSE_FIXED,
    });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, "metadata_client_mismatch");
  });

  it("rejects when metadata orderId does not match", async () => {
    const session = {
      id: "cs_x",
      client_reference_id: "42",
      metadata: { orderId: "99", purpose: PURPOSE_FIXED, clientUserId: "7" },
    };
    const out = await assertCheckoutSessionAuthorizedForOrder(await mockClient([]), {
      order: ORDER_ROW_FIXED,
      session,
      orderId: 42,
      purpose: PURPOSE_FIXED,
    });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, "metadata_order_mismatch");
  });

  it("rejects bid session when client_reference_id does not match order:bid", async () => {
    const session = {
      id: "cs_bid",
      client_reference_id: "42:5",
      metadata: { orderId: "42", bidId: "3", purpose: PURPOSE_BID, clientUserId: "7" },
    };
    const order = {
      ...ORDER_ROW_FIXED,
      project_type: "bidding",
      selected_bid_id: 3,
    };
    const out = await assertCheckoutSessionAuthorizedForOrder(await mockClient([]), {
      order,
      session,
      orderId: 42,
      purpose: PURPOSE_BID,
    });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, "client_reference_mismatch");
  });
});

describe("resolvePaidCheckoutSessionForClientOrder", () => {
  it("returns first paid session when oldest pending row is paid but order pointer is newer unpaid", async () => {
    const order = { ...ORDER_ROW_FIXED, stripe_checkout_session_id: "cs_new_open" };
    const pendingRows = [{ provider_checkout_session_id: "cs_old_paid" }];
    const db = {
      query: async (sql) => {
        if (String(sql).includes("client_order_payments")) {
          return { rows: pendingRows };
        }
        return { rows: [] };
      },
    };
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async (id) => {
            if (id === "cs_old_paid") {
              return {
                id: "cs_old_paid",
                payment_status: "paid",
                client_reference_id: "42",
                metadata: {
                  orderId: "42",
                  purpose: PURPOSE_FIXED,
                  clientUserId: "7",
                },
                payment_intent: "pi_a",
              };
            }
            return {
              id: "cs_new_open",
              payment_status: "open",
              client_reference_id: "42",
              metadata: {
                orderId: "42",
                purpose: PURPOSE_FIXED,
                clientUserId: "7",
              },
            };
          },
        },
      },
    };
    const session = await resolvePaidCheckoutSessionForClientOrder(stripe, db, {
      order,
      orderId: 42,
      purpose: PURPOSE_FIXED,
      bidId: null,
    });
    assert.strictEqual(session?.id, "cs_old_paid");
  });
});
