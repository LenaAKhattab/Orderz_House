const Stripe = require("stripe");
const { pool } = require("../config/db");
const orderFlowService = require("../services/orderFlowService");

function getStripeOrNull() {
  const key = process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
  if (!key) return null;
  return new Stripe(key);
}

async function recordWebhookEventOnce(eventId) {
  if (!eventId) return false;
  const { rowCount } = await pool.query(`INSERT INTO stripe_webhook_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
    String(eventId),
  ]);
  return rowCount === 1;
}

/**
 * Express handler: raw body required (mounted with express.raw).
 */
async function handleStripeWebhook(req, res) {
  const stripe = getStripeOrNull();
  const secret = process.env.STRIPE_WEBHOOK_SECRET && String(process.env.STRIPE_WEBHOOK_SECRET).trim();
  if (!stripe || !secret) {
    return res.status(503).send("Stripe webhook not configured");
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed.`);
  }

  const inserted = await recordWebhookEventOnce(event.id);
  if (!inserted) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await applyCheckoutSessionCompleted(session);
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      await applyPaymentIntentOutcome(pi, "paid");
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      await applyPaymentIntentOutcome(pi, "failed");
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[stripe webhook]", e);
    return res.status(500).json({ received: false });
  }

  return res.json({ received: true });
}

async function applyCheckoutSessionCompleted(session) {
  const meta = session.metadata || {};
  const orderId = Number(meta.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) return;
  if (String(meta.purpose || "") !== "client_fixed_order") return;

  const amountTotal = session.amount_total != null ? Number(session.amount_total) : null;
  const currency = String(session.currency || "")
    .trim()
    .toUpperCase();

  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return;
    }
    if (order.payment_status === "paid") {
      await client.query("COMMIT");
      return;
    }
    if (order.stripe_checkout_session_id && session.id && order.stripe_checkout_session_id !== session.id) {
      await client.query("ROLLBACK");
      return;
    }
    if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
      await client.query("ROLLBACK");
      return;
    }
    if (order.project_type !== "fixed" || order.source_type !== "client_created") {
      await client.query("ROLLBACK");
      return;
    }
    if (
      order.stripe_checkout_expected_amount_minor != null &&
      amountTotal != null &&
      Number(order.stripe_checkout_expected_amount_minor) !== amountTotal
    ) {
      await client.query("ROLLBACK");
      return;
    }
    const orderCur = String(order.currency_code || "")
      .trim()
      .toUpperCase();
    if (currency && orderCur && currency !== orderCur) {
      await client.query("ROLLBACK");
      return;
    }

    const paidAt = new Date();
    const major = order.budget != null ? Number(order.budget) : null;

    await client.query(
      `UPDATE orders
         SET payment_status = 'paid',
             order_status = $2,
             is_published = TRUE,
             is_open_for_pool = TRUE,
             stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, $3),
             stripe_payment_intent_id = COALESCE($4, stripe_payment_intent_id),
             paid_at = $5,
             payment_amount = $6,
             payment_currency = $7,
             updated_at = NOW()
       WHERE id = $1
         AND payment_status <> 'paid'`,
      [
        orderId,
        orderFlowService.ORDER_STATUSES.OPEN_FOR_FREELANCERS,
        session.id || null,
        piId,
        paidAt,
        Number.isFinite(major) ? major : null,
        orderCur || null,
      ],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function applyPaymentIntentOutcome(pi, outcomePaymentStatus) {
  const meta = pi.metadata || {};
  const orderId = Number(meta.orderId);
  if (!Number.isInteger(orderId) || orderId < 1) return;
  if (String(meta.purpose || "") !== "client_fixed_order") return;

  const amount = pi.amount != null ? Number(pi.amount) : null;
  const currency = String(pi.currency || "")
    .trim()
    .toUpperCase();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    const order = rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return;
    }

    if (outcomePaymentStatus === "paid") {
      if (order.payment_status === "paid") {
        await client.query("COMMIT");
        return;
      }
      if (pi.id && order.stripe_payment_intent_id && order.stripe_payment_intent_id !== pi.id) {
        await client.query("ROLLBACK");
        return;
      }
      if (order.order_status !== orderFlowService.ORDER_STATUSES.PENDING_PAYMENT) {
        await client.query("ROLLBACK");
        return;
      }
      if (order.project_type !== "fixed" || order.source_type !== "client_created") {
        await client.query("ROLLBACK");
        return;
      }
      if (
        order.stripe_checkout_expected_amount_minor != null &&
        amount != null &&
        Number(order.stripe_checkout_expected_amount_minor) !== amount
      ) {
        await client.query("ROLLBACK");
        return;
      }
      const orderCur = String(order.currency_code || "")
        .trim()
        .toUpperCase();
      if (currency && orderCur && currency !== orderCur) {
        await client.query("ROLLBACK");
        return;
      }

      const paidAt = new Date();
      const major = order.budget != null ? Number(order.budget) : null;

      await client.query(
        `UPDATE orders
           SET payment_status = 'paid',
               order_status = $2,
               is_published = TRUE,
               is_open_for_pool = TRUE,
               stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
               paid_at = $4,
               payment_amount = $5,
               payment_currency = $6,
               updated_at = NOW()
         WHERE id = $1
           AND payment_status <> 'paid'`,
        [
          orderId,
          orderFlowService.ORDER_STATUSES.OPEN_FOR_FREELANCERS,
          pi.id || null,
          paidAt,
          Number.isFinite(major) ? major : null,
          orderCur || null,
        ],
      );
    } else if (outcomePaymentStatus === "failed") {
      await client.query(
        `UPDATE orders
           SET payment_status = 'failed',
               updated_at = NOW()
         WHERE id = $1
           AND order_status = $2
           AND payment_status IN ('pending','unpaid')`,
        [orderId, orderFlowService.ORDER_STATUSES.PENDING_PAYMENT],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { handleStripeWebhook };
