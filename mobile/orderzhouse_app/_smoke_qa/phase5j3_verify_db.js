require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const bids = await pool.query(
    `SELECT id, order_id, status, amount::text AS amount, proposal_message, updated_at
     FROM order_freelancer_bids
     WHERE id IN (75, 76) OR order_id IN (30113, 30114)
     ORDER BY id`
  );
  console.log("BIDS_DB", JSON.stringify(bids.rows, null, 2));

  const orders = await pool.query(
    `SELECT id, title, order_status, project_type, payment_status,
            assigned_freelancer_id, is_open_for_pool, is_published
     FROM orders
     WHERE id IN (30113, 30114)`
  );
  console.log("ORDERS_DB", JSON.stringify(orders.rows, null, 2));

  // Recent rejects/accepts on QA5J3 / QA5J2 orders if user used different ones
  const recent = await pool.query(
    `SELECT b.id AS bid_id, b.order_id, b.status, b.amount::text AS amount, b.updated_at,
            o.title, o.order_status, o.assigned_freelancer_id, o.payment_status
     FROM order_freelancer_bids b
     JOIN orders o ON o.id = b.order_id
     WHERE o.title LIKE 'QA5J3-%' OR o.title LIKE 'QA5J2%'
     ORDER BY b.updated_at DESC
     LIMIT 20`
  );
  console.log("RECENT_QA_BIDS", JSON.stringify(recent.rows, null, 2));

  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
