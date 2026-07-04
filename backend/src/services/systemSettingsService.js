const { pool } = require("../config/db");

/**
 * Minimal generic key/value store for editable, non-secret system configuration.
 * NEVER store secrets (API keys, tokens) here — those stay in environment variables.
 */

/**
 * Read a single setting value by key.
 * @param {string} key
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<string|null>} the stored value, or null when unset
 */
async function getSetting(key, client) {
  const runner = client || pool;
  const k = String(key || "").trim();
  if (!k) return null;
  const { rows } = await runner.query(`SELECT value FROM system_settings WHERE key = $1 LIMIT 1`, [k]);
  if (!rows.length) return null;
  const value = rows[0].value;
  return value == null ? null : String(value);
}

/**
 * Upsert a setting value. Pass an empty/null value to clear it.
 * @param {string} key
 * @param {string|null} value
 * @param {{ updatedByUserId?: number|null }} [opts]
 * @param {import('pg').PoolClient} [client]
 * @returns {Promise<string|null>} the normalized stored value (null when cleared)
 */
async function setSetting(key, value, opts = {}, client) {
  const runner = client || pool;
  const k = String(key || "").trim();
  if (!k) throw new Error("Setting key is required.");
  const normalized = value == null || String(value).trim() === "" ? null : String(value).trim();
  const updatedBy =
    opts.updatedByUserId != null && Number.isInteger(Number(opts.updatedByUserId))
      ? Number(opts.updatedByUserId)
      : null;

  await runner.query(
    `INSERT INTO system_settings (key, value, updated_by_user_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = NOW()`,
    [k, normalized, updatedBy],
  );
  return normalized;
}

module.exports = {
  getSetting,
  setSetting,
};
