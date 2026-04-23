const { pool } = require("../config/db");

function mapPlan(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    title: row.title,
    description: row.description,
    durationDays: row.duration_days,
    priceCents: row.price_cents,
    requiresCompanyVisit: row.requires_company_visit,
    isActive: row.is_active,
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listPlans({ includeDeleted = false } = {}) {
  const { rows } = await pool.query(
    `SELECT *
     FROM plans
     WHERE ($1::boolean = TRUE OR deleted_at IS NULL)
     ORDER BY sort_order ASC, id ASC`,
    [Boolean(includeDeleted)],
  );
  return rows.map(mapPlan);
}

async function listVisibleActivePlans() {
  const { rows } = await pool.query(
    `SELECT *
     FROM plans
     WHERE deleted_at IS NULL AND is_visible = TRUE AND is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapPlan);
}

async function getPlanById(id) {
  const { rows } = await pool.query(`SELECT * FROM plans WHERE id = $1 LIMIT 1`, [id]);
  return mapPlan(rows[0]);
}

async function createPlan({ actorUserId, payload }) {
  const {
    name,
    title,
    description = null,
    durationDays,
    priceCents = null,
    requiresCompanyVisit = false,
    isActive = true,
    isVisible = true,
    sortOrder = 0,
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO plans (
      name, title, description, duration_days, price_cents,
      requires_company_visit, is_active, is_visible, sort_order,
      created_by_user_id, updated_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    RETURNING *`,
    [
      name,
      title,
      description,
      durationDays,
      priceCents,
      Boolean(requiresCompanyVisit),
      Boolean(isActive),
      Boolean(isVisible),
      sortOrder,
      actorUserId ? Number(actorUserId) : null,
    ],
  );

  return mapPlan(rows[0]);
}

async function updatePlan({ actorUserId, id, patch }) {
  const fields = [];
  const values = [];
  let i = 1;

  const set = (col, val) => {
    fields.push(`${col} = $${i}`);
    values.push(val);
    i += 1;
  };

  if (patch.title !== undefined) set("title", patch.title);
  if (patch.description !== undefined) set("description", patch.description);
  if (patch.durationDays !== undefined) set("duration_days", patch.durationDays);
  if (patch.priceCents !== undefined) set("price_cents", patch.priceCents);
  if (patch.requiresCompanyVisit !== undefined) set("requires_company_visit", Boolean(patch.requiresCompanyVisit));
  if (patch.isActive !== undefined) set("is_active", Boolean(patch.isActive));
  if (patch.isVisible !== undefined) set("is_visible", Boolean(patch.isVisible));
  if (patch.sortOrder !== undefined) set("sort_order", patch.sortOrder);

  set("updated_by_user_id", actorUserId ? Number(actorUserId) : null);
  set("updated_at", new Date());

  values.push(Number(id));

  const { rows } = await pool.query(
    `UPDATE plans
     SET ${fields.join(", ")}
     WHERE id = $${i} AND deleted_at IS NULL
     RETURNING *`,
    values,
  );

  if (!rows[0]) {
    const err = new Error("Plan not found.");
    err.statusCode = 404;
    throw err;
  }
  return mapPlan(rows[0]);
}

async function softDeletePlan({ actorUserId, id }) {
  const { rowCount } = await pool.query(
    `UPDATE plans
     SET deleted_at = NOW(), updated_by_user_id = $2, updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL`,
    [Number(id), actorUserId ? Number(actorUserId) : null],
  );
  if (rowCount === 0) {
    const err = new Error("Plan not found.");
    err.statusCode = 404;
    throw err;
  }
  return true;
}

module.exports = {
  listPlans,
  listVisibleActivePlans,
  getPlanById,
  createPlan,
  updatePlan,
  softDeletePlan,
};

