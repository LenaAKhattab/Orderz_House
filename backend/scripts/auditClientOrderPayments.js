#!/usr/bin/env node
/**
 * Audit client order payment attempts and near-duplicate unpaid orders (read-only by default).
 *
 * Reports, as aggregates only:
 *   - unpaid fixed-price client orders awaiting Stripe Checkout (total / last 24h / last 7 days)
 *   - near-duplicate unpaid pairs: same client + same title, created within 15 minutes, both unpaid
 *     (candidates only — never merged or deleted; the client can «Continue payment» or «Cancel order»)
 *   - client_order_payments rows by status, and orders with more than one paid row
 *   - Stripe state of every `pending` payment row (open / paid / processing / expired / missing / unknown)
 *
 * With --apply, only `pending` rows whose Session is definitively `expired` at Stripe are marked `expired`
 * (history only, as the checkout.session.expired webhook does). Orders are never changed or deleted, and a
 * Session paid at Stripe is only counted: it is applied through the trusted confirmation path when the client
 * opens «Continue payment» (or by the webhook), not here.
 *
 * Usage (dry run is the default):
 *   node scripts/auditClientOrderPayments.js
 *   node scripts/auditClientOrderPayments.js --apply
 *   node scripts/auditClientOrderPayments.js --limit 200
 * Output: aggregate counts only (no ids, titles, names, emails or amounts).
 */
const { pool } = require("../src/config/db");
const stripeCheckout = require("../src/services/stripeCheckoutService");

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const APPLY = process.argv.includes("--apply");
const LIMIT = argValue("--limit", 2000);

async function main() {
  const report = { mode: APPLY ? "apply" : "dry-run" };

  report.unpaidFixedOrders = (
    await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS last24h,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS last7d
         FROM orders
        WHERE source_type = 'client_created' AND project_type = 'fixed' AND order_status = 'pending_payment'`,
    )
  ).rows[0];

  report.nearDuplicateUnpaidPairs = (
    await pool.query(
      `SELECT COUNT(*)::int AS pairs, COUNT(DISTINCT o.created_by_user_id)::int AS clients,
              COUNT(*) FILTER (WHERE o.created_at > NOW() - INTERVAL '7 days')::int AS last7d,
              COUNT(*) FILTER (WHERE o.client_creation_key IS NOT NULL AND o.client_creation_key = p.client_creation_key)::int AS same_attempt
         FROM orders o
         JOIN orders p ON p.id < o.id AND p.created_by_user_id = o.created_by_user_id AND p.title = o.title
                      AND o.created_at - p.created_at BETWEEN INTERVAL '0 seconds' AND INTERVAL '15 minutes'
        WHERE o.source_type = 'client_created' AND p.source_type = 'client_created'
          AND o.order_status = 'pending_payment' AND p.order_status = 'pending_payment'`,
    )
  ).rows[0];

  report.paymentRows = Object.fromEntries(
    (await pool.query(`SELECT status, COUNT(*)::int AS n FROM client_order_payments GROUP BY 1 ORDER BY 1`)).rows.map(
      (r) => [r.status, r.n],
    ),
  );
  report.ordersWithMultiplePaidRows = (
    await pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT order_id FROM client_order_payments WHERE status = 'paid' GROUP BY 1 HAVING COUNT(*) > 1) x`,
    )
  ).rows[0].n;

  const stripe = stripeCheckout.getStripeOrNull();
  const pendingStates = { open: 0, paid: 0, processing: 0, expired: 0, missing: 0, unknown: 0, noSession: 0 };
  let markedExpired = 0;
  if (stripe) {
    const { rows } = await pool.query(
      `SELECT id, provider_checkout_session_id AS sid
         FROM client_order_payments
        WHERE status = 'pending'
        ORDER BY id ASC
        LIMIT $1`,
      [LIMIT],
    );
    for (const row of rows) {
      if (!row.sid) {
        pendingStates.noSession += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const { state } = await stripeCheckout.readClientCheckoutSessionState(stripe, row.sid);
      pendingStates[state] = (pendingStates[state] || 0) + 1;
      if (APPLY && state === "expired") {
        // eslint-disable-next-line no-await-in-loop
        const r = await pool.query(
          `UPDATE client_order_payments SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
          [row.id],
        );
        markedExpired += r.rowCount;
      }
    }
    report.pendingRowsScanned = rows.length;
  } else {
    report.stripe = "not_configured";
  }
  report.pendingRowsAtStripe = pendingStates;
  report.markedExpired = markedExpired;

  // eslint-disable-next-line no-console
  console.log(`CLIENT_ORDER_PAYMENTS_AUDIT ${JSON.stringify(report)}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("CLIENT_ORDER_PAYMENTS_AUDIT_FAILED", err?.code || err?.name || "error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
