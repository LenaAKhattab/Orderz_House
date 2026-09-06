/**
 * Phase B4 schema readiness for Priority Application Boost.
 */

const { pool } = require("../config/db");

let boostSchemaReadyCache = null;

async function priorityApplicationBoostSchemaReady(db = pool) {
  if (boostSchemaReadyCache === true) return true;
  if (boostSchemaReadyCache === false) return false;
  const { rows } = await db.query(
    `SELECT
       to_regclass('public.order_freelancer_priority_application_boosts') AS boosts,
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'marketplace_economy_settings'
            AND column_name = 'priority_application_boost_enabled'
       ) AS flag_col`,
  );
  const ready = Boolean(rows[0]?.boosts) && Boolean(rows[0]?.flag_col);
  boostSchemaReadyCache = ready;
  return ready;
}

function clearPriorityApplicationBoostSchemaCache() {
  boostSchemaReadyCache = null;
}

module.exports = {
  priorityApplicationBoostSchemaReady,
  clearPriorityApplicationBoostSchemaCache,
};
