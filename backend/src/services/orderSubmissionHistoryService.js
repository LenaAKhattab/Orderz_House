const { pool } = require("../config/db");
const { isStaffRole } = require("../utils/orderViewerSanitize");

function decodeName(name) {
  const s = String(name ?? "");
  if (!s) return s;
  try {
    const decoded = Buffer.from(s, "latin1").toString("utf8");
    if (/[\u0600-\u06FF]/.test(decoded) && !/[\u0600-\u06FF]/.test(s)) return decoded;
  } catch (_) {
    /* ignore */
  }
  return s;
}

function requestedByRoleLabelAr(role) {
  const r = String(role || "").trim();
  if (r === "client") return "العميل";
  if (r === "admin") return "الإدارة";
  if (r === "super_admin") return "المشرف العام";
  return "—";
}

/**
 * @param {import("pg").Pool|import("pg").PoolClient} runner
 * @param {number} orderId
 */
async function getNextSubmissionNumber(runner, orderId) {
  const { rows } = await runner.query(
    `SELECT COALESCE(MAX(submission_number), 0)::int + 1 AS n FROM order_submissions WHERE order_id = $1`,
    [Number(orderId)],
  );
  return Number(rows[0]?.n) || 1;
}

/**
 * Mark all current submissions as superseded (before inserting a new delivery).
 * @param {import("pg").PoolClient} client
 */
async function supersedeCurrentSubmissions(client, orderId) {
  await client.query(
    `UPDATE order_submissions
       SET status = 'superseded', is_current = FALSE
     WHERE order_id = $1 AND is_current = TRUE`,
    [Number(orderId)],
  );
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<{ id: number, submissionNumber: number }>}
 */
async function insertSubmissionRow(client, { orderId, freelancerUserId, message = null }) {
  const nextNum = await getNextSubmissionNumber(client, orderId);
  const { rows } = await client.query(
    `INSERT INTO order_submissions (order_id, freelancer_user_id, submission_number, message, status, is_current, submitted_at)
     VALUES ($1, $2, $3, $4, 'submitted', TRUE, NOW())
     RETURNING id, submission_number`,
    [Number(orderId), Number(freelancerUserId), nextNum, message != null ? String(message).trim() || null : null],
  );
  return { id: Number(rows[0].id), submissionNumber: Number(rows[0].submission_number) };
}

/**
 * @param {import("pg").PoolClient} client
 */
async function markSubmissionRevisionRequested(client, submissionId) {
  await client.query(`UPDATE order_submissions SET status = 'revision_requested' WHERE id = $1`, [Number(submissionId)]);
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<number|null>}
 */
async function getCurrentSubmissionId(client, orderId) {
  const { rows } = await client.query(
    `SELECT id FROM order_submissions WHERE order_id = $1 AND is_current = TRUE ORDER BY submission_number DESC LIMIT 1`,
    [Number(orderId)],
  );
  return rows[0]?.id != null ? Number(rows[0].id) : null;
}

/**
 * @param {import("pg").PoolClient} client
 * @returns {Promise<{ id: number }|null>}
 */
async function insertRevisionRequestRow(client, { orderId, submissionId, requestedByUserId, requestedByRole, note }) {
  const noteText = String(note || "").trim();
  if (!noteText) return null;
  const { rows } = await client.query(
    `INSERT INTO order_revision_requests (order_id, submission_id, requested_by_user_id, requested_by_role, note, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id`,
    [
      Number(orderId),
      Number(submissionId),
      requestedByUserId != null ? Number(requestedByUserId) : null,
      String(requestedByRole || "client"),
      noteText,
    ],
  );
  return { id: Number(rows[0].id) };
}

/**
 * @param {import("pg").PoolClient} client
 */
async function acceptCurrentSubmission(client, orderId) {
  await client.query(
    `UPDATE order_submissions
       SET status = 'accepted', is_current = TRUE
     WHERE order_id = $1 AND is_current = TRUE`,
    [Number(orderId)],
  );
}

/**
 * Load submission timeline + shape for API (role-aware).
 * @param {string|number} orderId
 * @param {{ viewerRole?: string|null }} opts
 */
async function enrichOrderWithSubmissionHistory(order, opts = {}) {
  if (!order || order.id == null) return order;
  const viewerRole = String(opts.viewerRole || "").trim();
  const staff = isStaffRole(viewerRole);
  const oid = Number(order.id);
  const runner = pool;

  const { rows: subRows } = await runner.query(
    `SELECT id, order_id, freelancer_user_id, submission_number, message, status, is_current, submitted_at, created_at
     FROM order_submissions
     WHERE order_id = $1
     ORDER BY submission_number ASC, id ASC`,
    [oid],
  );

  if (!subRows.length) {
    order.submissionHistory = { submissions: [] };
    return order;
  }

  const subIds = subRows.map((r) => Number(r.id));
  const { rows: revRows } = await runner.query(
    `SELECT r.id, r.order_id, r.submission_id, r.requested_by_user_id, r.requested_by_role, r.note, r.created_at,
            u.first_name, u.father_name, u.family_name, u.account_id
     FROM order_revision_requests r
     LEFT JOIN users u ON u.id = r.requested_by_user_id
     WHERE r.submission_id = ANY($1::bigint[])
     ORDER BY r.created_at ASC, r.id ASC`,
    [subIds],
  );

  const { rows: fileRows } = await runner.query(
    `SELECT id, order_id, submission_id, revision_id, original_name, mime_type, size_bytes, uploaded_at, purpose, secure_url, file_url, public_id
     FROM order_files
     WHERE order_id = $1 AND (purpose = 'delivery' OR purpose = 'revision_request')
     ORDER BY id ASC`,
    [oid],
  );

  const revBySub = new Map();
  const revById = new Map();
  for (const r of revRows) {
    const sid = Number(r.submission_id);
    if (!revBySub.has(sid)) revBySub.set(sid, []);
    const displayName = [r.first_name, r.father_name, r.family_name].filter(Boolean).join(" ").trim() || null;
    const entry = {
      id: String(r.id),
      note: r.note,
      requestedByRole: r.requested_by_role,
      requestedByRoleLabelAr: requestedByRoleLabelAr(r.requested_by_role),
      createdAt: r.created_at,
      files: [],
    };
    if (staff) {
      entry.adminMetadata = {
        requestedByUserId: r.requested_by_user_id != null ? String(r.requested_by_user_id) : null,
        requestedByAccountId: r.account_id != null ? String(r.account_id) : null,
        requestedByDisplayName: displayName,
      };
    }
    revBySub.get(sid).push(entry);
    revById.set(Number(r.id), entry);
  }

  for (const f of fileRows) {
    if (String(f.purpose) === "revision_request" && f.revision_id != null) {
      const rev = revById.get(Number(f.revision_id));
      if (rev) rev.files.push(mapFileRow(f, staff));
    }
  }

  const orderCompleted = String(order.orderStatus || "") === "completed";

  const submissions = subRows.map((s) => {
    const sid = Number(s.id);
    const revisionRequests = revBySub.get(sid) || [];
    const deliveryFiles = fileRows
      .filter((f) => String(f.purpose) === "delivery" && f.submission_id != null && Number(f.submission_id) === sid)
      .map((f) => mapFileRow(f, staff));

    const isCurrent = Boolean(s.is_current);
    const isAccepted = String(s.status) === "accepted";
    const isFinal = isAccepted && orderCompleted && isCurrent;

    let titleBadgeAr = "تسليم سابق";
    if (isFinal) titleBadgeAr = "التسليم النهائي";
    else if (isCurrent && !isAccepted) titleBadgeAr = "التسليم الحالي";
    else if (isCurrent && isAccepted) titleBadgeAr = "التسليم النهائي";

    const statusBadgeAr = submissionStatusBadgeAr(String(s.status));

    const out = {
      id: String(s.id),
      submissionNumber: Number(s.submission_number),
      status: s.status,
      statusBadgeAr,
      isCurrent,
      isFinal,
      titleBadgeAr,
      submittedAt: s.submitted_at,
      message: s.message || null,
      files: deliveryFiles,
      revisionRequests,
    };

    if (staff) {
      out.adminMetadata = {
        freelancerUserId: String(s.freelancer_user_id),
      };
    }

    return out;
  });

  /** Latest first for UX (newest submission_number first) */
  submissions.sort((a, b) => Number(b.submissionNumber) - Number(a.submissionNumber));

  order.submissionHistory = { submissions };
  return order;
}

function mapFileRow(r, staff) {
  const originalName = decodeName(r.original_name) || r.original_name || "file";
  const base = {
    id: String(r.id),
    originalName,
    mimeType: r.mime_type || null,
    sizeBytes: Number(r.size_bytes || 0),
    uploadedAt: r.uploaded_at || null,
    purpose: r.purpose || "delivery",
  };
  if (staff) {
    base.adminMetadata = {
      publicId: r.public_id || null,
    };
  }
  return base;
}

function submissionStatusBadgeAr(status) {
  const s = String(status || "");
  if (s === "submitted") return "تم التسليم";
  if (s === "revision_requested") return "طلب تعديلات";
  if (s === "accepted") return "مقبول";
  if (s === "superseded") return "سابق";
  return s || "—";
}

module.exports = {
  enrichOrderWithSubmissionHistory,
  supersedeCurrentSubmissions,
  insertSubmissionRow,
  markSubmissionRevisionRequested,
  getCurrentSubmissionId,
  insertRevisionRequestRow,
  acceptCurrentSubmission,
  getNextSubmissionNumber,
  requestedByRoleLabelAr,
};
