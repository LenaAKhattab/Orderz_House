const { pool } = require("../config/db");
const {
  PARTNER_CODE,
  getFazatIntegrationConfig,
  assertPilotAllowlisted,
} = require("../config/fazatIntegration");
const ordersService = require("./ordersService");
const fazatFreelancerProfileService = require("./fazatFreelancerProfileService");
const { writePartnerAudit } = require("./fazatAuditService");
const { notifyPartnerOrderEvent } = require("./fazatWebhookOutboundService");

function mapPartnerOrder(row, order = null) {
  if (!row) return null;
  return {
    partnerCode: row.partner_code,
    partnerOrderId: String(row.id),
    orderzOrderId: String(row.orderz_order_id),
    externalAssignmentId: row.external_assignment_id,
    externalOrderId: row.external_order_id || null,
    freelancerId: row.freelancer_user_id != null ? String(row.freelancer_user_id) : null,
    status: row.status,
    settlementStatus: row.settlement_status,
    orderStatus: order?.orderStatus || order?.order_status || null,
    title: order?.title || null,
    dueAt: order?.dueAt || order?.due_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Intentionally omit FAZ3AT client identity / payment / wallet.
  };
}

async function resolveActorUserId() {
  const cfg = getFazatIntegrationConfig();
  if (cfg.actorUserId) {
    const { rows } = await pool.query(
      `SELECT id, role FROM users WHERE id = $1 AND role IN ('admin','super_admin') AND is_active = TRUE LIMIT 1`,
      [cfg.actorUserId],
    );
    if (rows[0]) return { userId: Number(rows[0].id), role: rows[0].role };
  }
  const { rows } = await pool.query(
    `SELECT id, role FROM users
     WHERE role IN ('admin','super_admin') AND is_active = TRUE
     ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
  );
  if (!rows[0]) {
    const err = new Error("No admin actor configured for FAZAT order creation.");
    err.statusCode = 503;
    err.code = "FAZAT_ACTOR_MISSING";
    throw err;
  }
  return { userId: Number(rows[0].id), role: rows[0].role };
}

async function findByIdempotencyOrExternal({ idempotencyKey, externalAssignmentId }) {
  if (idempotencyKey) {
    const { rows } = await pool.query(
      `SELECT * FROM partner_orders WHERE partner_code = $1 AND idempotency_key = $2 LIMIT 1`,
      [PARTNER_CODE, String(idempotencyKey)],
    );
    if (rows[0]) return rows[0];
  }
  if (externalAssignmentId) {
    const { rows } = await pool.query(
      `SELECT * FROM partner_orders WHERE partner_code = $1 AND external_assignment_id = $2 LIMIT 1`,
      [PARTNER_CODE, String(externalAssignmentId)],
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

async function createPartnerOrder(body = {}, { idempotencyKey = null } = {}) {
  const cfg = getFazatIntegrationConfig();
  const externalAssignmentId = String(body.externalAssignmentId || "").trim();
  const externalOrderId = body.externalOrderId != null ? String(body.externalOrderId).trim() : null;
  const title = String(body.title || "").trim();
  const description = String(body.sanitizedBrief || body.description || body.requirements || "").trim();
  const freelancerId = Number(body.selectedFreelancerId || body.freelancerId);
  const categoryId = Number(body.categoryId || cfg.defaultCategoryId);
  const durationValue = Number(body.durationValue != null ? body.durationValue : 3);
  const durationUnit = String(body.durationUnit || "days").trim() || "days";
  const budget = body.budget != null ? Number(body.budget) : body.payoutBudget != null ? Number(body.payoutBudget) : 1;
  const preferredSkills = Array.isArray(body.preferredSkills)
    ? body.preferredSkills
    : Array.isArray(body.skills)
      ? body.skills
      : [];

  if (!externalAssignmentId) {
    const err = new Error("externalAssignmentId is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!title || !description) {
    const err = new Error("title and sanitizedBrief/description are required.");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(freelancerId) || freelancerId < 1) {
    const err = new Error("selectedFreelancerId is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    const err = new Error("categoryId is required (or set FAZAT_DEFAULT_CATEGORY_ID).");
    err.statusCode = 400;
    throw err;
  }

  const existing = await findByIdempotencyOrExternal({
    idempotencyKey,
    externalAssignmentId,
  });
  if (existing) {
    const order = await ordersService.getOrderById(existing.orderz_order_id);
    return { partnerOrder: mapPartnerOrder(existing, order), order, idempotentReplay: true };
  }

  assertPilotAllowlisted(freelancerId);
  await fazatFreelancerProfileService.assertAssignableForPartner(freelancerId);

  // Ensure partner row exists (env FAZAT_INTEGRATION_ENABLED is the real gate).
  await pool.query(
    `INSERT INTO integration_partners (code, name, enabled)
     VALUES ($1, 'FAZ3AT', TRUE)
     ON CONFLICT (code) DO UPDATE SET enabled = TRUE, updated_at = NOW()`,
    [PARTNER_CODE],
  );

  const actor = await resolveActorUserId();

  const created = await ordersService.createInternalOrder({
    actorUserId: actor.userId,
    actorRole: actor.role,
    payload: {
      title,
      description,
      categoryId,
      subcategoryId: body.subcategoryId ? Number(body.subcategoryId) : null,
      subSubcategoryId: body.subSubcategoryId ? Number(body.subSubcategoryId) : null,
      projectType: "fixed",
      budget: Number.isFinite(budget) && budget > 0 ? budget : 1,
      durationValue: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 3,
      durationUnit,
      assignedFreelancerId: freelancerId,
      preferredSkills,
      archive: false,
    },
    uploadedFiles: [],
    options: {
      skipFreelancerBroadcast: true,
      visibilityScope: "public",
    },
  });

  let partnerRow;
  try {
    const { rows } = await pool.query(
      `INSERT INTO partner_orders (
         partner_code, orderz_order_id, external_assignment_id, external_order_id,
         freelancer_user_id, status, settlement_status, idempotency_key, metadata_json
       ) VALUES ($1,$2,$3,$4,$5,'assigned','pending_internal_settlement',$6,$7::jsonb)
       RETURNING *`,
      [
        PARTNER_CODE,
        Number(created.id),
        externalAssignmentId,
        externalOrderId,
        freelancerId,
        idempotencyKey || null,
        JSON.stringify({
          priority: body.priority || null,
          internalAdminNotes: body.internalAdminNotes ? String(body.internalAdminNotes).slice(0, 2000) : null,
          dueDate: body.dueDate || null,
          // Store FAZAT refs for admin/audit only — never returned to freelancer APIs.
          sourcePartner: PARTNER_CODE,
          whiteLabelClientAlias: cfg.freelancerClientAliasAr,
        }),
      ],
    );
    partnerRow = rows[0];
  } catch (err) {
    if (err && err.code === "23505") {
      const again = await findByIdempotencyOrExternal({ idempotencyKey, externalAssignmentId });
      if (again) {
        const order = await ordersService.getOrderById(again.orderz_order_id);
        return { partnerOrder: mapPartnerOrder(again, order), order, idempotentReplay: true };
      }
    }
    throw err;
  }

  await writePartnerAudit({
    action: "fazat.partner_order.created",
    entityType: "partner_order",
    entityId: String(partnerRow.id),
    detail: {
      orderzOrderId: String(created.id),
      externalAssignmentId,
      freelancerId: String(freelancerId),
    },
  });
  await writePartnerAudit({
    action: "fazat.partner_order.assigned",
    entityType: "partner_order",
    entityId: String(partnerRow.id),
    detail: { freelancerId: String(freelancerId) },
  });

  notifyPartnerOrderEvent("orderz.partner_order.created", partnerRow, {
    status: "assigned",
  });
  notifyPartnerOrderEvent("orderz.partner_order.assigned", partnerRow, {
    status: "assigned",
  });

  return { partnerOrder: mapPartnerOrder(partnerRow, created), order: created, idempotentReplay: false };
}

async function getPartnerOrderByOrderzId(orderzOrderId) {
  const { rows } = await pool.query(
    `SELECT * FROM partner_orders WHERE partner_code = $1 AND orderz_order_id = $2 LIMIT 1`,
    [PARTNER_CODE, Number(orderzOrderId)],
  );
  if (!rows[0]) {
    const err = new Error("Partner order not found.");
    err.statusCode = 404;
    throw err;
  }
  const order = await ordersService.getOrderById(rows[0].orderz_order_id);
  return { partnerOrder: mapPartnerOrder(rows[0], order), order, row: rows[0] };
}

async function getDeliveries(orderzOrderId) {
  const { order, partnerOrder } = await getPartnerOrderByOrderzId(orderzOrderId);
  const files = Array.isArray(order.files)
    ? order.files
        .filter((f) => String(f.purpose || "") === "delivery" || String(f.purpose || "") === "revision_request")
        .map((f) => ({
          id: f.id,
          purpose: f.purpose,
          originalName: f.originalName || null,
          mimeType: f.mimeType || null,
          sizeBytes: f.sizeBytes != null ? Number(f.sizeBytes) : null,
          uploadedAt: f.uploadedAt || null,
          // Protected download path hint — FAZAT backend must auth via integration when fetching.
          downloadPath: `/api/integrations/fazat/orders/${partnerOrder.orderzOrderId}/files/${f.id}`,
        }))
    : [];
  return {
    partnerOrder,
    orderStatus: order.orderStatus,
    submissionHistory: order.submissionHistory || null,
    deliveries: files,
  };
}

async function requestRevision(orderzOrderId, { note }) {
  const { row, partnerOrder } = await getPartnerOrderByOrderzId(orderzOrderId);
  const actor = await resolveActorUserId();
  const updated = await ordersService.adminRequestInternalDeliveryRevision({
    orderId: Number(orderzOrderId),
    note,
    uploadedFiles: [],
    staffUserId: actor.userId,
    revisionRequestedByRole: actor.role,
  });
  await pool.query(
    `UPDATE partner_orders SET status = 'revision_requested', updated_at = NOW() WHERE id = $1`,
    [row.id],
  );
  row.status = "revision_requested";
  notifyPartnerOrderEvent("orderz.partner_order.status_changed", row, {
    status: "revision_requested",
  });
  return { partnerOrder: mapPartnerOrder(row, updated), order: updated };
}

async function isPartnerManagedOrder(orderzOrderId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM partner_orders WHERE partner_code = $1 AND orderz_order_id = $2 LIMIT 1`,
    [PARTNER_CODE, Number(orderzOrderId)],
  );
  return rows.length > 0;
}

module.exports = {
  mapPartnerOrder,
  createPartnerOrder,
  getPartnerOrderByOrderzId,
  getDeliveries,
  requestRevision,
  isPartnerManagedOrder,
  findByIdempotencyOrExternal,
};
