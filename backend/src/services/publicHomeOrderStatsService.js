const { pool } = require("../config/db");
const { ORDER_STATUSES } = require("./orderFlowService");

/**
 * Homepage “open pipeline” — pre-assignment / marketplace / payment gates.
 * Mirrors canonical status strings from orderFlowService.ORDER_STATUSES.
 */
const OPEN_PROJECT_STATUSES = Object.freeze([
  ORDER_STATUSES.PENDING_PAYMENT,
  ORDER_STATUSES.PUBLISHED,
  ORDER_STATUSES.OPEN_FOR_FREELANCERS,
  ORDER_STATUSES.OPEN_FOR_BIDS,
  ORDER_STATUSES.AWAITING_PAYMENT_AFTER_BID_SELECTION,
  ORDER_STATUSES.PENDING_FREELANCER_ACCEPTANCE,
]);

/**
 * Active execution after a freelancer is in the loop (assigned through client review).
 */
const IN_PROGRESS_PROJECT_STATUSES = Object.freeze([
  ORDER_STATUSES.ASSIGNED,
  ORDER_STATUSES.IN_PROGRESS,
  ORDER_STATUSES.READY_FOR_WORK,
  ORDER_STATUSES.PENDING_CLIENT_REVIEW,
]);

/**
 * Aggregate counts from real `orders` rows only (not training `fake_orders`).
 */
async function getPublicHomeOrderCounts() {
  const { rows } = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE order_status = ANY($1::text[]))::int AS open_projects,
      COUNT(*) FILTER (WHERE order_status = ANY($2::text[]))::int AS in_progress_projects,
      COUNT(*) FILTER (WHERE order_status = $3)::int AS completed_projects
    FROM orders
    `,
    [OPEN_PROJECT_STATUSES, IN_PROGRESS_PROJECT_STATUSES, ORDER_STATUSES.COMPLETED]
  );
  const row = rows[0] || {};
  return {
    openProjects: Number(row.open_projects) || 0,
    inProgressProjects: Number(row.in_progress_projects) || 0,
    completedProjects: Number(row.completed_projects) || 0,
  };
}

module.exports = {
  getPublicHomeOrderCounts,
  OPEN_PROJECT_STATUSES,
  IN_PROGRESS_PROJECT_STATUSES,
};
