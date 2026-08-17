const { pool } = require("../config/db");
const { ORDER_STATUSES } = require("./orderFlowService");
const { resolveHomepageTrainingCompletedCutoff } = require("../config/homepageTrainingCompletedCutoff");
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

/** Public display counters: 30–120s in-memory TTL (default 60s). */
const HOME_ORDER_STATS_CACHE_TTL_MS = Math.min(
  Math.max(Number(process.env.PUBLIC_HOME_ORDER_STATS_CACHE_MS) || 60_000, 30_000),
  120_000,
);

/** @type {{ value: object | null, expires: number }} */
let orderStatsCache = { value: null, expires: 0 };
/** @type {Promise<object> | null} */
let orderStatsInflight = null;

async function loadTrainingPoolSettingsFlags(client = pool) {
  const { rows } = await client.query(
    `SELECT training_orders_enabled, show_to_all_visitors, show_to_all_freelancers
     FROM fake_order_settings WHERE id = 1 LIMIT 1`,
  );
  const s = rows[0] || {};
  return {
    training_orders_enabled: s.training_orders_enabled === true,
    show_to_all_visitors: s.show_to_all_visitors === true,
    show_to_all_freelancers: s.show_to_all_freelancers === true,
  };
}

/**
 * SQL fragment: training orders no longer visible whose last ended round item is on/after cutoff.
 * @param {number} cutoffParamIndex 1-based $N index for timestamptz cutoff
 * @param {object | null} [settings]
 */
function trainingRotationsCompletedSinceCutoffSql(cutoffParamIndex, settings = null) {
  const poolVisibleNotExists = `
    NOT EXISTS (
      SELECT 1
      ${trainingPoolVisibleFromSql("fo_vis")}
      WHERE fo_vis.id = fo.id
        AND ${trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis", settings })}
    )`;
  return `
    SELECT COUNT(*)::int AS c
    FROM fake_orders fo
    INNER JOIN (
      SELECT ri.fake_order_id, MAX(ri.visible_until) AS last_ended
      FROM fake_order_round_items ri
      WHERE ri.visible_until <= NOW()
      GROUP BY ri.fake_order_id
    ) ended ON ended.fake_order_id = fo.id
    WHERE fo.was_marketplace_visible = TRUE
      AND fo.first_visible_at IS NOT NULL
      AND ${poolVisibleNotExists}
      AND COALESCE(ended.last_ended, '-infinity'::timestamptz) >= $${cutoffParamIndex}::timestamptz
  `.trim();
}

function trainingRotationsCompletedTotalSql(settings = null) {
  return `
  SELECT COUNT(*)::int AS c
  FROM fake_orders fo
  WHERE fo.was_marketplace_visible = TRUE
    AND fo.first_visible_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      ${trainingPoolVisibleFromSql("fo_vis")}
      WHERE fo_vis.id = fo.id
        AND ${trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis", settings })}
    )
`.trim();
}

const TRAINING_ROTATIONS_COMPLETED_TOTAL_SQL = trainingRotationsCompletedTotalSql();

/**
 * Combined total + since-cutoff in one fake_orders pass.
 * @param {number | null} cutoffParamIndex
 * @param {object | null} settings
 */
function trainingRotationsCompletedPairSql(cutoffParamIndex, settings) {
  const notVisible = `
    NOT EXISTS (
      SELECT 1
      ${trainingPoolVisibleFromSql("fo_vis")}
      WHERE fo_vis.id = fo.id
        AND ${trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis", settings })}
    )`;
  if (!cutoffParamIndex) {
    return `
      SELECT COUNT(*)::int AS training_rotations_completed,
             0::int AS training_rotations_completed_since_cutoff
      FROM fake_orders fo
      WHERE fo.was_marketplace_visible = TRUE
        AND fo.first_visible_at IS NOT NULL
        AND ${notVisible}
    `.trim();
  }
  return `
    SELECT
      COUNT(*) FILTER (WHERE ${notVisible})::int AS training_rotations_completed,
      COUNT(*) FILTER (
        WHERE ${notVisible}
          AND COALESCE(ended.last_ended, '-infinity'::timestamptz) >= $${cutoffParamIndex}::timestamptz
      )::int AS training_rotations_completed_since_cutoff
    FROM fake_orders fo
    LEFT JOIN (
      SELECT ri.fake_order_id, MAX(ri.visible_until) AS last_ended
      FROM fake_order_round_items ri
      WHERE ri.visible_until <= NOW()
      GROUP BY ri.fake_order_id
    ) ended ON ended.fake_order_id = fo.id
    WHERE fo.was_marketplace_visible = TRUE
      AND fo.first_visible_at IS NOT NULL
  `.trim();
}

async function queryHeroOrderCounts() {
  const { perfStart } = require("../utils/perfLog");
  const totalTimer = perfStart("public_home_order_stats", "queryHeroOrderCounts");

  const cutoff = await resolveHomepageTrainingCompletedCutoff(pool);
  const settings = await loadTrainingPoolSettingsFlags(pool);

  const availableRealSql = `
    SELECT COUNT(*)::int AS c
    FROM orders o
    WHERE o.order_status = ANY($1::text[])
      AND o.is_published = TRUE
      AND o.is_open_for_pool = TRUE
      AND COALESCE(o.is_archived, FALSE) = FALSE
      AND COALESCE(o.visibility_scope, 'public') = 'public'
  `;
  const completedRealSql = `
    SELECT COUNT(*)::int AS c
    FROM orders o
    WHERE o.order_status = $1
      AND COALESCE(o.is_archived, FALSE) = FALSE
      AND COALESCE(o.visibility_scope, 'public') = 'public'
  `;
  const pipelineSql = `
    SELECT
      COUNT(*) FILTER (
        WHERE order_status = ANY($1::text[])
          AND COALESCE(visibility_scope, 'public') = 'public'
      )::int AS open_projects,
      COUNT(*) FILTER (
        WHERE order_status = ANY($2::text[])
          AND COALESCE(visibility_scope, 'public') = 'public'
      )::int AS in_progress_projects,
      COUNT(*) FILTER (
        WHERE order_status = $3
          AND COALESCE(visibility_scope, 'public') = 'public'
      )::int AS completed_projects
    FROM orders
  `;

  const availableTrainingSql = settings.training_orders_enabled
    ? `
      SELECT COUNT(DISTINCT fo.id)::int AS c
      ${trainingPoolVisibleFromSql("fo")}
      WHERE ${trainingPoolVisibleWhereSql({ publicAudienceOnly: true, alias: "fo", settings })}
    `
    : null;

  const pairParams = cutoff ? [cutoff.toISOString()] : [];
  const pairSql = trainingRotationsCompletedPairSql(cutoff ? 1 : null, settings);

  const tOrders = perfStart("public_home_order_stats", "orders_counts");
  const tTrainingAvail = perfStart("public_home_order_stats", "available_training");
  const tTrainingDone = perfStart("public_home_order_stats", "training_completed");

  const [availRealRes, availTrainRes, completedRealRes, pipelineRes, trainingPairRes] = await Promise.all([
    pool.query(availableRealSql, [AVAILABLE_REAL_STATUSES]).then((r) => {
      tOrders.end({ part: "available_real" });
      return r;
    }),
    availableTrainingSql
      ? pool.query(availableTrainingSql).then((r) => {
          tTrainingAvail.end({ enabled: true });
          return r;
        })
      : Promise.resolve({ rows: [{ c: 0 }] }).then((r) => {
          tTrainingAvail.end({ enabled: false });
          return r;
        }),
    pool.query(completedRealSql, [ORDER_STATUSES.COMPLETED]),
    pool.query(pipelineSql, [
      OPEN_PROJECT_STATUSES,
      IN_PROGRESS_PROJECT_STATUSES,
      ORDER_STATUSES.COMPLETED,
    ]),
    pool.query(pairSql, pairParams).then((r) => {
      tTrainingDone.end({ hasCutoff: Boolean(cutoff) });
      return r;
    }),
  ]);

  const pair = trainingPairRes.rows[0] || {};
  const row = {
    available_real: availRealRes.rows[0]?.c,
    available_training: availTrainRes.rows[0]?.c,
    completed_real: completedRealRes.rows[0]?.c,
    training_rotations_completed: pair.training_rotations_completed,
    training_rotations_completed_since_cutoff: pair.training_rotations_completed_since_cutoff,
    open_projects: pipelineRes.rows[0]?.open_projects,
    in_progress_projects: pipelineRes.rows[0]?.in_progress_projects,
    completed_projects: pipelineRes.rows[0]?.completed_projects,
  };

  const counts = aggregateHeroOrderCounts(row, { cutoff });
  totalTimer.end({ queryCount: availableTrainingSql ? 5 : 4, cache: "miss" });
  return counts;
}

/**
 * Map raw SQL row → homepage hero counts (testable aggregation).
 * @param {Record<string, unknown>} row
 * @param {{ cutoff?: Date | null }} [meta]
 */
function aggregateHeroOrderCounts(row = {}, meta = {}) {
  const availableReal = Number(row.available_real) || 0;
  const availableTraining = Number(row.available_training) || 0;
  const completedReal = Number(row.completed_real) || 0;
  const trainingRotationsCompletedTotal = Number(row.training_rotations_completed) || 0;
  const trainingRotationsCompletedSinceCutoff =
    Number(row.training_rotations_completed_since_cutoff) || 0;

  return {
    openProjects: Number(row.open_projects) || 0,
    inProgressProjects: Number(row.in_progress_projects) || 0,
    completedProjects: Number(row.completed_projects) || 0,
    availableOrdersNow: availableReal + availableTraining,
    completedOrders: completedReal + trainingRotationsCompletedSinceCutoff,
    availableOrdersNowReal: availableReal,
    availableOrdersNowTraining: availableTraining,
    completedOrdersReal: completedReal,
    trainingRotationsCompleted: trainingRotationsCompletedTotal,
    trainingRotationsCompletedTotal,
    trainingRotationsCompletedSinceCutoff,
    homepageTrainingCompletedCutoffAt: meta.cutoff ? meta.cutoff.toISOString() : null,
  };
}

/**
 * Aggregate homepage hero order counts.
 * completedOrders = real completed + training rotations ended on/after cutoff.
 */
function invalidatePublicHomeOrderStatsCache() {
  orderStatsCache = { value: null, expires: 0 };
  orderStatsInflight = null;
  try {
    const { invalidatePublicHomeStatsResponseCache } = require("../controllers/publicHomeStatsController");
    invalidatePublicHomeStatsResponseCache();
  } catch {
    /* controller may not be loaded in some scripts */
  }
}

async function getPublicHomeOrderCounts() {
  const now = Date.now();
  if (orderStatsCache.value && orderStatsCache.expires > now) {
    return orderStatsCache.value;
  }
  if (orderStatsInflight) {
    try {
      return await orderStatsInflight;
    } catch (err) {
      if (orderStatsCache.value) return orderStatsCache.value;
      throw err;
    }
  }

  orderStatsInflight = queryHeroOrderCounts()
    .then((counts) => {
      orderStatsCache = {
        value: counts,
        expires: Date.now() + HOME_ORDER_STATS_CACHE_TTL_MS,
      };
      return counts;
    })
    .finally(() => {
      orderStatsInflight = null;
    });

  try {
    return await orderStatsInflight;
  } catch (err) {
    if (orderStatsCache.value) return orderStatsCache.value;
    throw err;
  }
}

module.exports = {
  getPublicHomeOrderCounts,
  invalidatePublicHomeOrderStatsCache,
  OPEN_PROJECT_STATUSES,
  IN_PROGRESS_PROJECT_STATUSES,
  AVAILABLE_REAL_STATUSES,
  queryHeroOrderCounts,
  aggregateHeroOrderCounts,
  trainingRotationsCompletedSinceCutoffSql,
  TRAINING_ROTATIONS_COMPLETED_TOTAL_SQL,
  HOME_ORDER_STATS_CACHE_TTL_MS,
};
