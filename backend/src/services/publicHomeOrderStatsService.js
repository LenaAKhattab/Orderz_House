const { pool } = require("../config/db");
const { ORDER_STATUSES } = require("./orderFlowService");
const {
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("./trainingPoolEligibility");

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

/** Pool-visible real orders for hero “available now”. */
const AVAILABLE_REAL_STATUSES = Object.freeze([
  ORDER_STATUSES.OPEN_FOR_FREELANCERS,
  ORDER_STATUSES.OPEN_FOR_BIDS,
]);

const HOME_ORDER_STATS_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.PUBLIC_HOME_ORDER_STATS_CACHE_MS) || 20_000, 15_000),
  30_000,
);

/** @type {{ value: object | null, expires: number }} */
let orderStatsCache = { value: null, expires: 0 };

async function queryHeroOrderCounts() {
  const { rows } = await pool.query(
    `
    SELECT
      (
        SELECT COUNT(*)::int
        FROM orders o
        WHERE o.order_status = ANY($1::text[])
          AND o.is_published = TRUE
          AND o.is_open_for_pool = TRUE
          AND COALESCE(o.is_archived, FALSE) = FALSE
      ) AS available_real,
      (
        SELECT COUNT(DISTINCT fo.id)::int
        ${trainingPoolVisibleFromSql("fo")}
        WHERE ${trainingPoolVisibleWhereSql({ publicAudienceOnly: true, alias: "fo" })}
      ) AS available_training,
      (
        SELECT COUNT(*)::int
        FROM orders o
        WHERE o.order_status = $2
          AND COALESCE(o.is_archived, FALSE) = FALSE
      ) AS completed_real,
      (
        SELECT COUNT(*)::int
        FROM fake_orders fo
        WHERE fo.was_marketplace_visible = TRUE
          AND fo.first_visible_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            ${trainingPoolVisibleFromSql("fo_vis")}
            WHERE fo_vis.id = fo.id
              AND ${trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis" })}
          )
      ) AS training_rotations_completed,
      COUNT(*) FILTER (WHERE order_status = ANY($3::text[]))::int AS open_projects,
      COUNT(*) FILTER (WHERE order_status = ANY($4::text[]))::int AS in_progress_projects,
      COUNT(*) FILTER (WHERE order_status = $2)::int AS completed_projects
    FROM orders
    `,
    [
      AVAILABLE_REAL_STATUSES,
      ORDER_STATUSES.COMPLETED,
      OPEN_PROJECT_STATUSES,
      IN_PROGRESS_PROJECT_STATUSES,
    ],
  );

  const row = rows[0] || {};
  return aggregateHeroOrderCounts(row);
}

/**
 * Map raw SQL row → homepage hero counts (testable aggregation).
 * @param {Record<string, unknown>} row
 */
function aggregateHeroOrderCounts(row = {}) {
  const availableReal = Number(row.available_real) || 0;
  const availableTraining = Number(row.available_training) || 0;
  const completedReal = Number(row.completed_real) || 0;
  const trainingRotationsCompleted = Number(row.training_rotations_completed) || 0;

  return {
    openProjects: Number(row.open_projects) || 0,
    inProgressProjects: Number(row.in_progress_projects) || 0,
    completedProjects: Number(row.completed_projects) || 0,
    availableOrdersNow: availableReal + availableTraining,
    completedOrders: completedReal + trainingRotationsCompleted,
    availableOrdersNowReal: availableReal,
    availableOrdersNowTraining: availableTraining,
    completedOrdersReal: completedReal,
    trainingRotationsCompleted,
  };
}

/**
 * Aggregate homepage hero order counts (real + training where applicable).
 */
function invalidatePublicHomeOrderStatsCache() {
  orderStatsCache = { value: null, expires: 0 };
}

async function getPublicHomeOrderCounts() {
  if (orderStatsCache.value && orderStatsCache.expires > Date.now()) {
    return orderStatsCache.value;
  }

  const counts = await queryHeroOrderCounts();
  orderStatsCache = {
    value: counts,
    expires: Date.now() + HOME_ORDER_STATS_CACHE_TTL_MS,
  };
  return counts;
}

module.exports = {
  getPublicHomeOrderCounts,
  invalidatePublicHomeOrderStatsCache,
  OPEN_PROJECT_STATUSES,
  IN_PROGRESS_PROJECT_STATUSES,
  AVAILABLE_REAL_STATUSES,
  queryHeroOrderCounts,
  aggregateHeroOrderCounts,
};
