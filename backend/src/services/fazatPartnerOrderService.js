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

function readRouteMode(row) {
  const meta = row?.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : null;
  const raw = String(meta?.routeMode || meta?.route_mode || "").trim().toUpperCase();
  if (raw === "POOL" || raw === "ORDERZ_POOL") return "POOL";
  if (raw === "DIRECT" || raw === "ORDERZ_DIRECT") return "DIRECT";
  // Legacy rows without metadata are direct assigns.
  return row?.freelancer_user_id != null || String(row?.status || "") === "assigned" ? "DIRECT" : "POOL";
}

function mapPartnerOrder(row, order = null) {
  if (!row) return null;
  return {
    partnerCode: row.partner_code,
    partnerOrderId: String(row.id),
    orderzOrderId: String(row.orderz_order_id),
    providerOrderId: String(row.orderz_order_id),
    externalAssignmentId: row.external_assignment_id,
    externalOrderId: row.external_order_id || null,
    freelancerId: row.freelancer_user_id != null ? String(row.freelancer_user_id) : null,
    routeMode: readRouteMode(row),
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

function isPoolRouteMode(body = {}) {
  const mode = String(body.routeMode || body.route || "").trim().toUpperCase();
  return mode === "POOL" || mode === "ORDERZ_POOL";
}

/**
 * Pool display/claim budget for FAZAT partner posts.
 * Never silently defaults to 1 JOD (below free plan min 3).
 * Sources (in order): body.budget | body.displayBudget | body.payoutBudget | FAZAT_POOL_DEFAULT_BUDGET_JOD.
 * Validated against Orderzhouse subscription plan value bands (catalog).
 * This is visibility/eligibility budget only — not Stripe/wallet/settlement amount.
 */
function resolveAndValidatePoolBudgetJod(body = {}, cfg = getFazatIntegrationConfig()) {
  const planOrderValueEligibility = require("./planOrderValueEligibility");
  const { ORDERZHOUSE_PLAN_IDS } = require("../constants/orderzhousePlansCatalog");

  const raw =
    body.budget != null
      ? body.budget
      : body.displayBudget != null
        ? body.displayBudget
        : body.payoutBudget != null
          ? body.payoutBudget
          : cfg.poolDefaultBudgetJod;

  if (raw == null || raw === "") {
    const err = new Error(
      "Pool budget is required. Send budget/displayBudget (JOD) claimable by an active Orderz plan band, or set FAZAT_POOL_DEFAULT_BUDGET_JOD.",
    );
    err.statusCode = 400;
    err.code = "FAZAT_POOL_BUDGET_REQUIRED";
    err.publicCode = "FAZAT_POOL_BUDGET_REQUIRED";
    err.exposeToClient = true;
    throw err;
  }

  const budget = Number(raw);
  if (!Number.isFinite(budget) || budget <= 0) {
    const err = new Error("Pool budget must be a positive JOD amount.");
    err.statusCode = 400;
    err.code = "FAZAT_POOL_BUDGET_REQUIRED";
    err.publicCode = "FAZAT_POOL_BUDGET_REQUIRED";
    err.exposeToClient = true;
    throw err;
  }

  let fitsAnyPlan = false;
  for (const planId of ORDERZHOUSE_PLAN_IDS) {
    const range = planOrderValueEligibility.getPlanOrderValueRange(planId);
    if (planOrderValueEligibility.isSingleValueInPlanRange(range, budget)) {
      fitsAnyPlan = true;
      break;
    }
  }
  if (!fitsAnyPlan) {
    const err = new Error(
      "Pool budget is outside all active Orderz subscription plan bands (e.g. free 3–7 JOD).",
    );
    err.statusCode = 400;
    err.code = "FAZAT_POOL_BUDGET_OUT_OF_PLAN_BANDS";
    err.publicCode = "FAZAT_POOL_BUDGET_OUT_OF_PLAN_BANDS";
    err.exposeToClient = true;
    throw err;
  }

  return budget;
}

function resolveExternalRefs(body = {}) {
  const externalOrderIdRaw =
    body.externalOrderId != null
      ? String(body.externalOrderId).trim()
      : body.fazatOrderId != null
        ? String(body.fazatOrderId).trim()
        : "";
  const externalOrderId = externalOrderIdRaw || null;
  let externalAssignmentId = String(body.externalAssignmentId || "").trim();
  if (!externalAssignmentId && externalOrderId) {
    externalAssignmentId = `pool:${externalOrderId}`;
  }
  return { externalAssignmentId, externalOrderId };
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

async function createPartnerPoolOrder(body = {}, { idempotencyKey = null } = {}) {
  const cfg = getFazatIntegrationConfig();
  const { externalAssignmentId, externalOrderId } = resolveExternalRefs(body);
  const title = String(body.title || "").trim();
  const description = String(body.sanitizedBrief || body.description || body.requirements || "").trim();
  const categoryId = Number(body.categoryId || cfg.defaultCategoryId);
  const durationValue = Number(body.durationValue != null ? body.durationValue : 3);
  const durationUnit = String(body.durationUnit || "days").trim() || "days";
  const preferredSkills = Array.isArray(body.preferredSkills)
    ? body.preferredSkills
    : Array.isArray(body.skills)
      ? body.skills
      : [];

  if (!externalAssignmentId) {
    const err = new Error("externalAssignmentId or externalOrderId/fazatOrderId is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!title || !description) {
    const err = new Error("title and sanitizedBrief/description are required.");
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isInteger(categoryId) || categoryId < 1) {
    const err = new Error("categoryId is required (or set FAZAT_DEFAULT_CATEGORY_ID).");
    err.statusCode = 400;
    throw err;
  }
  // Pool create must not select a freelancer — reject accidental direct fields.
  const accidentalFreelancer = Number(body.selectedFreelancerId || body.freelancerId);
  if (Number.isInteger(accidentalFreelancer) && accidentalFreelancer > 0) {
    const err = new Error("Pool orders must not include selectedFreelancerId. Use direct assign endpoint instead.");
    err.statusCode = 400;
    err.code = "FAZAT_POOL_NO_FREELANCER";
    err.publicCode = "FAZAT_POOL_NO_FREELANCER";
    err.exposeToClient = true;
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

  // Fast fail before any order create — never silent budget=1 for POOL.
  const budget = resolveAndValidatePoolBudgetJod(body, cfg);

  await pool.query(
    `INSERT INTO integration_partners (code, name, enabled)
     VALUES ($1, 'FAZ3AT', TRUE)
     ON CONFLICT (code) DO UPDATE SET enabled = TRUE, updated_at = NOW()`,
    [PARTNER_CODE],
  );

  const actor = await resolveActorUserId();
  // Unassigned internal fixed order → published + is_open_for_pool (normal pool feed).
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
      budget,
      durationValue: Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 3,
      durationUnit,
      preferredSkills,
      archive: false,
    },
    uploadedFiles: [],
    options: {
      // FAZAT pool orders are discovered via the normal pool feed.
      // Sync broadcast to every freelancer (createIfNotExists per id) can hang
      // createInternalOrder for minutes and blow FAZ3AT's outbound timeout.
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
       ) VALUES ($1,$2,$3,$4,NULL,'created','pending_internal_settlement',$5,$6::jsonb)
       RETURNING *`,
      [
        PARTNER_CODE,
        Number(created.id),
        externalAssignmentId,
        externalOrderId,
        idempotencyKey || null,
        JSON.stringify({
          routeMode: "POOL",
          priority: body.priority || null,
          internalAdminNotes: body.internalAdminNotes ? String(body.internalAdminNotes).slice(0, 2000) : null,
          dueDate: body.dueDate || null,
          sourcePartner: PARTNER_CODE,
          whiteLabelClientAlias: cfg.freelancerClientAliasAr,
          // Never store client PII / Stripe / wallet from FAZ3AT.
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
    action: "fazat.partner_pool_order.created",
    entityType: "partner_order",
    entityId: String(partnerRow.id),
    detail: {
      orderzOrderId: String(created.id),
      externalAssignmentId,
      routeMode: "POOL",
    },
  });

  notifyPartnerOrderEvent("orderz.partner_order.created", partnerRow, {
    status: "created",
    routeMode: "POOL",
  });

  return { partnerOrder: mapPartnerOrder(partnerRow, created), order: created, idempotentReplay: false };
}

async function createPartnerOrder(body = {}, { idempotencyKey = null } = {}) {
  if (isPoolRouteMode(body)) {
    return createPartnerPoolOrder(body, { idempotencyKey });
  }

  const cfg = getFazatIntegrationConfig();
  const { externalAssignmentId, externalOrderId } = resolveExternalRefs(body);
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

  const cfg = getFazatIntegrationConfig();
  if (cfg.freelancerExportMode === "eligible") {
    const fazatFreelancerExportService = require("./fazatFreelancerExportService");
    await fazatFreelancerExportService.assertEligibleForFazatAssignment(freelancerId);
  } else {
    assertPilotAllowlisted(freelancerId);
    await fazatFreelancerProfileService.assertAssignableForPartner(freelancerId);
  }

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
          routeMode: "DIRECT",
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
      routeMode: "DIRECT",
    },
  });
  await writePartnerAudit({
    action: "fazat.partner_order.assigned",
    entityType: "partner_order",
    entityId: String(partnerRow.id),
    detail: { freelancerId: String(freelancerId), routeMode: "DIRECT" },
  });

  notifyPartnerOrderEvent("orderz.partner_order.created", partnerRow, {
    status: "assigned",
    routeMode: "DIRECT",
  });
  notifyPartnerOrderEvent("orderz.partner_order.assigned", partnerRow, {
    status: "assigned",
    routeMode: "DIRECT",
  });

  return { partnerOrder: mapPartnerOrder(partnerRow, created), order: created, idempotentReplay: false };
}

/**
 * After a normal pool fixed-take assigns a partner-managed open order,
 * link the freelancer and notify FAZ3AT (routeMode=POOL).
 */
async function markAssignedAfterPoolClaim({ orderzOrderId, freelancerUserId }) {
  const oid = Number(orderzOrderId);
  const fid = Number(freelancerUserId);
  if (!Number.isInteger(oid) || oid < 1 || !Number.isInteger(fid) || fid < 1) return null;

  const { rows: existingRows } = await pool.query(
    `SELECT * FROM partner_orders
     WHERE partner_code = $1 AND orderz_order_id = $2
     LIMIT 1`,
    [PARTNER_CODE, oid],
  );
  const existing = existingRows[0];
  if (!existing) return null;
  if (existing.status === "assigned" && Number(existing.freelancer_user_id) === fid) {
    return existing; // already linked — do not re-emit webhook
  }
  if (existing.freelancer_user_id != null && Number(existing.freelancer_user_id) !== fid) {
    return existing; // different assignee (direct or race) — leave alone
  }

  const { rows } = await pool.query(
    `UPDATE partner_orders
       SET freelancer_user_id = $2,
           status = 'assigned',
           updated_at = NOW(),
           metadata_json = COALESCE(metadata_json, '{}'::jsonb)
             || jsonb_build_object('routeMode', COALESCE(metadata_json->>'routeMode', 'POOL'))
     WHERE id = $3
       AND partner_code = $1
       AND freelancer_user_id IS NULL
       AND status = 'created'
     RETURNING *`,
    [PARTNER_CODE, fid, existing.id],
  );
  const row = rows[0];
  if (!row) return existing;

  const { rows: users } = await pool.query(
    `SELECT account_id FROM users WHERE id = $1 LIMIT 1`,
    [fid],
  );
  const publicCode = users[0]?.account_id != null ? String(users[0].account_id) : null;

  await writePartnerAudit({
    action: "fazat.partner_pool_order.assigned",
    entityType: "partner_order",
    entityId: String(row.id),
    detail: {
      orderzOrderId: String(oid),
      freelancerId: String(fid),
      publicCode,
      routeMode: "POOL",
    },
  });

  notifyPartnerOrderEvent("orderz.partner_order.assigned", row, {
    status: "assigned",
    routeMode: "POOL",
    publicCode,
    providerOrderId: String(oid),
    partnerOrderId: String(row.id),
  });

  return row;
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

/**
 * Partner-only file download for FAZAT/FAZ3AT backends.
 * Restricts to partner-managed orders and delivery/revision file purposes.
 */
async function preparePartnerOrderFileDownload(orderzOrderId, fileId) {
  const oid = Number(orderzOrderId);
  const fid = Number(fileId);
  if (!Number.isInteger(oid) || oid < 1 || !Number.isInteger(fid) || fid < 1) {
    const err = new Error("Invalid orderId or fileId.");
    err.statusCode = 400;
    err.code = "FAZAT_FILE_INVALID_IDS";
    err.publicCode = "FAZAT_FILE_INVALID_IDS";
    err.exposeToClient = true;
    throw err;
  }
  const managed = await isPartnerManagedOrder(oid);
  if (!managed) {
    const err = new Error("Partner order not found.");
    err.statusCode = 404;
    throw err;
  }
  const { rows } = await pool.query(
    `SELECT id, order_id, purpose, file_path, file_url, secure_url, original_name, mime_type
     FROM order_files
     WHERE id = $1 AND order_id = $2
     LIMIT 1`,
    [fid, oid],
  );
  const f = rows[0];
  if (!f) {
    const err = new Error("File not found on partner order.");
    err.statusCode = 404;
    throw err;
  }
  const purpose = String(f.purpose || "");
  if (purpose !== "delivery" && purpose !== "revision_request") {
    const err = new Error("File purpose is not available for partner download.");
    err.statusCode = 403;
    err.code = "FAZAT_FILE_PURPOSE_FORBIDDEN";
    err.publicCode = "FAZAT_FILE_PURPOSE_FORBIDDEN";
    err.exposeToClient = true;
    throw err;
  }
  return ordersService.prepareStaffOrderFileDownload({ orderId: oid, fileId: fid });
}

module.exports = {
  mapPartnerOrder,
  createPartnerOrder,
  createPartnerPoolOrder,
  markAssignedAfterPoolClaim,
  getPartnerOrderByOrderzId,
  getDeliveries,
  preparePartnerOrderFileDownload,
  requestRevision,
  isPartnerManagedOrder,
  findByIdempotencyOrExternal,
  isPoolRouteMode,
  resolveAndValidatePoolBudgetJod,
};
