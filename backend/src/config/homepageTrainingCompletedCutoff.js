/**
 * Cutoff for homepage training "completed" counts.
 * Training rotations that ended before this timestamp are excluded from completedOrders.
 *
 * Priority: HOMEPAGE_TRAINING_COMPLETED_CUTOFF env (ISO) → platform_ui_settings column.
 * If unset: since-cutoff training count is 0 (completedOrders = real only).
 */

const { pool } = require("./db");

/**
 * @param {import("pg").Pool | import("pg").PoolClient} [client]
 * @returns {Promise<Date | null>}
 */
async function resolveHomepageTrainingCompletedCutoff(client = pool) {
  const raw = process.env.HOMEPAGE_TRAINING_COMPLETED_CUTOFF;
  if (raw != null && String(raw).trim()) {
    const parsed = new Date(String(raw).trim());
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  const { rows } = await client.query(
    `SELECT homepage_training_completed_cutoff_at AS cutoff
     FROM platform_ui_settings WHERE id = 1 LIMIT 1`,
  );
  const cutoff = rows[0]?.cutoff;
  if (!cutoff) return null;
  const parsed = new Date(cutoff);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

module.exports = {
  resolveHomepageTrainingCompletedCutoff,
};
