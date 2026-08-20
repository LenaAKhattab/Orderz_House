/**
 * Phase A11 — Freelancer account activation KYC review service.
 * Updates freelancer_subscriptions.activation_status only; no Bid/Stripe/orders/Bildazo.
 */

const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  ACCOUNT_ACTIVATION_KYC_TERMS_VERSION,
  ACCOUNT_ACTIVATION_KYC_TERMS_SNAPSHOT_AR,
  ACCOUNT_ACTIVATION_KYC_ALLOWED_MIME,
  ACCOUNT_ACTIVATION_KYC_MAX_BYTES,
  ACCOUNT_ACTIVATION_KYC_ERROR_CODES,
} = require("../constants/freelancerAccountActivationKyc");
const { uploadKycIdBuffer } = require("./cloudinaryUploadService");
const { getCloudinary } = require("../config/cloudinary");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

let schemaReadyCache = null;

async function schemaReady(client = null) {
  if (schemaReadyCache === true) return true;
  const runner = client || pool;
  try {
    await runner.query(`SELECT 1 FROM freelancer_account_activation_requests LIMIT 1`);
    schemaReadyCache = true;
    return true;
  } catch (err) {
    if (isMissingSchema(err)) {
      schemaReadyCache = false;
      return false;
    }
    throw err;
  }
}

function clearSchemaCache() {
  schemaReadyCache = null;
}

function mapRequestRow(row, { forAdmin = false } = {}) {
  if (!row) return null;
  const base = {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    status: row.status,
    termsAcceptedAt: row.terms_accepted_at,
    termsVersion: row.terms_version,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at || null,
    rejectionReason: row.status === "rejected" ? row.rejection_reason || null : null,
    resubmissionCount: Number(row.resubmission_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasFrontImage: Boolean(row.id_front_file_key),
    hasBackImage: Boolean(row.id_back_file_key),
  };
  if (!forAdmin) return base;
  return {
    ...base,
    rejectionReason: row.rejection_reason || null,
    adminNotes: row.admin_notes || null,
    reviewedByUserId: row.reviewed_by_user_id != null ? String(row.reviewed_by_user_id) : null,
    idFrontOriginalName: row.id_front_original_name || null,
    idBackOriginalName: row.id_back_original_name || null,
    idFrontMimeType: row.id_front_mime_type || null,
    idBackMimeType: row.id_back_mime_type || null,
    idFrontSizeBytes: row.id_front_size_bytes != null ? Number(row.id_front_size_bytes) : null,
    idBackSizeBytes: row.id_back_size_bytes != null ? Number(row.id_back_size_bytes) : null,
    termsSnapshot: row.terms_snapshot || null,
  };
}

async function loadLatestRequest(runner, freelancerUserId) {
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_account_activation_requests
      WHERE freelancer_user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [Number(freelancerUserId)],
  );
  return rows[0] || null;
}

/**
 * A11.1 — Gate setting company_approved outside the KYC approve endpoint.
 * @returns {{ mode: 'kyc_approved'|'super_admin_override'|'skip', overrideReason?: string|null }}
 */
async function assertCompanyApprovalAllowed({
  freelancerUserId,
  actorRole = null,
  overrideReason = null,
  skipKycGate = false,
  client = null,
} = {}) {
  if (skipKycGate) {
    return { mode: "skip", overrideReason: null };
  }

  const ready = await schemaReady(client);
  const role = String(actorRole || "").toLowerCase();
  const reason = String(overrideReason || "").trim();

  if (ready) {
    const latest = await loadLatestRequest(client || pool, freelancerUserId);
    if (latest && String(latest.status) === "approved") {
      return { mode: "kyc_approved", overrideReason: null };
    }

    if (reason) {
      if (role !== "super_admin") {
        throw createAppError(
          "تجاوز مراجعة الهوية مسموح لمدير أعلى فقط مع سبب موثّق.",
          403,
          {
            exposeToClient: true,
            publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.OVERRIDE_FORBIDDEN,
          },
        );
      }
      return { mode: "super_admin_override", overrideReason: reason.slice(0, 2000) };
    }

    const status = latest ? String(latest.status) : null;
    if (status === "pending_review") {
      throw createAppError(
        "طلب تفعيل الهوية قيد المراجعة. استخدم صفحة طلبات تفعيل المستقلين.",
        409,
        {
          exposeToClient: true,
          publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FREELANCER_KYC_PENDING_REVIEW,
        },
      );
    }
    if (status === "rejected") {
      throw createAppError(
        "طلب تفعيل الهوية مرفوض. يجب إعادة الإرسال أو تجاوز من مدير أعلى بسبب موثّق.",
        409,
        {
          exposeToClient: true,
          publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FREELANCER_KYC_REJECTED,
        },
      );
    }
    throw createAppError(
      "تفعيل حساب المستقل يتطلب مراجعة الهوية (KYC) من المدير الأعلى.",
      409,
      {
        exposeToClient: true,
        publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FREELANCER_KYC_REQUIRED,
      },
    );
  }

  // Schema not ready: only Super Admin override is allowed (fail closed for staff).
  if (reason) {
    if (role !== "super_admin") {
      throw createAppError(
        "تجاوز مراجعة الهوية مسموح لمدير أعلى فقط مع سبب موثّق.",
        403,
        {
          exposeToClient: true,
          publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.OVERRIDE_FORBIDDEN,
        },
      );
    }
    return { mode: "super_admin_override", overrideReason: reason.slice(0, 2000) };
  }

  throw createAppError(
    "تفعيل حساب المستقل يتطلب مراجعة الهوية (KYC) من المدير الأعلى.",
    409,
    {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.FREELANCER_KYC_REQUIRED,
    },
  );
}


async function loadSubscriptionActivation(runner, freelancerUserId) {
  const { rows } = await runner.query(
    `SELECT id, activation_status, status, actual_start_date, expiry_date
       FROM freelancer_subscriptions
      WHERE freelancer_user_id = $1 AND is_current = TRUE
      ORDER BY id DESC
      LIMIT 1`,
    [Number(freelancerUserId)],
  );
  return rows[0] || null;
}

async function setSubscriptionActivationStatus(
  runner,
  { freelancerUserId, activationStatus, actorUserId = null },
) {
  await runner.query(
    `UPDATE freelancer_subscriptions
        SET activation_status = $2,
            updated_at = NOW()
      WHERE freelancer_user_id = $1
        AND is_current = TRUE`,
    [Number(freelancerUserId), String(activationStatus)],
  );
  if (activationStatus === "company_approved" && actorUserId) {
    await runner.query(
      `UPDATE freelancer_subscriptions
          SET company_activated_at = COALESCE(company_activated_at, NOW()),
              company_activated_by_user_id = COALESCE(company_activated_by_user_id, $2)
        WHERE freelancer_user_id = $1 AND is_current = TRUE`,
      [Number(freelancerUserId), Number(actorUserId)],
    );
  }
}

function assertImageFile(file, side) {
  const codes = ACCOUNT_ACTIVATION_KYC_ERROR_CODES;
  if (!file || !file.buffer) {
    throw createAppError(
      side === "front"
        ? "يرجى رفع صورة الهوية من الأمام."
        : "يرجى رفع صورة الهوية من الخلف.",
      400,
      {
        exposeToClient: true,
        publicCode: side === "front" ? codes.FRONT_REQUIRED : codes.BACK_REQUIRED,
      },
    );
  }
  const mime = String(file.mimetype || "");
  if (!ACCOUNT_ACTIVATION_KYC_ALLOWED_MIME.includes(mime)) {
    throw createAppError("يُسمح بصور JPEG أو PNG أو WebP فقط لوثيقة الهوية.", 400, {
      exposeToClient: true,
      publicCode: codes.INVALID_FILE_TYPE,
    });
  }
  if (Number(file.size || file.buffer.length || 0) > ACCOUNT_ACTIVATION_KYC_MAX_BYTES) {
    throw createAppError("حجم ملف الهوية يتجاوز الحد المسموح (5 ميغابايت).", 400, {
      exposeToClient: true,
      publicCode: codes.FILE_TOO_LARGE,
    });
  }
}

async function getFreelancerAccountActivationStatus(freelancerUserId) {
  const uid = Number(freelancerUserId);
  const ready = await schemaReady();
  const sub = await loadSubscriptionActivation(pool, uid);
  const activationStatus = String(sub?.activation_status || "").toLowerCase() || null;
  const subscriptionActive =
    String(sub?.status || "").toLowerCase() === "active"
    && Boolean(sub?.actual_start_date);

  if (!ready) {
    return {
      schemaReady: false,
      activationStatus,
      isCompanyApproved: activationStatus === "company_approved",
      isSubscriptionPeriodActive: subscriptionActive,
      request: null,
      canSubmit: activationStatus !== "company_approved",
      canResubmit: false,
      messageAr: "نظام مراجعة التفعيل غير جاهز بعد.",
    };
  }

  const latest = await loadLatestRequest(pool, uid);
  const mapped = mapRequestRow(latest, { forAdmin: false });
  const isApproved = activationStatus === "company_approved";
  const pending = mapped?.status === "pending_review";
  const rejected = mapped?.status === "rejected" || activationStatus === "company_rejected";
  const canSubmit = !isApproved && !pending;
  const canResubmit = !isApproved && !pending && (rejected || !mapped);

  let messageAr = "يرجى رفع صورة الهوية من الأمام والخلف لإرسال طلب التفعيل.";
  if (isApproved) messageAr = "تم تفعيل حسابك.";
  else if (pending) messageAr = "طلبك قيد المراجعة من قبل الإدارة.";
  else if (rejected) messageAr = "تم رفض طلب التفعيل. يمكنك إعادة الإرسال بعد تصحيح المطلوب.";

  return {
    schemaReady: true,
    activationStatus,
    isCompanyApproved: isApproved,
    isSubscriptionPeriodActive: subscriptionActive && isApproved,
    request: mapped,
    canSubmit,
    canResubmit,
    termsVersion: ACCOUNT_ACTIVATION_KYC_TERMS_VERSION,
    messageAr,
  };
}

async function submitFreelancerAccountActivationRequest({
  freelancerUserId,
  idFrontFile,
  idBackFile,
  termsAccepted,
  termsVersion = ACCOUNT_ACTIVATION_KYC_TERMS_VERSION,
} = {}) {
  const uid = Number(freelancerUserId);
  if (!(await schemaReady())) {
    throw createAppError("Account activation review schema is not ready.", 503, {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.SCHEMA_NOT_READY,
    });
  }

  assertImageFile(idFrontFile, "front");
  assertImageFile(idBackFile, "back");

  if (!termsAccepted) {
    throw createAppError("يجب الموافقة على شروط تفعيل الحساب.", 400, {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.TERMS_REQUIRED,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const sub = await loadSubscriptionActivation(client, uid);
    if (String(sub?.activation_status || "").toLowerCase() === "company_approved") {
      throw createAppError("حسابك مفعّل مسبقًا.", 409, {
        exposeToClient: true,
        publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.ALREADY_APPROVED,
      });
    }

    const { rows: pendingRows } = await client.query(
      `SELECT id FROM freelancer_account_activation_requests
        WHERE freelancer_user_id = $1 AND status = 'pending_review'
        LIMIT 1
        FOR UPDATE`,
      [uid],
    );
    if (pendingRows[0]) {
      throw createAppError("لديك طلب تفعيل قيد المراجعة بالفعل.", 409, {
        exposeToClient: true,
        publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.PENDING_EXISTS,
      });
    }

    const latest = await loadLatestRequest(client, uid);
    const resubmissionCount =
      latest && String(latest.status) === "rejected"
        ? Number(latest.resubmission_count || 0) + 1
        : Number(latest?.resubmission_count || 0);

    const front = await uploadKycIdBuffer({
      buffer: idFrontFile.buffer,
      mimetype: idFrontFile.mimetype,
      originalname: idFrontFile.originalname,
      userId: uid,
      side: "front",
    });
    const back = await uploadKycIdBuffer({
      buffer: idBackFile.buffer,
      mimetype: idBackFile.mimetype,
      originalname: idBackFile.originalname,
      userId: uid,
      side: "back",
    });

    const now = new Date();
    const version = String(termsVersion || ACCOUNT_ACTIVATION_KYC_TERMS_VERSION).slice(0, 64);
    const { rows } = await client.query(
      `INSERT INTO freelancer_account_activation_requests (
         freelancer_user_id, status,
         id_front_file_key, id_back_file_key,
         id_front_original_name, id_back_original_name,
         id_front_mime_type, id_back_mime_type,
         id_front_size_bytes, id_back_size_bytes,
         terms_accepted_at, terms_version, terms_snapshot,
         submitted_at, resubmission_count, metadata
       ) VALUES (
         $1, 'pending_review',
         $2, $3, $4, $5, $6, $7, $8, $9,
         $10::timestamptz, $11, $12,
         $10::timestamptz, $13, $14::jsonb
       )
       RETURNING *`,
      [
        uid,
        front.fileKey,
        back.fileKey,
        front.originalname || null,
        back.originalname || null,
        front.mimetype || null,
        back.mimetype || null,
        front.bytes || null,
        back.bytes || null,
        now,
        version,
        ACCOUNT_ACTIVATION_KYC_TERMS_SNAPSHOT_AR,
        resubmissionCount,
        JSON.stringify({
          frontStorage: front.storage,
          backStorage: back.storage,
        }),
      ],
    );

    await setSubscriptionActivationStatus(client, {
      freelancerUserId: uid,
      activationStatus: "company_pending",
    });

    await client.query("COMMIT");
    return {
      request: mapRequestRow(rows[0], { forAdmin: false }),
      activationStatus: "company_pending",
      messageAr: "تم استلام طلب تفعيل حسابك وسيتم مراجعته من قبل الإدارة.",
    };
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

async function listActivationRequestsForAdmin({
  status = null,
  search = null,
  dateFrom = null,
  dateTo = null,
  page = 1,
  limit = 20,
} = {}) {
  if (!(await schemaReady())) {
    return { schemaReady: false, items: [], total: 0, page: 1, limit: 20 };
  }
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const offset = (pg - 1) * lim;
  const where = [];
  const params = [];

  if (status) {
    params.push(String(status));
    where.push(`r.status = $${params.length}`);
  }
  if (dateFrom) {
    params.push(new Date(dateFrom));
    where.push(`r.submitted_at >= $${params.length}::timestamptz`);
  }
  if (dateTo) {
    params.push(new Date(dateTo));
    where.push(`r.submitted_at <= $${params.length}::timestamptz`);
  }
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where.push(
      `(u.email ILIKE $${params.length}
        OR CONCAT_WS(' ', u.first_name, u.father_name, u.family_name) ILIKE $${params.length})`,
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM freelancer_account_activation_requests r
       JOIN users u ON u.id = r.freelancer_user_id
      ${whereSql}`,
    params,
  );
  params.push(lim, offset);
  const { rows } = await pool.query(
    `SELECT r.*,
            u.email AS freelancer_email,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name
       FROM freelancer_account_activation_requests r
       JOIN users u ON u.id = r.freelancer_user_id
      ${whereSql}
      ORDER BY
        CASE r.status WHEN 'pending_review' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
        r.submitted_at DESC,
        r.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    schemaReady: true,
    items: rows.map((row) => ({
      ...mapRequestRow(row, { forAdmin: true }),
      freelancerEmail: row.freelancer_email || null,
      freelancerName: row.freelancer_name || null,
    })),
    total: Number(countRes.rows[0]?.c || 0),
    page: pg,
    limit: lim,
  };
}

async function getActivationRequestForAdmin(requestId) {
  if (!(await schemaReady())) {
    throw createAppError("Account activation review schema is not ready.", 503, {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.SCHEMA_NOT_READY,
    });
  }
  const id = Number(requestId);
  const { rows } = await pool.query(
    `SELECT r.*,
            u.email AS freelancer_email,
            NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS freelancer_name,
            u.phone AS freelancer_phone
       FROM freelancer_account_activation_requests r
       JOIN users u ON u.id = r.freelancer_user_id
      WHERE r.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    throw createAppError("Activation request not found.", 404, {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.REQUEST_NOT_FOUND,
    });
  }
  return {
    request: mapRequestRow(row, { forAdmin: true }),
    freelancer: {
      id: String(row.freelancer_user_id),
      email: row.freelancer_email || null,
      name: row.freelancer_name || null,
      phone: row.freelancer_phone || null,
    },
    files: {
      front: `/api/super-admin/freelancer-activation-requests/${id}/files/front`,
      back: `/api/super-admin/freelancer-activation-requests/${id}/files/back`,
    },
  };
}

async function loadRequestForUpdate(client, requestId) {
  const { rows } = await client.query(
    `SELECT * FROM freelancer_account_activation_requests WHERE id = $1 FOR UPDATE`,
    [Number(requestId)],
  );
  return rows[0] || null;
}

async function approveActivationRequest({ requestId, actorUserId } = {}) {
  const actor = Number(actorUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await loadRequestForUpdate(client, requestId);
    if (!row) {
      throw createAppError("Activation request not found.", 404, {
        exposeToClient: true,
        publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.REQUEST_NOT_FOUND,
      });
    }
    if (row.status === "approved") {
      await client.query("COMMIT");
      return { request: mapRequestRow(row, { forAdmin: true }), alreadyApproved: true };
    }
    if (row.status !== "pending_review") {
      throw createAppError("Only pending requests can be approved.", 409, {
        exposeToClient: true,
        publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.NOT_PENDING,
      });
    }

    const { rows: updated } = await client.query(
      `UPDATE freelancer_account_activation_requests
          SET status = 'approved',
              reviewed_by_user_id = $2,
              reviewed_at = NOW(),
              rejection_reason = NULL,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [row.id, actor],
    );

    const subscriptionsService = require("./subscriptionsService");
    const activation = await subscriptionsService.activateAccountAfterKycApproval({
      freelancerUserId: row.freelancer_user_id,
      actorUserId: actor,
      client,
    });

    await client.query("COMMIT");
    return {
      request: mapRequestRow(updated[0], { forAdmin: true }),
      alreadyApproved: false,
      subscription: activation.subscription,
      marketplace: activation.marketplace,
    };
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

async function rejectActivationRequest({
  requestId,
  actorUserId,
  rejectionReason,
  adminNotes = null,
} = {}) {
  const reason = String(rejectionReason || "").trim();
  if (!reason) {
    throw createAppError("سبب الرفض مطلوب.", 400, {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.REJECTION_REASON_REQUIRED,
    });
  }
  const actor = Number(actorUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = await loadRequestForUpdate(client, requestId);
    if (!row) {
      throw createAppError("Activation request not found.", 404, {
        exposeToClient: true,
        publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.REQUEST_NOT_FOUND,
      });
    }
    if (row.status === "rejected") {
      await client.query("COMMIT");
      return { request: mapRequestRow(row, { forAdmin: true }), alreadyRejected: true };
    }
    if (row.status !== "pending_review") {
      throw createAppError("Only pending requests can be rejected.", 409, {
        exposeToClient: true,
        publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.NOT_PENDING,
      });
    }

    const { rows: updated } = await client.query(
      `UPDATE freelancer_account_activation_requests
          SET status = 'rejected',
              reviewed_by_user_id = $2,
              reviewed_at = NOW(),
              rejection_reason = $3,
              admin_notes = $4,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [row.id, actor, reason.slice(0, 2000), adminNotes ? String(adminNotes).slice(0, 2000) : null],
    );

    await setSubscriptionActivationStatus(client, {
      freelancerUserId: row.freelancer_user_id,
      activationStatus: "company_rejected",
      actorUserId: actor,
    });

    await client.query("COMMIT");
    return {
      request: mapRequestRow(updated[0], { forAdmin: true }),
      alreadyRejected: false,
    };
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

async function resolveFileAsset(fileKey) {
  const key = String(fileKey || "");
  if (key.startsWith("local:")) {
    const rel = key.slice("local:".length).replace(/^[/\\]+/, "");
    const abs = path.join(__dirname, "..", "..", "uploads", ...rel.split("/"));
    const uploadsRoot = path.join(__dirname, "..", "..", "uploads");
    if (!abs.startsWith(uploadsRoot)) {
      throw createAppError("Invalid file key.", 400, { exposeToClient: false });
    }
    await fsp.access(abs, fs.constants.R_OK);
    return { kind: "local", absPath: abs };
  }
  if (key.startsWith("cloudinary:")) {
    const publicId = key.slice("cloudinary:".length);
    const cloudinary = getCloudinary();
    const url = cloudinary.url(publicId, {
      resource_type: "image",
      type: "authenticated",
      sign_url: true,
      secure: true,
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    return { kind: "signed_url", url, publicId };
  }
  throw createAppError("Unsupported file storage key.", 500, { exposeToClient: false });
}

async function prepareAdminKycFileDownload({ requestId, side }) {
  if (!(await schemaReady())) {
    throw createAppError("Account activation review schema is not ready.", 503, {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.SCHEMA_NOT_READY,
    });
  }
  const { rows } = await pool.query(
    `SELECT * FROM freelancer_account_activation_requests WHERE id = $1`,
    [Number(requestId)],
  );
  const row = rows[0];
  if (!row) {
    throw createAppError("Activation request not found.", 404, {
      exposeToClient: true,
      publicCode: ACCOUNT_ACTIVATION_KYC_ERROR_CODES.REQUEST_NOT_FOUND,
    });
  }
  const fileKey = side === "back" ? row.id_back_file_key : row.id_front_file_key;
  const mime =
    side === "back" ? row.id_back_mime_type : row.id_front_mime_type;
  const originalName =
    side === "back" ? row.id_back_original_name : row.id_front_original_name;
  const asset = await resolveFileAsset(fileKey);
  return {
    ...asset,
    mimeType: mime || "image/jpeg",
    originalName: originalName || `${side}.jpg`,
  };
}

module.exports = {
  schemaReady,
  clearSchemaCache,
  mapRequestRow,
  getFreelancerAccountActivationStatus,
  submitFreelancerAccountActivationRequest,
  listActivationRequestsForAdmin,
  getActivationRequestForAdmin,
  approveActivationRequest,
  rejectActivationRequest,
  prepareAdminKycFileDownload,
  assertCompanyApprovalAllowed,
};
