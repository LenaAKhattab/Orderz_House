const { pool } = require("../config/db");
const {
  canFreelancerBid,
  canFreelancerDeliver,
  canAdminAcceptBid,
  canAdminApproveDelivery,
  canAdminRequestRevision,
  canAdminArchiveDelivery,
  deliveryMatchesAssignedFreelancer,
  validatePantryRequestPayload,
  mapPantryDbError,
} = require("../constants/pantry");
const notificationService = require("./notificationService");

function httpError(status, message, code) {
  const err = new Error(message);
  err.statusCode = status;
  err.code = code;
  err.publicCode = code;
  return err;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function pantryQuery(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    throw mapPantryDbError(err);
  }
}

function mapRequest(row, extras = {}) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    description: row.description || "",
    categoryId: row.category_id != null ? String(row.category_id) : null,
    subcategoryId: row.subcategory_id != null ? String(row.subcategory_id) : null,
    subSubcategoryId: row.sub_subcategory_id != null ? String(row.sub_subcategory_id) : null,
    pricingType: row.pricing_type || "fixed",
    budgetMin: row.budget_min != null ? Number(row.budget_min) : null,
    budgetMax: row.budget_max != null ? Number(row.budget_max) : null,
    fixedBudget: row.fixed_budget != null ? Number(row.fixed_budget) : null,
    deliveryDays: row.delivery_days != null ? Number(row.delivery_days) : null,
    durationUnit: row.duration_unit || "days",
    deadline: row.deadline || null,
    skills: parseJsonArray(row.skills),
    requirements: row.requirements || null,
    attachments: parseJsonArray(row.attachments),
    status: row.status,
    createdByAdminId: row.created_by_admin_id != null ? String(row.created_by_admin_id) : null,
    assignedFreelancerId:
      row.assigned_freelancer_id != null ? String(row.assigned_freelancer_id) : null,
    assignedFreelancerName: row.assigned_freelancer_name || extras.assignedFreelancerName || null,
    acceptedBidId: row.accepted_bid_id != null ? String(row.accepted_bid_id) : null,
    internalNotes: row.internal_notes || null,
    bidsCount: row.bids_count != null ? Number(row.bids_count) : extras.bidsCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBid(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    pantryRequestId: String(row.pantry_request_id),
    freelancerId: String(row.freelancer_id),
    freelancerName: row.freelancer_name || null,
    freelancerEmail: row.freelancer_email || null,
    amount: Number(row.amount),
    durationDays: row.duration_days != null ? Number(row.duration_days) : null,
    message: row.message || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDelivery(row, files = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    pantryRequestId: String(row.pantry_request_id),
    requestTitle: row.request_title || null,
    freelancerId: String(row.freelancer_id),
    freelancerName: row.freelancer_name || null,
    message: row.message || null,
    status: row.status,
    adminFeedback: row.admin_feedback || null,
    files: files.map((f) => ({
      id: String(f.id),
      fileUrl: f.file_url,
      fileName: f.file_name,
      mimeType: f.mime_type || null,
      sizeBytes: f.size_bytes != null ? Number(f.size_bytes) : null,
      createdAt: f.created_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function notifySafe(payload) {
  try {
    await notificationService.createNotification(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pantry] notification skipped:", err?.message || err);
  }
}

async function getStats() {
  const { rows } = await pantryQuery(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'open_for_bids')::int AS open_count,
       COUNT(*) FILTER (WHERE status IN ('assigned', 'in_progress'))::int AS in_progress_count,
       COUNT(*) FILTER (WHERE status IN ('submitted', 'revision_requested'))::int AS pending_review_count,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved_count
     FROM pantry_requests`,
  );
  const r = rows[0] || {};
  return {
    openCount: r.open_count || 0,
    inProgressCount: r.in_progress_count || 0,
    pendingReviewCount: r.pending_review_count || 0,
    approvedCount: r.approved_count || 0,
  };
}

async function listAdminRequests({ status } = {}) {
  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE r.status = $${params.length}`;
  }
  const { rows } = await pantryQuery(
    `SELECT r.*,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS assigned_freelancer_name,
            (SELECT COUNT(*)::int FROM pantry_bids b WHERE b.pantry_request_id = r.id) AS bids_count
     FROM pantry_requests r
     LEFT JOIN users u ON u.id = r.assigned_freelancer_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT 200`,
    params,
  );
  return rows.map((row) => mapRequest(row));
}

async function getRequestById(id, { includeBids = false, includeDeliveries = false } = {}) {
  const { rows } = await pantryQuery(
    `SELECT r.*,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS assigned_freelancer_name,
            (SELECT COUNT(*)::int FROM pantry_bids b WHERE b.pantry_request_id = r.id) AS bids_count
     FROM pantry_requests r
     LEFT JOIN users u ON u.id = r.assigned_freelancer_id
     WHERE r.id = $1
     LIMIT 1`,
    [id],
  );
  if (!rows.length) return null;
  const request = mapRequest(rows[0]);
  const out = { request };
  if (includeBids) {
    const bids = await listBidsForRequest(id);
    out.bids = bids;
  }
  if (includeDeliveries) {
    out.deliveries = await listDeliveriesForRequest(id);
  }
  return out;
}

async function createRequest(adminUserId, payload) {
  const adminId = Number(adminUserId);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    const err = httpError(
      401,
      "يجب تسجيل الدخول لإنشاء طلب بيت المونة.",
      "UNAUTHORIZED",
    );
    err.exposeToClient = true;
    throw err;
  }

  const validated = validatePantryRequestPayload(payload || {}, { partial: false });
  if (!validated.ok) {
    const err = httpError(400, validated.message, "VALIDATION_ERROR");
    err.exposeToClient = true;
    err.fieldErrors = validated.fieldErrors;
    throw err;
  }
  const v = validated.value;
  const status = v.publish === true ? "open_for_bids" : "draft";

  const { rows } = await pantryQuery(
    `INSERT INTO pantry_requests (
       title, description, category_id, subcategory_id, sub_subcategory_id,
       pricing_type, budget_min, budget_max, fixed_budget,
       delivery_days, duration_unit, deadline, skills, requirements, attachments,
       status, created_by_admin_id, internal_notes
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17,$18
     )
     RETURNING *`,
    [
      v.title,
      v.description,
      v.categoryId,
      v.subcategoryId,
      v.subSubcategoryId,
      v.pricingType,
      v.budgetMin,
      v.budgetMax,
      v.fixedBudget,
      v.deliveryDays,
      v.durationUnit,
      v.deadline,
      JSON.stringify(v.skills || []),
      v.requirements,
      JSON.stringify(v.attachments || []),
      status,
      adminId,
      v.internalNotes,
    ],
  );
  // TODO: broadcast notify freelancers on publish (avoid mass spam in MVP).
  return mapRequest(rows[0], { bidsCount: 0 });
}

async function updateRequest(id, payload) {
  const existing = await getRequestById(id);
  if (!existing) throw httpError(404, "طلب بيت المونة غير موجود.", "NOT_FOUND");

  if (payload && Object.prototype.hasOwnProperty.call(payload, "status")) {
    throw httpError(
      400,
      "لا يمكن تغيير الحالة عبر التعديل العام. استخدم مسارات النشر/القبول/التسليم/الاعتماد.",
      "STATUS_PATCH_FORBIDDEN",
    );
  }

  const validated = validatePantryRequestPayload(
    {
      title: payload.title !== undefined ? payload.title : existing.request.title,
      description: payload.description !== undefined ? payload.description : existing.request.description,
      categoryId: payload.categoryId !== undefined ? payload.categoryId : existing.request.categoryId,
      subcategoryId:
        payload.subcategoryId !== undefined ? payload.subcategoryId : existing.request.subcategoryId,
      subSubcategoryId:
        payload.subSubcategoryId !== undefined
          ? payload.subSubcategoryId
          : existing.request.subSubcategoryId,
      pricingType: payload.pricingType !== undefined ? payload.pricingType : existing.request.pricingType,
      fixedBudget: payload.fixedBudget !== undefined ? payload.fixedBudget : existing.request.fixedBudget,
      budgetMin: payload.budgetMin !== undefined ? payload.budgetMin : existing.request.budgetMin,
      budgetMax: payload.budgetMax !== undefined ? payload.budgetMax : existing.request.budgetMax,
      deliveryDays:
        payload.deliveryDays !== undefined ? payload.deliveryDays : existing.request.deliveryDays,
      durationUnit:
        payload.durationUnit !== undefined ? payload.durationUnit : existing.request.durationUnit,
      deadline: payload.deadline !== undefined ? payload.deadline : existing.request.deadline,
      skills: payload.skills !== undefined ? payload.skills : existing.request.skills,
      requirements:
        payload.requirements !== undefined ? payload.requirements : existing.request.requirements,
      attachments:
        payload.attachments !== undefined ? payload.attachments : existing.request.attachments,
      internalNotes:
        payload.internalNotes !== undefined ? payload.internalNotes : existing.request.internalNotes,
    },
    { partial: false },
  );
  if (!validated.ok) {
    const err = httpError(400, validated.message, "VALIDATION_ERROR");
    err.exposeToClient = true;
    err.fieldErrors = validated.fieldErrors;
    throw err;
  }
  const v = validated.value;

  const { rows } = await pantryQuery(
    `UPDATE pantry_requests SET
       title = $1,
       description = $2,
       category_id = $3,
       subcategory_id = $4,
       sub_subcategory_id = $5,
       pricing_type = $6,
       budget_min = $7,
       budget_max = $8,
       fixed_budget = $9,
       delivery_days = $10,
       duration_unit = $11,
       deadline = $12,
       skills = $13::jsonb,
       requirements = $14,
       attachments = $15::jsonb,
       internal_notes = $16,
       updated_at = NOW()
     WHERE id = $17
     RETURNING *`,
    [
      v.title,
      v.description,
      v.categoryId,
      v.subcategoryId,
      v.subSubcategoryId,
      v.pricingType,
      v.budgetMin,
      v.budgetMax,
      v.fixedBudget,
      v.deliveryDays,
      v.durationUnit,
      v.deadline,
      JSON.stringify(v.skills || []),
      v.requirements,
      JSON.stringify(v.attachments || []),
      v.internalNotes,
      id,
    ],
  );
  return mapRequest(rows[0]);
}

async function publishRequest(id) {
  const existing = await getRequestById(id);
  if (!existing) throw httpError(404, "طلب بيت المونة غير موجود.", "NOT_FOUND");
  if (!["draft", "open_for_bids"].includes(existing.request.status)) {
    throw httpError(409, "لا يمكن نشر هذا الطلب في حالته الحالية.", "INVALID_STATUS");
  }
  const { rows } = await pantryQuery(
    `UPDATE pantry_requests SET status = 'open_for_bids', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  // TODO: notify eligible freelancers about new pantry request.
  return mapRequest(rows[0]);
}

async function listBidsForRequest(requestId) {
  const { rows } = await pantryQuery(
    `SELECT b.*, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name,
            u.email AS freelancer_email
     FROM pantry_bids b
     JOIN users u ON u.id = b.freelancer_id
     WHERE b.pantry_request_id = $1
     ORDER BY b.created_at ASC`,
    [requestId],
  );
  return rows.map(mapBid);
}

async function acceptBid(requestId, bidId, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reqRes = await client.query(`SELECT * FROM pantry_requests WHERE id = $1 FOR UPDATE`, [
      requestId,
    ]);
    if (!reqRes.rows.length) throw httpError(404, "طلب بيت المونة غير موجود.", "NOT_FOUND");
    const request = reqRes.rows[0];

    const bidRes = await client.query(
      `SELECT * FROM pantry_bids WHERE id = $1 AND pantry_request_id = $2 FOR UPDATE`,
      [bidId, requestId],
    );
    if (!bidRes.rows.length) throw httpError(404, "العرض غير موجود.", "NOT_FOUND");
    const bid = bidRes.rows[0];

    if (!canAdminAcceptBid(request.status, bid.status)) {
      throw httpError(409, "لا يمكن قبول هذا العرض الآن.", "INVALID_STATUS");
    }

    await client.query(
      `UPDATE pantry_bids SET status = 'rejected', updated_at = NOW()
       WHERE pantry_request_id = $1 AND id <> $2 AND status = 'pending'`,
      [requestId, bidId],
    );
    await client.query(
      `UPDATE pantry_bids SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
      [bidId],
    );
    const { rows } = await client.query(
      `UPDATE pantry_requests SET
         status = 'assigned',
         assigned_freelancer_id = $1,
         accepted_bid_id = $2,
         updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [bid.freelancer_id, bidId, requestId],
    );
    await client.query("COMMIT");

    await notifySafe({
      recipientUserId: bid.freelancer_id,
      recipientRole: "freelancer",
      actorUserId,
      type: "pantry_bid_accepted",
      title: "تم قبول عرضك في بيت المونة",
      message: `تم قبول عرضك على طلب: ${request.title}`,
      entityType: "pantry_request",
      entityId: String(requestId),
      link: "/dashboard/freelancer/pantry",
      priority: "normal",
    });

    return mapRequest(rows[0]);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw mapPantryDbError(err);
  } finally {
    client.release();
  }
}

async function rejectBid(requestId, bidId) {
  const bidRes = await pantryQuery(
    `SELECT b.*, r.status AS request_status
     FROM pantry_bids b
     JOIN pantry_requests r ON r.id = b.pantry_request_id
     WHERE b.id = $1 AND b.pantry_request_id = $2`,
    [bidId, requestId],
  );
  if (!bidRes.rows.length) throw httpError(404, "العرض غير موجود.", "NOT_FOUND");
  const bid = bidRes.rows[0];
  if (bid.status !== "pending") {
    throw httpError(409, "لا يمكن رفض عرض غير معلّق.", "INVALID_STATUS");
  }
  const { rows } = await pantryQuery(
    `UPDATE pantry_bids SET status = 'rejected', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [bidId],
  );
  return mapBid(rows[0]);
}

async function listDeliveries({ status } = {}) {
  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE d.status = $${params.length}`;
  } else {
    where = `WHERE d.status IN ('submitted', 'revision_requested', 'approved', 'archived')`;
  }
  const { rows } = await pantryQuery(
    `SELECT d.*, r.title AS request_title, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
     FROM pantry_deliveries d
     JOIN pantry_requests r ON r.id = d.pantry_request_id
     JOIN users u ON u.id = d.freelancer_id
     ${where}
     ORDER BY d.created_at DESC
     LIMIT 200`,
    params,
  );
  const result = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const files = await listFilesForDelivery(row.id);
    result.push(mapDelivery(row, files));
  }
  return result;
}

async function listDeliveriesForRequest(requestId) {
  const { rows } = await pantryQuery(
    `SELECT d.*, r.title AS request_title, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
     FROM pantry_deliveries d
     JOIN pantry_requests r ON r.id = d.pantry_request_id
     JOIN users u ON u.id = d.freelancer_id
     WHERE d.pantry_request_id = $1
     ORDER BY d.created_at DESC`,
    [requestId],
  );
  const result = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const files = await listFilesForDelivery(row.id);
    result.push(mapDelivery(row, files));
  }
  return result;
}

async function listFilesForDelivery(deliveryId) {
  const { rows } = await pantryQuery(
    `SELECT * FROM pantry_delivery_files WHERE delivery_id = $1 ORDER BY id ASC`,
    [deliveryId],
  );
  return rows;
}

async function approveDelivery(deliveryId, actorUserId, { archive = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const delRes = await client.query(`SELECT * FROM pantry_deliveries WHERE id = $1 FOR UPDATE`, [
      deliveryId,
    ]);
    if (!delRes.rows.length) throw httpError(404, "التسليم غير موجود.", "NOT_FOUND");
    const delivery = delRes.rows[0];

    const reqRes = await client.query(
      `SELECT * FROM pantry_requests WHERE id = $1 FOR UPDATE`,
      [delivery.pantry_request_id],
    );
    if (!reqRes.rows.length) throw httpError(404, "طلب بيت المونة غير موجود.", "NOT_FOUND");
    const request = reqRes.rows[0];

    if (archive) {
      if (!canAdminArchiveDelivery(delivery.status)) {
        throw httpError(409, "لا يمكن أرشفة إلا منجز معتمد مسبقاً.", "INVALID_STATUS");
      }
    } else {
      if (!canAdminApproveDelivery(delivery.status)) {
        throw httpError(
          409,
          "لا يمكن اعتماد إلا تسليم بحالة submitted. إن وُجد طلب تعديل، يلزم تسليم جديد.",
          "INVALID_STATUS",
        );
      }
      if (!deliveryMatchesAssignedFreelancer(delivery, request)) {
        throw httpError(
          409,
          "لا يمكن اعتماد تسليم من فريلانسر غير المعيَّن على الطلب.",
          "ASSIGNEE_MISMATCH",
        );
      }
    }

    const nextDeliveryStatus = archive ? "archived" : "approved";
    await client.query(
      `UPDATE pantry_deliveries SET status = $1, updated_at = NOW() WHERE id = $2`,
      [nextDeliveryStatus, deliveryId],
    );
    const nextRequestStatus = archive ? "archived" : "approved";
    await client.query(
      `UPDATE pantry_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [nextRequestStatus, delivery.pantry_request_id],
    );
    await client.query("COMMIT");

    await notifySafe({
      recipientUserId: delivery.freelancer_id,
      recipientRole: "freelancer",
      actorUserId,
      type: "pantry_delivery_approved",
      title: archive ? "تمت أرشفة منجز بيت المونة" : "تم اعتماد تسليمك — جاهز في بيت المونة",
      message: archive
        ? "تم أرشفة التسليم من قبل الإدارة."
        : "تم اعتماد عملك وأصبح جاهزاً في بيت المونة.",
      entityType: "pantry_delivery",
      entityId: String(deliveryId),
      link: "/dashboard/freelancer/pantry",
      priority: "normal",
    });

    const files = await listFilesForDelivery(deliveryId);
    const { rows } = await pantryQuery(
      `SELECT d.*, r.title AS request_title, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
       FROM pantry_deliveries d
       JOIN pantry_requests r ON r.id = d.pantry_request_id
       JOIN users u ON u.id = d.freelancer_id
       WHERE d.id = $1`,
      [deliveryId],
    );
    return mapDelivery(rows[0], files);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function requestRevision(deliveryId, actorUserId, feedback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const delRes = await client.query(`SELECT * FROM pantry_deliveries WHERE id = $1 FOR UPDATE`, [
      deliveryId,
    ]);
    if (!delRes.rows.length) throw httpError(404, "التسليم غير موجود.", "NOT_FOUND");
    const delivery = delRes.rows[0];
    if (!canAdminRequestRevision(delivery.status)) {
      throw httpError(409, "لا يمكن طلب تعديل إلا لتسليم مقدّم (submitted).", "INVALID_STATUS");
    }
    await client.query(
      `UPDATE pantry_deliveries
       SET status = 'revision_requested', admin_feedback = $1, updated_at = NOW()
       WHERE id = $2`,
      [feedback || null, deliveryId],
    );
    await client.query(
      `UPDATE pantry_requests SET status = 'revision_requested', updated_at = NOW() WHERE id = $1`,
      [delivery.pantry_request_id],
    );
    await client.query("COMMIT");

    await notifySafe({
      recipientUserId: delivery.freelancer_id,
      recipientRole: "freelancer",
      actorUserId,
      type: "pantry_revision_requested",
      title: "طلب تعديل على تسليم بيت المونة",
      message: feedback || "طلبت الإدارة تعديلاً على تسليمك.",
      entityType: "pantry_delivery",
      entityId: String(deliveryId),
      link: "/dashboard/freelancer/pantry",
      priority: "high",
    });

    const files = await listFilesForDelivery(deliveryId);
    const { rows } = await pantryQuery(
      `SELECT d.*, r.title AS request_title, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
       FROM pantry_deliveries d
       JOIN pantry_requests r ON r.id = d.pantry_request_id
       JOIN users u ON u.id = d.freelancer_id
       WHERE d.id = $1`,
      [deliveryId],
    );
    return mapDelivery(rows[0], files);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/* ---------- Freelancer ---------- */

async function listOpenRequestsForFreelancer() {
  const { rows } = await pantryQuery(
    `SELECT r.*,
            (SELECT COUNT(*)::int FROM pantry_bids b WHERE b.pantry_request_id = r.id) AS bids_count
     FROM pantry_requests r
     WHERE r.status = 'open_for_bids'
     ORDER BY r.created_at DESC
     LIMIT 100`,
  );
  return rows.map((row) => mapRequest(row));
}

async function getFreelancerRequest(id, freelancerId) {
  const data = await getRequestById(id, { includeBids: false });
  if (!data) return null;
  const { request } = data;
  const isAssigned = Number(request.assignedFreelancerId) === Number(freelancerId);
  const isOpen = request.status === "open_for_bids";
  if (!isOpen && !isAssigned) {
    throw httpError(403, "غير مصرح بعرض هذا الطلب.", "FORBIDDEN");
  }
  const myBidRes = await pantryQuery(
    `SELECT * FROM pantry_bids WHERE pantry_request_id = $1 AND freelancer_id = $2 LIMIT 1`,
    [id, freelancerId],
  );
  return {
    request,
    myBid: myBidRes.rows.length ? mapBid(myBidRes.rows[0]) : null,
  };
}

async function submitBid(requestId, freelancerId, payload) {
  const data = await getRequestById(requestId);
  if (!data) throw httpError(404, "طلب بيت المونة غير موجود.", "NOT_FOUND");
  if (!canFreelancerBid(data.request.status)) {
    throw httpError(409, "الطلب غير مفتوح للعروض.", "INVALID_STATUS");
  }
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError(400, "مبلغ العرض غير صالح.", "VALIDATION_ERROR");
  }

  try {
    const { rows } = await pantryQuery(
      `INSERT INTO pantry_bids (
         pantry_request_id, freelancer_id, amount, duration_days, message, status
       ) VALUES ($1,$2,$3,$4,$5,'pending')
       RETURNING *`,
      [
        requestId,
        freelancerId,
        amount,
        payload.durationDays || null,
        payload.message || null,
      ],
    );
    const bid = mapBid(rows[0]);
    if (data.request.createdByAdminId) {
      await notifySafe({
        recipientUserId: data.request.createdByAdminId,
        recipientRole: "admin",
        actorUserId: freelancerId,
        type: "pantry_bid_submitted",
        title: "عرض جديد في بيت المونة",
        message: `تم تقديم عرض على: ${data.request.title}`,
        entityType: "pantry_request",
        entityId: String(requestId),
        link: "/dashboard/super-admin/pantry",
        priority: "normal",
      });
    }
    return bid;
  } catch (err) {
    if (err && err.code === "23505") {
      throw httpError(409, "لقد قدّمت عرضاً مسبقاً على هذا الطلب.", "DUPLICATE_BID");
    }
    throw err;
  }
}

async function listMyWork(freelancerId) {
  const { rows } = await pantryQuery(
    `SELECT r.*,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS assigned_freelancer_name,
            (SELECT COUNT(*)::int FROM pantry_bids b WHERE b.pantry_request_id = r.id) AS bids_count
     FROM pantry_requests r
     LEFT JOIN users u ON u.id = r.assigned_freelancer_id
     WHERE r.assigned_freelancer_id = $1
        OR EXISTS (
          SELECT 1 FROM pantry_bids b
          WHERE b.pantry_request_id = r.id AND b.freelancer_id = $1
        )
     ORDER BY r.updated_at DESC
     LIMIT 100`,
    [freelancerId],
  );
  return rows.map((row) => mapRequest(row));
}

async function submitDelivery(requestId, freelancerId, payload) {
  const data = await getRequestById(requestId);
  if (!data) throw httpError(404, "طلب بيت المونة غير موجود.", "NOT_FOUND");
  if (!canFreelancerDeliver(data.request, freelancerId)) {
    throw httpError(403, "فقط الفريلانسر المعيَّن يمكنه التسليم.", "FORBIDDEN");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO pantry_deliveries (pantry_request_id, freelancer_id, message, status)
       VALUES ($1,$2,$3,'submitted')
       RETURNING *`,
      [requestId, freelancerId, payload.message || null],
    );
    const delivery = rows[0];
    const files = Array.isArray(payload.files) ? payload.files : [];
    for (const file of files) {
      const url = String(file.fileUrl || file.url || "").trim();
      const name = String(file.fileName || file.name || "file").trim();
      if (!url) continue;
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO pantry_delivery_files (delivery_id, file_url, file_name, mime_type, size_bytes)
         VALUES ($1,$2,$3,$4,$5)`,
        [delivery.id, url, name, file.mimeType || null, file.sizeBytes || file.size || null],
      );
    }
    await client.query(
      `UPDATE pantry_requests SET status = 'submitted', updated_at = NOW() WHERE id = $1`,
      [requestId],
    );
    await client.query("COMMIT");

    if (data.request.createdByAdminId) {
      await notifySafe({
        recipientUserId: data.request.createdByAdminId,
        recipientRole: "admin",
        actorUserId: freelancerId,
        type: "pantry_delivery_submitted",
        title: "تسليم جديد في بيت المونة",
        message: `تم تسليم عمل على: ${data.request.title}`,
        entityType: "pantry_delivery",
        entityId: String(delivery.id),
        link: "/dashboard/super-admin/pantry",
        priority: "high",
      });
    }

    const fileRows = await listFilesForDelivery(delivery.id);
    return mapDelivery(
      {
        ...delivery,
        request_title: data.request.title,
      },
      fileRows,
    );
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getStats,
  listAdminRequests,
  getRequestById,
  createRequest,
  updateRequest,
  publishRequest,
  listBidsForRequest,
  acceptBid,
  rejectBid,
  listDeliveries,
  approveDelivery,
  requestRevision,
  listOpenRequestsForFreelancer,
  getFreelancerRequest,
  submitBid,
  listMyWork,
  submitDelivery,
  mapRequest,
  mapBid,
  mapDelivery,
};

