const { pool } = require("../config/db");
const { ROLES } = require("../constants/roles");

/**
 * Aggregates for dashboard profile summary cards (no fabricated metrics).
 */
async function getDashboardStats(userId, legacyRole) {
  const id = Number(userId);
  if (!Number.isFinite(id)) {
    return {};
  }

  if (legacyRole === ROLES.FREELANCER) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM orders
            WHERE assigned_freelancer_id = $1 AND order_status = 'completed') AS completed_orders,
         (SELECT COUNT(*)::int FROM orders
            WHERE assigned_freelancer_id = $1 AND order_status IN ('assigned', 'in_progress')) AS active_orders,
         (SELECT COUNT(*)::int FROM financial_claims
            WHERE freelancer_id = $1
              AND status IN ('pending', 'accepted', 'frozen', 'requires_in_person_review')) AS open_claims`,
      [id],
    );
    const r = rows[0] || {};
    return {
      completedOrders: Number(r.completed_orders || 0),
      activeOrders: Number(r.active_orders || 0),
      openClaims: Number(r.open_claims || 0),
    };
  }

  if (legacyRole === ROLES.CLIENT) {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM orders WHERE created_by_user_id = $1) AS orders_created,
         (SELECT COUNT(*)::int FROM orders
            WHERE created_by_user_id = $1
              AND order_status IN ('published', 'assigned', 'in_progress')) AS active_orders,
         (SELECT COUNT(*)::int FROM orders
            WHERE created_by_user_id = $1 AND order_status = 'completed') AS completed_orders`,
      [id],
    );
    const r = rows[0] || {};
    return {
      ordersCreated: Number(r.orders_created || 0),
      activeOrders: Number(r.active_orders || 0),
      completedOrders: Number(r.completed_orders || 0),
    };
  }

  return {};
}

module.exports = {
  getDashboardStats,
};
