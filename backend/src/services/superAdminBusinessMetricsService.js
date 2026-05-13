/**
 * Business KPIs from Postgres (revenue, subscriptions). Used by Super Admin analytics overview.
 */

const { pool } = require("../config/db");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sum of paid order amounts + paid self-serve subscription plan prices for "today" (server local date). */
async function getRevenueTodayJod() {
  const { rows: oRows } = await pool.query(
    `SELECT COALESCE(SUM(payment_amount), 0)::numeric AS total
     FROM orders
     WHERE payment_status = 'paid'
       AND paid_at IS NOT NULL
       AND paid_at >= date_trunc('day', NOW())
       AND paid_at < date_trunc('day', NOW()) + INTERVAL '1 day'`,
  );
  const { rows: sRows } = await pool.query(
    `SELECT COALESCE(SUM(pl.price_jod), 0)::numeric AS total
     FROM freelancer_subscriptions fs
     JOIN plans pl ON pl.id = fs.plan_id
     WHERE fs.payment_status = 'paid'
       AND fs.paid_at IS NOT NULL
       AND fs.paid_at >= date_trunc('day', NOW())
       AND fs.paid_at < date_trunc('day', NOW()) + INTERVAL '1 day'`,
  );
  return num(oRows[0]?.total) + num(sRows[0]?.total);
}

/** Paid freelancer subscriptions currently active (current row + active status + not past expiry). */
async function getActivePaidSubscriptionsCount() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM freelancer_subscriptions
     WHERE is_current = TRUE
       AND status = 'active'
       AND (expiry_date IS NULL OR expiry_date > NOW())`,
  );
  return Math.trunc(Number(rows[0]?.n) || 0);
}

/**
 * Daily revenue (JOD) for last 7 calendar days including today (server TZ).
 * Combines orders.payment_amount and subscription plan prices on subscription paid_at days.
 */
async function getRevenueByDayLast7Days() {
  const { rows } = await pool.query(
    `WITH days AS (
       SELECT generate_series(
         (CURRENT_DATE - 6)::date,
         CURRENT_DATE::date,
         '1 day'::interval
       )::date AS day
     ),
     order_rev AS (
       SELECT date_trunc('day', paid_at)::date AS day, SUM(payment_amount)::numeric AS amt
       FROM orders
       WHERE payment_status = 'paid'
         AND paid_at IS NOT NULL
         AND paid_at >= (CURRENT_DATE - 6)::timestamptz
         AND paid_at < (CURRENT_DATE + 1)::timestamptz
       GROUP BY 1
     ),
     sub_rev AS (
       SELECT date_trunc('day', fs.paid_at)::date AS day, SUM(pl.price_jod)::numeric AS amt
       FROM freelancer_subscriptions fs
       JOIN plans pl ON pl.id = fs.plan_id
       WHERE fs.payment_status = 'paid'
         AND fs.paid_at IS NOT NULL
         AND fs.paid_at >= (CURRENT_DATE - 6)::timestamptz
         AND fs.paid_at < (CURRENT_DATE + 1)::timestamptz
       GROUP BY 1
     )
     SELECT d.day::text AS day,
            COALESCE(o.amt, 0)::numeric + COALESCE(s.amt, 0)::numeric AS revenue_jod
     FROM days d
     LEFT JOIN order_rev o ON o.day = d.day
     LEFT JOIN sub_rev s ON s.day = d.day
     ORDER BY d.day ASC`,
  );
  return rows.map((r) => ({
    date: String(r.day),
    revenueJod: num(r.revenue_jod),
  }));
}

module.exports = {
  getRevenueTodayJod,
  getActivePaidSubscriptionsCount,
  getRevenueByDayLast7Days,
};
