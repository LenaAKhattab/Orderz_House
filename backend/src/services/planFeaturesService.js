const { pool } = require("../config/db");

function mapFeature(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    featureText: row.feature_text,
    featureTextEn: row.feature_text_en || null,
    sortOrder: row.sort_order,
    isIncluded: Boolean(row.is_included),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listFeaturesForPlan(planId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM plan_features
     WHERE plan_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [Number(planId)],
  );
  return rows.map(mapFeature);
}

async function replaceFeaturesForPlan({ planId, features }) {
  const pid = Number(planId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM plan_features WHERE plan_id = $1`, [pid]);

    const normalized = Array.isArray(features) ? features : [];
    for (let idx = 0; idx < normalized.length; idx += 1) {
      const item = normalized[idx];
      const text = typeof item === "string" ? item : item?.featureText;
      if (!text || !String(text).trim()) continue;
      const sortOrder =
        typeof item === "object" && item?.sortOrder != null ? Number(item.sortOrder) : idx;
      const isIncluded =
        typeof item === "object" && item?.isIncluded != null ? Boolean(item.isIncluded) : true;
      await client.query(
        `INSERT INTO plan_features (plan_id, feature_text, sort_order, is_included)
         VALUES ($1, $2, $3, $4)`,
        [pid, String(text).trim(), sortOrder, isIncluded],
      );
    }

    const { rows } = await client.query(
      `SELECT *
       FROM plan_features
       WHERE plan_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [pid],
    );
    await client.query("COMMIT");
    return rows.map(mapFeature);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function loadFeaturesByPlanIds(planIds) {
  if (!planIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT *
     FROM plan_features
     WHERE plan_id = ANY($1::bigint[])
     ORDER BY plan_id ASC, sort_order ASC, id ASC`,
    [planIds],
  );
  const map = new Map();
  for (const row of rows) {
    const key = String(row.plan_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(mapFeature(row));
  }
  return map;
}

module.exports = {
  listFeaturesForPlan,
  replaceFeaturesForPlan,
  loadFeaturesByPlanIds,
  mapFeature,
};
