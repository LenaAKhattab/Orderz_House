const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");
const planFeaturesService = require("./planFeaturesService");
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

function resolveCheckoutPlanId(row) {
  if (!row) return null;
  if (row.subscription_plan_id != null) return Number(row.subscription_plan_id);
  return Number(row.id);
}

/**
 * Resolve the plan id that should be stored on freelancer_subscriptions.
 * Display/marketing clones with subscription_plan_id map to the canonical subscription plan.
 * Does not invent ids — follows the DB relationship only.
 *
 * @returns {Promise<{
 *   assignmentPlanId: number,
 *   selectedPlanId: number,
 *   displayPlanId: number | null,
 *   durationDays: number,
 *   resolvedFromDisplay: boolean,
 * }>}
 */
async function resolveAssignableSubscriptionPlanId(selectedPlanId, client) {
  const runner = client || pool;
  const pid = Number(selectedPlanId);
  if (!Number.isInteger(pid) || pid < 1) {
    const err = new Error("Invalid plan id.");
    err.statusCode = 400;
    err.reason = "invalid_plan_id";
    throw err;
  }

  const { rows } = await runner.query(
    `SELECT id, is_active, deleted_at, subscription_plan_id, duration_days, name, title
     FROM plans
     WHERE id = $1::bigint
     LIMIT 1`,
    [pid],
  );
  const selected = rows[0];
  if (!selected || selected.deleted_at) {
    const err = new Error("Plan not found.");
    err.statusCode = 404;
    err.reason = "plan_not_found";
    throw err;
  }
  if (!selected.is_active) {
    const err = new Error("Plan is inactive.");
    err.statusCode = 400;
    err.reason = "plan_inactive";
    throw err;
  }

  const linkedRaw = selected.subscription_plan_id;
  if (linkedRaw == null || linkedRaw === "") {
    return {
      assignmentPlanId: pid,
      selectedPlanId: pid,
      displayPlanId: null,
      durationDays: Number(selected.duration_days),
      resolvedFromDisplay: false,
    };
  }

  const linkedId = Number(linkedRaw);
  if (!Number.isInteger(linkedId) || linkedId < 1) {
    const err = new Error("الخطة المحددة مرتبطة بمعرّف اشتراك غير صالح.");
    err.statusCode = 400;
    err.reason = "invalid_subscription_plan_id";
    throw err;
  }

  if (linkedId === pid) {
    return {
      assignmentPlanId: pid,
      selectedPlanId: pid,
      displayPlanId: null,
      durationDays: Number(selected.duration_days),
      resolvedFromDisplay: false,
    };
  }

  const { rows: canonRows } = await runner.query(
    `SELECT id, is_active, deleted_at, duration_days, subscription_plan_id, name, title
     FROM plans
     WHERE id = $1::bigint
     LIMIT 1`,
    [linkedId],
  );
  const canon = canonRows[0];
  if (!canon || canon.deleted_at) {
    const err = new Error("الخطة الأساسية المرتبطة بهذه الباقة غير موجودة.");
    err.statusCode = 400;
    err.reason = "canonical_plan_not_found";
    throw err;
  }
  if (!canon.is_active) {
    const err = new Error("الخطة الأساسية المرتبطة بهذه الباقة غير نشطة.");
    err.statusCode = 400;
    err.reason = "canonical_plan_inactive";
    throw err;
  }

  return {
    assignmentPlanId: linkedId,
    selectedPlanId: pid,
    displayPlanId: pid,
    durationDays: Number(canon.duration_days),
    resolvedFromDisplay: true,
  };
}

async function attachFeaturesToPlans(rows) {
  const planIds = rows.map((r) => Number(r.id));
  const featureMap = await planFeaturesService.loadFeaturesByPlanIds(planIds);
  return rows.map((row) => {
    const plan = mapPlan(row);
    const dbFeatures = featureMap.get(String(row.id)) || [];
    if (dbFeatures.length > 0) {
      plan.features = dbFeatures
        .filter((f) => f.isIncluded)
        .map((f) => f.featureText);
      plan.planFeatures = dbFeatures;
    }
    return plan;
  });
}

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
    trainingsEn: readJsonArrayFromRow(row, "trainings_en"),
    paymentNotes: row.payment_notes || null,
    installmentPlan: readInstallmentFromRow(row),
    offerExpiresAt: row.offer_expires_at || null,
    offerLabel: row.offer_label || null,
    offerLabelEn: row.offer_label_en || null,
    orderValueMinJod: row.order_value_min_jod != null ? Number(row.order_value_min_jod) : null,
    orderValueMaxJod: row.order_value_max_jod != null ? Number(row.order_value_max_jod) : null,
    activationRequirements: row.activation_requirements || null,
    refundPolicy: row.refund_policy || null,
    adminNotes: row.admin_notes || null,
    isPopular: Boolean(row.is_popular),
    isFeatured: Boolean(row.is_featured),
    planPageId: row.plan_page_id != null ? String(row.plan_page_id) : null,
    subscriptionPlanId: row.subscription_plan_id != null ? String(row.subscription_plan_id) : null,
    label: row.label || null,
    billingText: row.billing_text || null,
    priceIntroText: row.price_intro_text || null,
    priceIntroTextEn: row.price_intro_text_en || null,
    buttonText: row.button_text || null,
    buttonUrl: row.button_url || null,
    currency: row.currency || "JOD",
    titleEn: row.title_en || null,
    descriptionEn: row.description_en || null,
    labelEn: row.label_en || null,
    billingTextEn: row.billing_text_en || null,
    buttonTextEn: row.button_text_en || null,
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

async function listPlans({ includeDeleted = false, planPageId = null } = {}) {
  const values = [Boolean(includeDeleted)];
  let where = "($1::boolean = TRUE OR deleted_at IS NULL)";
  if (planPageId != null) {
    values.push(Number(planPageId));
    where += ` AND plan_page_id = $${values.length}`;
  }
  const { rows } = await pool.query(
    `SELECT *
     FROM plans
     WHERE ${where}
     ORDER BY sort_order ASC, id ASC`,
    values,
  );
  return attachFeaturesToPlans(rows);
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

/** Marketing /pricing page: default plan page or fixed ORDERZHOUSE tiers merged with catalog. */
async function listPublicCatalogPlans() {
  const { rows: pageRows } = await pool.query(
    `SELECT id, page_type
     FROM plan_pages
     WHERE page_type = 'default' AND is_active = TRUE
     ORDER BY id ASC
     LIMIT 1`,
  );
  const defaultPage = pageRows[0];

  if (defaultPage) {
    const { rows } = await pool.query(
      `SELECT *
       FROM plans
       WHERE deleted_at IS NULL
         AND is_visible = TRUE
         AND is_active = TRUE
         AND plan_page_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [Number(defaultPage.id)],
    );
    if (rows.length > 0) {
      const plans = await attachFeaturesToPlans(rows);
      const apiPlans = plans.map((plan, idx) => {
        const row = rows[idx];
        const mapped = { ...plan };
        delete mapped.adminNotes;
        return {
          ...mapped,
          checkoutPlanId: String(resolveCheckoutPlanId(row)),
          selfCheckoutEligible: planEligibleForFreelancerSelfCheckout(row),
        };
      });
      return mergeApiPlansWithCatalog(apiPlans);
    }
  }

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
      checkoutPlanId: String(resolveCheckoutPlanId(row)),
      selfCheckoutEligible: planEligibleForFreelancerSelfCheckout(row),
    };
  });
  return mergeApiPlansWithCatalog(apiPlans);
}

async function getPlanById(id) {
  const { rows } = await pool.query(`SELECT * FROM plans WHERE id = $1 LIMIT 1`, [id]);
  const [plan] = await attachFeaturesToPlans(rows);
  return plan || null;
}

async function resolvePlanRowForCheckout(planId) {
  const { rows } = await pool.query(`SELECT * FROM plans WHERE id = $1 LIMIT 1`, [Number(planId)]);
  const row = rows[0];
  if (!row) return null;
  const checkoutId = resolveCheckoutPlanId(row);
  if (checkoutId === Number(row.id)) return row;
  const { rows: subRows } = await pool.query(`SELECT * FROM plans WHERE id = $1 LIMIT 1`, [checkoutId]);
  return subRows[0] || null;
}

function pickExtendedPayload(payload) {
  return {
    features: payload.features !== undefined ? jsonArrayToDb(payload.features) : undefined,
    trainings: payload.trainings !== undefined ? jsonArrayToDb(payload.trainings) : undefined,
    trainingsEn: payload.trainingsEn !== undefined ? jsonArrayToDb(payload.trainingsEn) : undefined,
    paymentNotes: payload.paymentNotes,
    installmentPlan:
      payload.installmentPlan !== undefined ? installmentPlanToDb(payload.installmentPlan) : undefined,
    offerExpiresAt: payload.offerExpiresAt,
    offerLabel: payload.offerLabel,
    offerLabelEn: payload.offerLabelEn,
    orderValueMinJod: payload.orderValueMinJod,
    orderValueMaxJod: payload.orderValueMaxJod,
    activationRequirements: payload.activationRequirements,
    refundPolicy: payload.refundPolicy,
    adminNotes: payload.adminNotes,
    isPopular: payload.isPopular,
    isFeatured: payload.isFeatured,
    stripeCheckoutAmountJod: payload.stripeCheckoutAmountJod,
    planPageId: payload.planPageId,
    subscriptionPlanId: payload.subscriptionPlanId,
    label: payload.label,
    billingText: payload.billingText,
    priceIntroText: payload.priceIntroText,
    priceIntroTextEn: payload.priceIntroTextEn,
    buttonText: payload.buttonText,
    buttonUrl: payload.buttonUrl,
    currency: payload.currency,
    titleEn: payload.titleEn,
    descriptionEn: payload.descriptionEn,
    labelEn: payload.labelEn,
    billingTextEn: payload.billingTextEn,
    buttonTextEn: payload.buttonTextEn,
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
    planPageId = null,
    subscriptionPlanId = null,
    label = null,
    billingText = null,
    buttonText = null,
    buttonUrl = null,
    currency = "JOD",
    titleEn = null,
    descriptionEn = null,
    labelEn = null,
    billingTextEn = null,
    buttonTextEn = null,
  } = payload;

  const ext = pickExtendedPayload(payload);

  const { rows } = await pool.query(
    `INSERT INTO plans (
      name, title, title_en, description, description_en, duration_days, price_jod, stripe_checkout_amount_jod,
      requires_company_visit, self_subscribe_allowed, is_active, is_visible, sort_order,
      features, trainings, trainings_en, payment_notes, installment_plan,
      offer_expires_at, offer_label, offer_label_en, order_value_min_jod, order_value_max_jod,
      activation_requirements, refund_policy, admin_notes,
      is_popular, is_featured,
      plan_page_id, subscription_plan_id, label, label_en, billing_text, billing_text_en,
      price_intro_text, price_intro_text_en,
      button_text, button_text_en, button_url, currency,
      created_by_user_id, updated_by_user_id
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
      COALESCE($14::jsonb, '[]'::jsonb),
      COALESCE($15::jsonb, '[]'::jsonb),
      COALESCE($16::jsonb, '[]'::jsonb),
      $17,$18::jsonb,
      $19,$20,$21,$22,$23,
      $24,$25,$26,
      COALESCE($27, FALSE), COALESCE($28, FALSE),
      $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,COALESCE($40, 'JOD'),
      $41,$41
    )
    RETURNING *`,
    [
      name,
      title,
      ext.titleEn !== undefined ? ext.titleEn : titleEn,
      description,
      ext.descriptionEn !== undefined ? ext.descriptionEn : descriptionEn,
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
      ext.trainingsEn !== undefined ? ext.trainingsEn : "[]",
      ext.paymentNotes !== undefined ? ext.paymentNotes : null,
      ext.installmentPlan,
      ext.offerExpiresAt !== undefined ? ext.offerExpiresAt || null : null,
      ext.offerLabel !== undefined ? ext.offerLabel : null,
      ext.offerLabelEn !== undefined ? ext.offerLabelEn : null,
      ext.orderValueMinJod !== undefined && ext.orderValueMinJod != null ? Number(ext.orderValueMinJod) : null,
      ext.orderValueMaxJod !== undefined && ext.orderValueMaxJod != null ? Number(ext.orderValueMaxJod) : null,
      ext.activationRequirements !== undefined ? ext.activationRequirements : null,
      ext.refundPolicy !== undefined ? ext.refundPolicy : null,
      ext.adminNotes !== undefined ? ext.adminNotes : null,
      ext.isPopular !== undefined ? Boolean(ext.isPopular) : false,
      ext.isFeatured !== undefined ? Boolean(ext.isFeatured) : false,
      planPageId != null ? Number(planPageId) : null,
      subscriptionPlanId != null ? Number(subscriptionPlanId) : null,
      label,
      ext.labelEn !== undefined ? ext.labelEn : labelEn,
      billingText,
      ext.billingTextEn !== undefined ? ext.billingTextEn : billingTextEn,
      ext.priceIntroText !== undefined ? ext.priceIntroText : null,
      ext.priceIntroTextEn !== undefined ? ext.priceIntroTextEn : null,
      buttonText,
      ext.buttonTextEn !== undefined ? ext.buttonTextEn : buttonTextEn,
      buttonUrl,
      currency,
      actorUserId ? Number(actorUserId) : null,
    ],
  );

  const [plan] = await attachFeaturesToPlans(rows);
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
  if (patch.trainingsEn !== undefined) set("trainings_en", jsonArrayToDb(patch.trainingsEn));
  if (patch.paymentNotes !== undefined) set("payment_notes", patch.paymentNotes);
  if (patch.installmentPlan !== undefined) set("installment_plan", installmentPlanToDb(patch.installmentPlan));
  if (patch.offerExpiresAt !== undefined) set("offer_expires_at", patch.offerExpiresAt || null);
  if (patch.offerLabel !== undefined) set("offer_label", patch.offerLabel);
  if (patch.offerLabelEn !== undefined) set("offer_label_en", patch.offerLabelEn);
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
  if (patch.planPageId !== undefined) set("plan_page_id", patch.planPageId == null ? null : Number(patch.planPageId));
  if (patch.subscriptionPlanId !== undefined) {
    set("subscription_plan_id", patch.subscriptionPlanId == null ? null : Number(patch.subscriptionPlanId));
  }
  if (patch.label !== undefined) set("label", patch.label);
  if (patch.billingText !== undefined) set("billing_text", patch.billingText);
  if (patch.priceIntroText !== undefined) set("price_intro_text", patch.priceIntroText);
  if (patch.priceIntroTextEn !== undefined) set("price_intro_text_en", patch.priceIntroTextEn);
  if (patch.buttonText !== undefined) set("button_text", patch.buttonText);
  if (patch.buttonUrl !== undefined) set("button_url", patch.buttonUrl);
  if (patch.currency !== undefined) set("currency", patch.currency || "JOD");
  if (patch.titleEn !== undefined) set("title_en", patch.titleEn);
  if (patch.descriptionEn !== undefined) set("description_en", patch.descriptionEn);
  if (patch.labelEn !== undefined) set("label_en", patch.labelEn);
  if (patch.billingTextEn !== undefined) set("billing_text_en", patch.billingTextEn);
  if (patch.buttonTextEn !== undefined) set("button_text_en", patch.buttonTextEn);

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
  const [plan] = await attachFeaturesToPlans(rows);
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
  mapPlan,
  attachFeaturesToPlans,
  resolveCheckoutPlanId,
  resolveAssignableSubscriptionPlanId,
  resolvePlanRowForCheckout,
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
