const Stripe = require("stripe");
const { pool } = require("../config/db");
const { amountMajorToStripeMinor } = require("../utils/stripeMoney");
const orderFlowService = require("./orderFlowService");

function getStripeOrNull() {
  const key = process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
  if (!key) return null;
  return new Stripe(key);
}

async function createClientFixedOrderCheckoutSession({ clientUserId, orderId }) {
  const stripe = getStripeOrNull();
  if (!stripe) {
    const err = new Error("Stripe is not configured on the server.");
    err.statusCode = 503;
    throw err;
  }

  const uid = Number(clientUserId);
  const oid = Number(orderId);
  if (!Number.isInteger(uid) || uid < 1 || !Number.isInteger(oid) || oid < 1) {
    const err = new Error("Invalid order.");
    err.statusCode = 400;
    throw err;
  }

  const clientUrl = String(process.env.CLIENT_URL || "").replace(/\/$/, "");
  if (!clientUrl) {
    const err = new Error("CLIENT_URL is not configured.");
    err.statusCode = 500;
    throw err;
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      `SELECT *
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [oid],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== uid) {
      const err = new Error("You cannot pay for this order.");
      err.statusCode = 403;
      throw err;
    }
    if (order.project_type !== "fixed") {
      const err = new Error("Checkout is only used for fixed-price client orders.");
      err.statusCode = 400;
      throw err;
    }
    if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
      const err = new Error("This order is not awaiting payment.");
      err.statusCode = 409;
      throw err;
    }
    if (order.payment_status !== "pending" && order.payment_status !== "unpaid") {
      const err = new Error("This order is not awaiting payment.");
      err.statusCode = 409;
      throw err;
    }

    const currency = String(order.currency_code || "")
      .trim()
      .toLowerCase();
    const budget = order.budget != null ? Number(order.budget) : null;
    if (!currency || !Number.isFinite(budget) || budget <= 0) {
      const err = new Error("Order is missing a valid amount or currency.");
      err.statusCode = 400;
      throw err;
    }

    const amountMinor = amountMajorToStripeMinor(budget, order.currency_code);
    if (amountMinor == null || amountMinor < 1) {
      const err = new Error("Could not compute payment amount for Stripe.");
      err.statusCode = 400;
      throw err;
    }

    const successUrl = `${clientUrl}/dashboard/client/my-orders?paid=1&orderId=${encodeURIComponent(String(oid))}`;
    const cancelUrl = `${clientUrl}/dashboard/client/my-orders?cancelled=1&orderId=${encodeURIComponent(String(oid))}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(oid),
      metadata: {
        orderId: String(oid),
        purpose: "client_fixed_order",
        clientUserId: String(uid),
        expectedAmountMinor: String(amountMinor),
        currency: currency.toUpperCase(),
      },
      payment_intent_data: {
        metadata: {
          orderId: String(oid),
          purpose: "client_fixed_order",
          expectedAmountMinor: String(amountMinor),
          currency: currency.toUpperCase(),
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinor,
            product_data: {
              name: String(order.title || "Order").slice(0, 120),
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await db.query(
      `UPDATE orders
         SET stripe_checkout_session_id = $2,
             stripe_checkout_expected_amount_minor = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [oid, session.id, amountMinor],
    );

    await db.query("COMMIT");

    if (!session.url) {
      const err = new Error("Stripe did not return a checkout URL.");
      err.statusCode = 502;
      throw err;
    }

    return { checkoutUrl: session.url, sessionId: session.id };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

module.exports = {
  getStripeOrNull,
  createClientFixedOrderCheckoutSession,
};
