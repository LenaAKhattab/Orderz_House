const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

function mapPlan(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name,
    title: row.title,
    description: row.description,
    durationDays: row.duration_days,
    priceJod: row.price_jod != null ? Number(row.price_jod) : null,
    requiresCompanyVisit: row.requires_company_visit,
    selfSubscribeAllowed: row.self_subscribe_allowed,
    isActive: row.is_active,
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Row shape from `plans` (snake_case DB columns). Used by Stripe self-checkout. */
function planEligibleForFreelancerSelfCheckout(row) {
  if (!row || row.deleted_at) return false;
  if (!row.is_active || !row.is_visible) return false;
  if (!row.self_subscribe_allowed) return false;
  const priceJod = row.price_jod != null ? Number(row.price_jod) : null;
  if (!Number.isFinite(priceJod) || priceJod <= 0) return false;
  return true;
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
     WHERE deleted_at IS NULL
       AND is_visible = TRUE
       AND is_active = TRUE
       AND self_subscribe_allowed = TRUE
       AND price_jod IS NOT NULL
       AND price_jod > 0
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
    priceJod = null,
    requiresCompanyVisit = false,
    selfSubscribeAllowed = false,
    isActive = true,
    isVisible = true,
    sortOrder = 0,
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO plans (
      name, title, description, duration_days, price_jod,
      requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
      created_by_user_id, updated_by_user_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
    RETURNING *`,
    [
      name,
      title,
      description,
      durationDays,
      priceJod != null ? Number(priceJod) : null,
      Boolean(requiresCompanyVisit),
      Boolean(selfSubscribeAllowed),
      Boolean(isActive),
      Boolean(isVisible),
      sortOrder,
      actorUserId ? Number(actorUserId) : null,
    ],
  );

  const plan = mapPlan(rows[0]);
  await safeNotify(() =>
    notificationEventsService.notifySuperAdmins({
      recipientRole: "super_admin",
      actorUserId: actorUserId ? Number(actorUserId) : null,
      type: "plan.created",
      title: "تم إنشاء باقة جديدة",
      message: `تم إنشاء باقة جديدة: ${plan.title}.`,
      entityType: "plan",
      entityId: Number(plan.id),
      link: "/dashboard/super-admin/plans",
      priority: "medium",
      dedupeKey: `plan_created_${plan.id}`,
      metadata: { planId: plan.id },
    }),
  );
  return plan;
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
  if (patch.priceJod !== undefined) set("price_jod", patch.priceJod == null ? null : Number(patch.priceJod));
  if (patch.requiresCompanyVisit !== undefined) set("requires_company_visit", Boolean(patch.requiresCompanyVisit));
  if (patch.selfSubscribeAllowed !== undefined) set("self_subscribe_allowed", Boolean(patch.selfSubscribeAllowed));
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
  const plan = mapPlan(rows[0]);
  await safeNotify(() =>
    notificationEventsService.notifySuperAdmins({
      recipientRole: "super_admin",
      actorUserId: actorUserId ? Number(actorUserId) : null,
      type: "plan.updated",
      title: "تم تحديث باقة",
      message: `تم تحديث إعدادات باقة: ${plan.title}.`,
      entityType: "plan",
      entityId: Number(plan.id),
      link: "/dashboard/super-admin/plans",
      priority: "medium",
      dedupeKey: `plan_updated_${plan.id}_${String(plan.updatedAt)}`,
      metadata: { planId: plan.id },
    }),
  );
  return plan;
}

async function softDeletePlan({ actorUserId, id }) {
  const { rows: planRows } = await pool.query(`SELECT id, title FROM plans WHERE id = $1 LIMIT 1`, [Number(id)]);
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
  const plan = planRows[0];
  await safeNotify(() =>
    notificationEventsService.notifySuperAdmins({
      recipientRole: "super_admin",
      actorUserId: actorUserId ? Number(actorUserId) : null,
      type: "plan.deleted",
      title: "تم حذف باقة",
      message: `تم حذف الباقة: ${plan?.title || `#${id}`}.`,
      entityType: "plan",
      entityId: Number(id),
      link: "/dashboard/super-admin/plans",
      priority: "high",
      dedupeKey: `plan_deleted_${id}`,
      metadata: { planId: String(id) },
    }),
  );
  return true;
}

module.exports = {
  listPlans,
  listVisibleActivePlans,
  getPlanById,
  createPlan,
  updatePlan,
  softDeletePlan,
  planEligibleForFreelancerSelfCheckout,
};

