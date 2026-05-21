const { pool } = require("../config/db");

/**
 * Real freelancer order performance metrics (assigned or accepted).
 */
async function getFreelancerPerformanceMetrics(freelancerUserId) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    return emptyPerformance();
  }

  const { rows } = await pool.query(
    `
    WITH base AS (
      SELECT
        o.order_status,
        o.client_revision_note,
        o.due_at,
        COALESCE(o.submitted_at, o.updated_at) AS delivered_at,
        COALESCE(o.started_at, o.accepted_at, o.taken_at) AS work_started_at,
        o.updated_at
      FROM orders o
      WHERE o.assigned_freelancer_id = $1
         OR o.accepted_freelancer_id = $1
    )
    SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE order_status = 'completed')::int AS completed_count,
      COUNT(*) FILTER (WHERE order_status = 'cancelled')::int AS cancelled_count,
      COUNT(*) FILTER (
        WHERE client_revision_note IS NOT NULL
          AND order_status IN ('completed','in_progress','ready_for_work','pending_client_review','cancelled')
      )::int AS revision_orders_count,
      COUNT(*) FILTER (
        WHERE order_status = 'completed' AND due_at IS NOT NULL
      )::int AS completed_with_deadline,
      COUNT(*) FILTER (
        WHERE order_status = 'completed'
          AND due_at IS NOT NULL
          AND delivered_at IS NOT NULL
          AND delivered_at <= due_at
      )::int AS on_time_count,
      AVG(
        EXTRACT(EPOCH FROM (delivered_at - work_started_at)) / 86400.0
      ) FILTER (
        WHERE order_status = 'completed'
          AND due_at IS NOT NULL
          AND delivered_at IS NOT NULL
          AND work_started_at IS NOT NULL
      ) AS avg_delivery_days,
      COUNT(*) FILTER (
        WHERE order_status = 'completed' AND updated_at >= NOW() - INTERVAL '30 days'
      )::int AS completed_last_30_days
    FROM base
    `,
    [uid],
  );

  const r = rows[0] || {};
  const completed = Number(r.completed_count || 0);
  const cancelled = Number(r.cancelled_count || 0);
  const terminal = completed + cancelled;
  const revisionOrders = Number(r.revision_orders_count || 0);
  const withDeadline = Number(r.completed_with_deadline || 0);
  const onTime = Number(r.on_time_count || 0);

  const completionRate = terminal > 0 ? Math.round((completed / terminal) * 1000) / 10 : null;
  const cancellationRate = terminal > 0 ? Math.round((cancelled / terminal) * 1000) / 10 : null;
  const revisionRate =
    completed > 0 ? Math.round((revisionOrders / completed) * 1000) / 10 : null;
  const onTimeDeliveryPercent =
    withDeadline > 0 ? Math.round((onTime / withDeadline) * 1000) / 10 : null;

  const avgRaw = r.avg_delivery_days != null ? Number(r.avg_delivery_days) : null;
  const averageDeliveryDays =
    avgRaw != null && Number.isFinite(avgRaw) ? Math.round(avgRaw * 10) / 10 : null;

  return {
    completedOrders: completed,
    totalOrders: Number(r.total_orders || 0),
    cancelledOrders: cancelled,
    completionRate,
    cancellationRate,
    revisionRate,
    revisionOrdersCount: revisionOrders,
    onTimeDeliveryPercent,
    completedWithDeadline: withDeadline,
    onTimeDeliveries: onTime,
    averageDeliveryDays,
    activeStreakDays: null,
    activeStreakLabel: null,
    completedLast30Days: Number(r.completed_last_30_days || 0),
    hasOrderHistory: completed > 0 || cancelled > 0,
  };
}

function emptyPerformance() {
  return {
    completedOrders: 0,
    totalOrders: 0,
    cancelledOrders: 0,
    completionRate: null,
    cancellationRate: null,
    revisionRate: null,
    revisionOrdersCount: 0,
    onTimeDeliveryPercent: null,
    completedWithDeadline: 0,
    onTimeDeliveries: 0,
    averageDeliveryDays: null,
    activeStreakDays: null,
    activeStreakLabel: null,
    completedLast30Days: 0,
    hasOrderHistory: false,
  };
}

module.exports = {
  getFreelancerPerformanceMetrics,
};
