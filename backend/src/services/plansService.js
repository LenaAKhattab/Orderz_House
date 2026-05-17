const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");
const {
  jsonArrayToDb,
  installmentPlanToDb,
  readJsonArrayFromRow,
  readInstallmentFromRow,
  effectiveCheckoutPriceJod,
} = require("../utils/planFields");
const {
  ORDERZHOUSE_PLAN_IDS,
  mergeApiPlansWithCatalog,
} = require("../constants/orderzhousePlansCatalog");

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
    stripeCheckoutAmountJod:
      row.stripe_checkout_amount_jod != null ? Number(row.stripe_checkout_amount_jod) : null,
    requiresCompanyVisit: row.requires_company_visit,
    selfSubscribeAllowed: row.self_subscribe_allowed,
    isActive: row.is_active,
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
    features: readJsonArrayFromRow(row, "features"),
    trainings: readJsonArrayFromRow(row, "trainings"),
    paymentNotes: row.payment_notes || null,
    installmentPlan: readInstallmentFromRow(row),
    offerExpiresAt: row.offer_expires_at || null,
    offerLabel: row.offer_label || null,
    orderValueMinJod: row.order_value_min_jod != null ? Number(row.order_value_min_jod) : null,
    orderValueMaxJod: row.order_value_max_jod != null ? Number(row.order_value_max_jod) : null,
    activationRequirements: row.activation_requirements || null,
    refundPolicy: row.refund_policy || null,
    adminNotes: row.admin_notes || null,
    isPopular: Boolean(row.is_popular),
    isFeatured: Boolean(row.is_featured),
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
  const charge = effectiveCheckoutPriceJod(row);
  if (!Number.isFinite(charge) || charge <= 0) return false;
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
       AND COALESCE(stripe_checkout_amount_jod, price_jod) IS NOT NULL
       AND COALESCE(stripe_checkout_amount_jod, price_jod) > 0
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapPlan);
}

/** Marketing /pricing page: fixed ORDERZHOUSE tiers (ids 1, 2, 3) merged with hard-coded catalog. */
async function listPublicCatalogPlans() {
  const { rows } = await pool.query(
    `SELECT *
     FROM plans
     WHERE deleted_at IS NULL
       AND is_visible = TRUE
       AND is_active = TRUE
       AND id = ANY($1::bigint[])
     ORDER BY id ASC`,
    [ORDERZHOUSE_PLAN_IDS],
  );
  const apiPlans = rows.map((row) => {
    const plan = mapPlan(row);
    delete plan.adminNotes;
    return {
      ...plan,
      selfCheckoutEligible: planEligibleForFreelancerSelfCheckout(row),
    };
  });
  return mergeApiPlansWithCatalog(apiPlans);
}

async function getPlanById(id) {
  const { rows } = await pool.query(`SELECT * FROM plans WHERE id = $1 LIMIT 1`, [id]);
  return mapPlan(rows[0]);
}

function pickExtendedPayload(payload) {
  return {
    features: payload.features !== undefined ? jsonArrayToDb(payload.features) : undefined,
    trainings: payload.trainings !== undefined ? jsonArrayToDb(payload.trainings) : undefined,
    paymentNotes: payload.paymentNotes,
    installmentPlan:
      payload.installmentPlan !== undefined ? installmentPlanToDb(payload.installmentPlan) : undefined,
    offerExpiresAt: payload.offerExpiresAt,
    offerLabel: payload.offerLabel,
    orderValueMinJod: payload.orderValueMinJod,
    orderValueMaxJod: payload.orderValueMaxJod,
    activationRequirements: payload.activationRequirements,
    refundPolicy: payload.refundPolicy,
    adminNotes: payload.adminNotes,
    isPopular: payload.isPopular,
    isFeatured: payload.isFeatured,
    stripeCheckoutAmountJod: payload.stripeCheckoutAmountJod,
  };
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

  const ext = pickExtendedPayload(payload);

  const { rows } = await pool.query(
    `INSERT INTO plans (
      name, title, description, duration_days, price_jod, stripe_checkout_amount_jod,
      requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
      features, trainings, payment_notes, installment_plan,
      offer_expires_at, offer_label, order_value_min_jod, order_value_max_jod,
      activation_requirements, refund_policy, admin_notes,
      is_popular, is_featured,
      created_by_user_id, updated_by_user_id
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
      COALESCE($12::jsonb, '[]'::jsonb),
      COALESCE($13::jsonb, '[]'::jsonb),
      $14,$15::jsonb,
      $16,$17,$18,$19,
      $20,$21,$22,
      COALESCE($23, FALSE), COALESCE($24, FALSE),
      $25,$25
    )
    RETURNING *`,
    [
      name,
      title,
      description,
      durationDays,
      priceJod != null ? Number(priceJod) : null,
      ext.stripeCheckoutAmountJod != null ? Number(ext.stripeCheckoutAmountJod) : null,
      Boolean(requiresCompanyVisit),
      Boolean(selfSubscribeAllowed),
      Boolean(isActive),
      Boolean(isVisible),
      sortOrder,
      ext.features !== undefined ? ext.features : "[]",
      ext.trainings !== undefined ? ext.trainings : "[]",
      ext.paymentNotes !== undefined ? ext.paymentNotes : null,
      ext.installmentPlan,
      ext.offerExpiresAt !== undefined ? ext.offerExpiresAt || null : null,
      ext.offerLabel !== undefined ? ext.offerLabel : null,
      ext.orderValueMinJod !== undefined && ext.orderValueMinJod != null ? Number(ext.orderValueMinJod) : null,
      ext.orderValueMaxJod !== undefined && ext.orderValueMaxJod != null ? Number(ext.orderValueMaxJod) : null,
      ext.activationRequirements !== undefined ? ext.activationRequirements : null,
      ext.refundPolicy !== undefined ? ext.refundPolicy : null,
      ext.adminNotes !== undefined ? ext.adminNotes : null,
      ext.isPopular !== undefined ? Boolean(ext.isPopular) : false,
      ext.isFeatured !== undefined ? Boolean(ext.isFeatured) : false,
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
  if (patch.stripeCheckoutAmountJod !== undefined) {
    set(
      "stripe_checkout_amount_jod",
      patch.stripeCheckoutAmountJod == null ? null : Number(patch.stripeCheckoutAmountJod),
    );
  }
  if (patch.requiresCompanyVisit !== undefined) set("requires_company_visit", Boolean(patch.requiresCompanyVisit));
  if (patch.selfSubscribeAllowed !== undefined) set("self_subscribe_allowed", Boolean(patch.selfSubscribeAllowed));
  if (patch.isActive !== undefined) set("is_active", Boolean(patch.isActive));
  if (patch.isVisible !== undefined) set("is_visible", Boolean(patch.isVisible));
  if (patch.sortOrder !== undefined) set("sort_order", patch.sortOrder);

  if (patch.features !== undefined) set("features", jsonArrayToDb(patch.features));
  if (patch.trainings !== undefined) set("trainings", jsonArrayToDb(patch.trainings));
  if (patch.paymentNotes !== undefined) set("payment_notes", patch.paymentNotes);
  if (patch.installmentPlan !== undefined) set("installment_plan", installmentPlanToDb(patch.installmentPlan));
  if (patch.offerExpiresAt !== undefined) set("offer_expires_at", patch.offerExpiresAt || null);
  if (patch.offerLabel !== undefined) set("offer_label", patch.offerLabel);
  if (patch.orderValueMinJod !== undefined) {
    set("order_value_min_jod", patch.orderValueMinJod == null ? null : Number(patch.orderValueMinJod));
  }
  if (patch.orderValueMaxJod !== undefined) {
    set("order_value_max_jod", patch.orderValueMaxJod == null ? null : Number(patch.orderValueMaxJod));
  }
  if (patch.activationRequirements !== undefined) set("activation_requirements", patch.activationRequirements);
  if (patch.refundPolicy !== undefined) set("refund_policy", patch.refundPolicy);
  if (patch.adminNotes !== undefined) set("admin_notes", patch.adminNotes);
  if (patch.isPopular !== undefined) set("is_popular", Boolean(patch.isPopular));
  if (patch.isFeatured !== undefined) set("is_featured", Boolean(patch.isFeatured));

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
  listPublicCatalogPlans,
  getPlanById,
  createPlan,
  updatePlan,
  softDeletePlan,
  planEligibleForFreelancerSelfCheckout,
  effectiveCheckoutPriceJod,
};
