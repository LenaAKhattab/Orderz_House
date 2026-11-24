/**
 * Smart Orders S6 — management reporting (bounded aggregate SQL only; never loads orders into memory).
 *
 * Money is reported by currency and by kind, keeping these strictly apart:
 *   quoted (issued, not paid)  ≠  received (paid quotes / client payments)  ≠  settled (closed settlements).
 * The Freelancer WhatsApp external-ID intake keeps its own section (not mixed with guest customer orders).
 */

const { pool } = require("../../config/db");
const m = require("./money");

function range(from, to) {
  const f = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const t = to ? new Date(to) : new Date();
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f > t) {
    const e = new Error("نطاق التاريخ غير صالح.");
    e.statusCode = 400;
    e.publicCode = "FINANCE_REPORT_RANGE_INVALID";
    throw e;
  }
  if (t.getTime() - f.getTime() > 400 * 86400000) {
    const e = new Error("الحد الأقصى للنطاق 400 يوم.");
    e.statusCode = 400;
    e.publicCode = "FINANCE_REPORT_RANGE_INVALID";
    throw e;
  }
  return [f.toISOString(), t.toISOString()];
}

const fm = (v) => m.fromMilli(BigInt(v || 0), 3);

const { runLimited } = require("./runLimited");

async function getManagementReport({ from, to, categoryId = null } = {}) {
  const [f, t] = range(from, to);
  const cat = categoryId ? Number(categoryId) : null;
  const catSql = cat ? "AND o.category_id = $3" : "";
  const p = cat ? [f, t, cat] : [f, t];
  const q = (sql, params = p) => () => pool.query(sql, params).then((r) => r.rows);

  const [orders, byCategory, activation, quoted, received, clientPaid, settled, pending, exceptions, rewards, whatsapp] = await runLimited([
    q(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE o.customer_mode = 'existing')::int AS existing_customer,
              COUNT(*) FILTER (WHERE o.customer_mode = 'new_account')::int AS new_account,
              COUNT(*) FILTER (WHERE o.customer_mode = 'guest')::int AS guest,
              COUNT(*) FILTER (WHERE o.source_type = 'client_created')::int AS client_marketplace,
              COUNT(*) FILTER (WHERE o.customer_mode IS NULL AND o.source_type <> 'client_created' AND COALESCE(o.order_channel, '') <> 'whatsapp')::int AS internal,
              COUNT(*) FILTER (WHERE o.order_channel = 'whatsapp')::int AS whatsapp_channel,
              COUNT(*) FILTER (WHERE o.order_status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE o.order_status = 'cancelled')::int AS cancelled
         FROM orders o
        WHERE o.created_at >= $1 AND o.created_at < $2 AND COALESCE(o.is_archived, false) = false ${catSql}`,
    ),
    q(
      `SELECT c.id, c.name, COUNT(*)::int AS n FROM orders o JOIN categories c ON c.id = o.category_id
        WHERE o.created_at >= $1 AND o.created_at < $2 ${catSql}
        GROUP BY c.id, c.name ORDER BY n DESC LIMIT 15`,
    ),
    q(
      `SELECT COUNT(*) FILTER (WHERE o.customer_mode IN ('new_account', 'guest'))::int AS eligible,
              COUNT(*) FILTER (WHERE o.customer_mode IN ('new_account', 'guest') AND o.customer_account_linked_at IS NOT NULL)::int AS activated
         FROM orders o WHERE o.created_at >= $1 AND o.created_at < $2 ${catSql}`,
    ),
    q(
      `SELECT q.currency, COUNT(*)::int AS n, COALESCE(SUM(q.total_amount), 0)::text AS amount
         FROM order_quotes q JOIN orders o ON o.id = q.order_id
        WHERE q.issued_at >= $1 AND q.issued_at < $2 AND q.status IN ('issued', 'accepted') AND q.payment_status = 'unpaid' ${catSql}
        GROUP BY q.currency`,
    ),
    q(
      `SELECT q.currency, q.payment_status, COUNT(*)::int AS n, COALESCE(SUM(q.paid_amount_minor), 0)::text AS minor
         FROM order_quotes q JOIN orders o ON o.id = q.order_id
        WHERE q.paid_at >= $1 AND q.paid_at < $2 AND q.payment_status IN ('paid', 'paid_inactive') ${catSql}
        GROUP BY q.currency, q.payment_status`,
    ),
    q(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(cop.amount), 0)::text AS amount
         FROM client_order_payments cop JOIN orders o ON o.id = cop.order_id
        WHERE cop.status = 'paid' AND cop.quote_id IS NULL AND cop.paid_at >= $1 AND cop.paid_at < $2 ${catSql}`,
    ),
    q(
      `WITH latest AS (
         SELECT DISTINCT ON (s.order_id) s.* FROM order_settlements s ORDER BY s.order_id, s.version DESC
       )
       SELECT COUNT(*)::int AS n, COALESCE(SUM(l.gross_milli),0)::text AS gross, COALESCE(SUM(l.refunds_milli),0)::text AS refunds,
              COALESCE(SUM(l.tax_milli),0)::text AS tax, COALESCE(SUM(l.fees_milli),0)::text AS fees,
              COALESCE(SUM(l.quality_checks_milli),0)::text AS qc, COALESCE(SUM(l.direct_costs_milli),0)::text AS costs,
              COALESCE(SUM(l.net_milli),0)::text AS net, COALESCE(SUM(l.freelancer_milli),0)::text AS freelancer,
              COALESCE(SUM(l.company_milli),0)::text AS company
         FROM latest l JOIN orders o ON o.id = l.order_id
        WHERE l.closed_at >= $1 AND l.closed_at < $2 ${catSql}`,
    ),
    q(
      `SELECT COUNT(*)::int AS n FROM orders o
        WHERE o.order_status = 'completed' AND o.source_type <> 'client_created'
          AND o.updated_at >= $1 AND o.updated_at < $2 ${catSql}
          AND NOT EXISTS (SELECT 1 FROM order_settlements s WHERE s.order_id = o.id)`,
    ),
    q(`SELECT kind, status, COUNT(*)::int AS n FROM payment_exceptions WHERE created_at >= $1 AND created_at < $2 GROUP BY kind, status`, [f, t]),
    q(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(pool_milli), 0)::text AS pool,
              COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid
         FROM reward_periods WHERE status <> 'draft' AND period_month >= date_trunc('month', $1::timestamptz) AND period_month < $2`,
      [f, t],
    ),
    q(
      `SELECT status, COUNT(*)::int AS n FROM external_order_intakes WHERE created_at >= $1 AND created_at < $2 GROUP BY status`,
      [f, t],
    ),
  ]);

  const s = settled[0];
  return {
    range: { from: f, to: t, categoryId: cat ? String(cat) : null },
    orders: orders[0],
    byCategory: byCategory.map((r) => ({ categoryId: String(r.id), name: r.name, count: r.n })),
    accountActivation: activation[0],
    money: {
      quotedUnpaid: quoted.map((r) => ({ currency: r.currency, count: r.n, amount: String(r.amount) })),
      receivedQuotePayments: received
        .filter((r) => r.payment_status === "paid")
        .map((r) => ({ currency: r.currency, count: r.n, amount: fm(m.stripeMinorToMilli(r.minor, r.currency)) })),
      unallocatedReceipts: received
        .filter((r) => r.payment_status === "paid_inactive")
        .map((r) => ({ currency: r.currency, count: r.n, amount: fm(m.stripeMinorToMilli(r.minor, r.currency)) })),
      receivedClientMarketplace: { currency: "JOD", count: clientPaid[0].n, amount: String(clientPaid[0].amount) },
      settled: {
        baseCurrency: "JOD",
        count: s.n,
        gross: fm(s.gross),
        refunds: fm(s.refunds),
        tax: fm(s.tax),
        fees: fm(s.fees),
        qualityChecks: fm(s.qc),
        directCosts: fm(s.costs),
        net: fm(s.net),
        freelancerCompensation: fm(s.freelancer),
        companyShare: fm(s.company),
      },
    },
    pendingSettlements: pending[0].n,
    paymentExceptions: exceptions,
    employeeRewards: { periods: rewards[0].n, paidPeriods: rewards[0].paid, pool: fm(rewards[0].pool) },
    whatsappIntake: Object.fromEntries(whatsapp.map((r) => [r.status, r.n])),
  };
}

module.exports = { getManagementReport };
