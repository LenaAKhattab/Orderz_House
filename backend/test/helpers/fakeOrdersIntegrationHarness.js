/**
 * Shared helpers for fake-order automation Postgres integration tests.
 * Mutates fake_order_settings and training rounds — use on dev/staging DB only.
 */
const {
  getTrainingPoolCoverage,
  getSettings,
  generateTrainingRoundInternal,
  getOverlapThresholdMs,
} = require("../../src/services/fakeOrdersService");

const SETTINGS_COLS = [
  "min_orders",
  "max_orders",
  "duration_value",
  "duration_unit",
  "category_distribution",
  "show_to_all_freelancers",
  "show_to_all_visitors",
  "training_orders_enabled",
  "automation_enabled",
  "automation_interval_value",
  "automation_interval_unit",
  "optional_round_name",
  "next_automation_run_at",
  "last_automation_run_at",
  "last_automation_status",
  "last_automation_error",
  "last_automation_round_id",
  "last_automation_generated_count",
];

async function assertDbReachable(pool) {
  await pool.query("SELECT 1");
}

async function activeTemplateCount(pool) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM fake_order_templates WHERE is_active = TRUE`,
  );
  return Number(rows[0]?.c || 0);
}

async function resolveAdminActorId(pool) {
  const { rows } = await pool.query(
    `SELECT id FROM users
     WHERE is_active = TRUE AND role IN ('super_admin', 'admin')
     ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function snapshotFakeOrderSettings(pool) {
  const { rows } = await pool.query(`SELECT * FROM fake_order_settings WHERE id = 1`);
  return rows[0] || null;
}

async function restoreFakeOrderSettings(pool, snap) {
  if (!snap) return;
  await pool.query(
    `UPDATE fake_order_settings SET
       min_orders = $1,
       max_orders = $2,
       duration_value = $3,
       duration_unit = $4,
       category_distribution = $5::jsonb,
       show_to_all_freelancers = $6,
       show_to_all_visitors = $7,
       training_orders_enabled = $8,
       automation_enabled = $9,
       automation_interval_value = $10,
       automation_interval_unit = $11,
       optional_round_name = $12,
       next_automation_run_at = $13,
       last_automation_run_at = $14,
       last_automation_status = $15,
       last_automation_error = $16,
       last_automation_round_id = $17,
       last_automation_generated_count = $18,
       updated_at = NOW()
     WHERE id = 1`,
    [
      snap.min_orders,
      snap.max_orders,
      snap.duration_value,
      snap.duration_unit,
      JSON.stringify(snap.category_distribution || {}),
      snap.show_to_all_freelancers,
      snap.show_to_all_visitors,
      snap.training_orders_enabled,
      snap.automation_enabled,
      snap.automation_interval_value,
      snap.automation_interval_unit,
      snap.optional_round_name,
      snap.next_automation_run_at,
      snap.last_automation_run_at,
      snap.last_automation_status,
      snap.last_automation_error,
      snap.last_automation_round_id,
      snap.last_automation_generated_count,
    ],
  );
}

async function maxActiveRoundId(pool) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(id), 0)::int AS m FROM fake_order_rounds WHERE status = 'active'`,
  );
  return Number(rows[0]?.m || 0);
}

async function countActiveRoundItems(pool, roundId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM fake_order_round_items
     WHERE round_id = $1 AND status = 'active' AND visible_until > NOW()`,
    [Number(roundId)],
  );
  return Number(rows[0]?.c || 0);
}

async function setRoundItemsVisibleUntil(pool, roundId, untilDate) {
  await pool.query(
    `UPDATE fake_order_round_items
     SET visible_until = $1, updated_at = NOW()
     WHERE round_id = $2 AND status = 'active'`,
    [untilDate, Number(roundId)],
  );
  await pool.query(
    `UPDATE fake_orders fo
     SET fake_expires_at = $1, updated_at = NOW()
     FROM fake_order_round_items ri
     WHERE ri.fake_order_id = fo.id AND ri.round_id = $2 AND ri.status = 'active'`,
    [untilDate, Number(roundId)],
  );
}

async function setAllActiveItemsVisibleUntil(pool, untilDate) {
  await pool.query(
    `UPDATE fake_order_round_items
     SET visible_until = $1, updated_at = NOW()
     WHERE status = 'active'`,
    [untilDate],
  );
}

async function shrinkVisibleCount(pool, shrinkBy) {
  const { rows } = await pool.query(
    `SELECT ri.id
     FROM fake_order_round_items ri
     INNER JOIN fake_orders fo ON fo.id = ri.fake_order_id
     WHERE ri.status = 'active' AND ri.visible_until > NOW()
     ORDER BY ri.visible_until ASC
     LIMIT $1`,
    [Math.max(1, Number(shrinkBy))],
  );
  if (!rows.length) return 0;
  await pool.query(
    `UPDATE fake_order_round_items
     SET visible_until = NOW() - INTERVAL '2 minutes', updated_at = NOW()
     WHERE id = ANY($1::bigint[])`,
    [rows.map((r) => Number(r.id))],
  );
  return rows.length;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} actorUserId
 * @param {{ supersedeExisting?: boolean }} [opts]
 */
async function generateTestRound(client, actorUserId, opts = {}) {
  const supersedeExisting = opts.supersedeExisting !== false;
  const result = await generateTrainingRoundInternal(client, {
    actorUserId,
    roundSource: "automation",
    supersedeExisting,
  });
  if (!result.ok) {
    const err = new Error(result.code || "GENERATION_FAILED");
    err.code = result.code;
    throw err;
  }
  return result;
}

async function requireIntegrationPrereqs(pool, t) {
  try {
    await assertDbReachable(pool);
  } catch {
    t.skip("DATABASE_URL unreachable");
    return false;
  }
  if ((await activeTemplateCount(pool)) < 1) {
    t.skip("no active fake_order_templates");
    return false;
  }
  const adminId = await resolveAdminActorId(pool);
  if (!adminId) {
    t.skip("no active admin/super_admin actor");
    return false;
  }
  return adminId;
}

module.exports = {
  SETTINGS_COLS,
  assertDbReachable,
  activeTemplateCount,
  resolveAdminActorId,
  snapshotFakeOrderSettings,
  restoreFakeOrderSettings,
  maxActiveRoundId,
  countActiveRoundItems,
  setRoundItemsVisibleUntil,
  setAllActiveItemsVisibleUntil,
  shrinkVisibleCount,
  generateTestRound,
  requireIntegrationPrereqs,
  getTrainingPoolCoverage,
  getSettings,
  getOverlapThresholdMs,
};
