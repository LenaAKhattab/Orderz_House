/**
 * Smart Orders S5 — finance hooks for quote payments (Stripe webhooks).
 *
 * - Processor fee: read from the ACTUAL Stripe balance transaction of the charge (never estimated);
 *   recorded once per balance transaction (idempotent), in the balance currency.
 * - Refunds / disputes on a quote payment: recorded as adjustments + an Admin exception.
 *   Nothing here issues a refund — Stripe already moved (or is disputing) the money.
 */

const { pool } = require("../../config/db");
const m = require("./money");
const finance = require("./orderFinanceService");

async function findQuoteByPaymentIntent(db, paymentIntentId) {
  if (!paymentIntentId) return null;
  const { rows } = await db.query(
    `SELECT q.id, q.order_id, q.version, q.currency, q.payment_status
       FROM order_quotes q WHERE q.stripe_payment_intent_id = $1 LIMIT 1`,
    [String(paymentIntentId)],
  );
  return rows[0] || null;
}

/** Best-effort after the payment is applied; a missing fee never blocks the payment outcome. */
async function recordQuotePaymentFee(session, { stripe, db = pool } = {}) {
  try {
    // Integration tests set FINANCE_STRIPE_FEE_LOOKUP=0 so they never call the Stripe API.
    if (process.env.FINANCE_STRIPE_FEE_LOOKUP === "0") return { status: "skipped", reason: "lookup_disabled" };
    if (!stripe || !session?.payment_intent) return { status: "skipped", reason: "no_stripe_or_intent" };
    const q = await findQuoteByPaymentIntent(db, session.payment_intent);
    if (!q) return { status: "skipped", reason: "quote_not_found" };
    const pi = await stripe.paymentIntents.retrieve(String(session.payment_intent), {
      expand: ["latest_charge.balance_transaction"],
    });
    const bt = pi?.latest_charge?.balance_transaction;
    if (!bt || typeof bt !== "object" || !bt.id) return { status: "skipped", reason: "no_balance_transaction" };
    const feeMinor = Number(bt.fee);
    if (!Number.isInteger(feeMinor) || feeMinor <= 0) return { status: "skipped", reason: "no_fee" };
    const currency = String(bt.currency || "").toUpperCase();
    const milli = m.stripeMinorToMilli(feeMinor, currency);
    const r = await finance.recordCost(
      {
        orderId: q.order_id,
        kind: "payment_fee",
        amount: m.fromMilli(milli, 3),
        currency,
        description: `Stripe processing fee (quote v${q.version})`,
        sourceRef: String(bt.id),
      },
      db,
    );
    return { status: r.duplicate ? "duplicate" : "recorded", balanceTransaction: bt.id };
  } catch (e) {
    console.error("[finance] quote fee not recorded:", e?.message || e);
    return { status: "failed" };
  }
}

/**
 * charge.refunded / charge.dispute.created / charge.dispute.closed for a quote payment.
 * Returns { status: "ignored" } for charges that are not quote payments.
 */
async function applyQuoteChargeRefundOrDispute(obj, eventType, { db = pool } = {}) {
  const isDispute = eventType.startsWith("charge.dispute.");
  const paymentIntent = obj?.payment_intent || null;
  const q = await findQuoteByPaymentIntent(db, paymentIntent);
  if (!q) return { status: "ignored", reason: "not_quote_payment" };
  const currency = String(obj.currency || q.currency).toUpperCase();

  if (eventType === "charge.refunded") {
    const refunds = Array.isArray(obj?.refunds?.data) ? obj.refunds.data : [];
    let recorded = 0;
    if (refunds.length) {
      for (const r of refunds) {
        if (r.status && !["succeeded", "pending"].includes(String(r.status))) continue;
        // eslint-disable-next-line no-await-in-loop
        const res = await finance.recordAdjustment(
          { orderId: q.order_id, kind: "refund", amount: m.fromMilli(m.stripeMinorToMilli(r.amount, currency), 3), currency,
            reason: `Stripe refund ${r.id} (quote v${q.version})`, sourceRef: String(r.id) },
          db,
        );
        if (!res.duplicate) recorded += 1;
      }
    } else {
      // Refund list not expanded: record the cumulative delta not yet recorded for this charge.
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(amount_milli), 0)::text AS s FROM order_financial_adjustments
          WHERE order_id = $1 AND kind = 'refund' AND source_ref LIKE $2`,
        [q.order_id, `${obj.id}:%`],
      );
      const total = m.stripeMinorToMilli(Number(obj.amount_refunded || 0), currency);
      const delta = total - BigInt(rows[0].s);
      if (delta > 0n) {
        await finance.recordAdjustment(
          { orderId: q.order_id, kind: "refund", amount: m.fromMilli(delta, 3), currency,
            reason: `Stripe refund on ${obj.id} (quote v${q.version})`, sourceRef: `${obj.id}:${obj.amount_refunded}` },
          db,
        );
        recorded += 1;
      }
    }
    await finance.recordPaymentException(db, {
      orderId: q.order_id,
      quoteId: q.id,
      kind: "refund",
      amountMilli: m.stripeMinorToMilli(Number(obj.amount_refunded || 0), currency),
      currency,
      detail: { chargeId: obj.id, amountRefundedMinor: obj.amount_refunded, quoteVersion: q.version },
      sourceRef: `${obj.id}:${obj.amount_refunded}`,
    });
    return { status: "applied", outcome: "quote_refund_recorded", recorded };
  }

  if (isDispute) {
    const disputeId = String(obj.id);
    const amountMilli = m.stripeMinorToMilli(Number(obj.amount || 0), currency);
    await finance.recordPaymentException(db, {
      orderId: q.order_id,
      quoteId: q.id,
      kind: "dispute",
      amountMilli,
      currency,
      detail: { disputeId, status: obj.status, reason: obj.reason || null, event: eventType },
      sourceRef: `${disputeId}:${eventType}`,
    });
    if (eventType === "charge.dispute.closed" && String(obj.status) === "lost" && amountMilli > 0n) {
      await finance.recordAdjustment(
        { orderId: q.order_id, kind: "dispute_loss", amount: m.fromMilli(amountMilli, 3), currency,
          reason: `Stripe dispute ${disputeId} lost (quote v${q.version})`, sourceRef: disputeId },
        db,
      );
    }
    return { status: "applied", outcome: "quote_dispute_recorded" };
  }
  return { status: "ignored", reason: "unhandled" };
}

module.exports = { recordQuotePaymentFee, applyQuoteChargeRefundOrDispute };
