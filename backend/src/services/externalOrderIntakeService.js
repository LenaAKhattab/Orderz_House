/**
 * External (WhatsApp) order intake.
 *
 * Flow: freelancer submits ONLY an external Order ID → `pending_review` intake (no order, no money)
 * → Admin / Super Admin sets the price and approves → the canonical internal order is created
 * ATOMICALLY (same transaction) through ordersService.createInternalOrderInTransaction, already
 * assigned to the submitting freelancer and never published to the marketplace pool.
 * From then on the EXISTING order workflow (delivery, revision, admin review, completion,
 * financial claims) applies unchanged. This module never touches wallets, ledgers or earnings.
 */

const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");
const ordersService = require("./ordersService");
const notificationService = require("./notificationService");

const SOURCE_WHATSAPP = "whatsapp";
const PAGE_SIZE = 15;
const MAX_EXTERNAL_ID_LENGTH = 64;
const DEFAULT_CATEGORY_SLUG = "special-requests";
const DEFAULT_DURATION_VALUE = 7;
const DEFAULT_DURATION_UNIT = "days";
const MAX_DURATION = Object.freeze({ days: 365, hours: 720 });
const MAX_INTERNAL_NOTE_LENGTH = 1000;

const INTAKE_STATUSES = Object.freeze({
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
});
const LIVE_STATUSES = [INTAKE_STATUSES.PENDING_REVIEW, INTAKE_STATUSES.APPROVED];
const REJECTION_REASON_CODES = Object.freeze([
  "invalid_id",
  "duplicate",
  "not_assigned_to_you",
  "cancelled_externally",
  "other",
]);

const ERROR_CODES = Object.freeze({
  INVALID_ID: "EXTERNAL_ORDER_ID_INVALID",
  ALREADY_REGISTERED: "EXTERNAL_ORDER_ALREADY_REGISTERED",
  ALREADY_PROCESSED: "EXTERNAL_ORDER_ALREADY_PROCESSED",
  PRICE_INVALID: "EXTERNAL_ORDER_PRICE_INVALID",
  NOT_FOUND: "EXTERNAL_ORDER_NOT_FOUND",
  REJECTION_REASON_INVALID: "EXTERNAL_ORDER_REJECTION_REASON_INVALID",
  FREELANCER_NOT_ELIGIBLE: "EXTERNAL_ORDER_FREELANCER_NOT_ELIGIBLE",
  DETAILS_INVALID: "EXTERNAL_ORDER_DETAILS_INVALID",
});

function intakeError(statusCode, code, messageAr, meta) {
  const err = createPublicApiError(messageAr, statusCode, code);
  if (meta) err.meta = meta;
  return err;
}

// ---------------------------------------------------------------------------
// External ID normalization
// ---------------------------------------------------------------------------

const FORMAT_CHARS_RE = /\p{Cf}/gu; // zero-width, bidi marks/isolates, BOM, soft hyphen, ALM …
const NORMALIZED_ID_RE = /^[A-Z0-9][A-Z0-9._\/#-]{0,63}$/;

/** Arabic-Indic (U+0660–0669) and Extended Arabic-Indic (U+06F0–06F9) digits → ASCII. */
function asciiDigits(value) {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += ch;
  }
  return out;
}

/**
 * Returns `{ display, normalized }` or `null` when the value is not an acceptable external ID.
 * - NFKC (folds full-width / compatibility forms), invisible format characters removed
 *   (copy/paste from WhatsApp often carries RTL marks), Arabic digits → ASCII, trimmed,
 *   one leading "#" removed ("#12345" → "12345").
 * - Allowed: ASCII letters, digits and . _ / # - (must start with a letter or digit), ≤ 64 chars.
 *   Everything else (spaces inside, HTML, quotes, non-Latin letters, control chars) is rejected.
 * - `normalized` = upper-case `display` (duplicate key); `display` keeps the visible form.
 */
function normalizeExternalOrderId(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let value = String(raw);
  if (value.length > 256) return null;
  value = value.normalize("NFKC").replace(FORMAT_CHARS_RE, "");
  value = asciiDigits(value).trim();
  if (value.startsWith("#")) value = value.slice(1).trim();
  if (!value || value.length > MAX_EXTERNAL_ID_LENGTH) return null;
  const normalized = value.toUpperCase();
  if (!NORMALIZED_ID_RE.test(normalized)) return null;
  return { display: value, normalized };
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------

const PRICE_RE = /^(\d{1,6})(?:\.(\d{1,2}))?$/;

/**
 * Validates an Admin-entered JOD price without floating-point arithmetic.
 * Same precision as orders.budget (NUMERIC(12,2)); upper sanity bound 999,999.99 JOD.
 * Returns the canonical decimal string (e.g. "12.50") or throws EXTERNAL_ORDER_PRICE_INVALID.
 */
function parseApprovalPrice(raw) {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  const m = PRICE_RE.exec(text);
  if (!m) {
    throw intakeError(400, ERROR_CODES.PRICE_INVALID, "السعر غير صالح. أدخل مبلغًا أكبر من صفر بحد أقصى منزلتين عشريتين.");
  }
  const whole = m[1].replace(/^0+(?=\d)/, "");
  const fraction = (m[2] || "").padEnd(2, "0");
  if (/^0+$/.test(whole) && /^0+$/.test(fraction)) {
    throw intakeError(400, ERROR_CODES.PRICE_INVALID, "السعر يجب أن يكون أكبر من صفر.");
  }
  return `${whole}.${fraction}`;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

/** Freelancer-facing shape: no reviewer, no internal note, no audit data. */
function mapIntakeForFreelancer(row) {
  const approved = row.status === INTAKE_STATUSES.APPROVED;
  const rejected = row.status === INTAKE_STATUSES.REJECTED;
  const orderVisible = approved && row.order_id != null;
  return {
    id: String(row.id),
    externalOrderId: row.external_order_id,
    source: row.source,
    status: row.status,
    submittedAt: iso(row.submitted_at),
    reviewedAt: approved || rejected ? iso(row.reviewed_at) : null,
    price: approved && row.approved_price != null ? String(row.approved_price) : null,
    currency: approved ? row.currency_code : null,
    orderId: orderVisible ? String(row.order_id) : null,
    orderCode: orderVisible ? row.order_code || null : null,
    orderStatus: orderVisible ? row.order_status || null : null,
    rejectionReasonCode: rejected ? row.rejection_reason_code : null,
  };
}

function freelancerDisplayName(row) {
  return [row.fl_first_name, row.fl_father_name, row.fl_family_name]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
}

function mapIntakeForAdmin(row) {
  return {
    id: String(row.id),
    externalOrderId: row.external_order_id,
    externalOrderIdNormalized: row.external_order_id_normalized,
    source: row.source,
    status: row.status,
    submittedAt: iso(row.submitted_at),
    reviewedAt: iso(row.reviewed_at),
    price: row.approved_price != null ? String(row.approved_price) : null,
    currency: row.currency_code,
    rejectionReasonCode: row.rejection_reason_code || null,
    internalNote: row.internal_note || null,
    freelancer: {
      id: String(row.freelancer_user_id),
      name: freelancerDisplayName(row) || null,
      accountId: row.fl_account_id != null ? String(row.fl_account_id) : null,
      email: row.fl_email || null,
    },
    reviewer: row.reviewed_by_user_id
      ? {
          id: String(row.reviewed_by_user_id),
          role: row.reviewed_by_role || null,
          name:
            [row.rv_first_name, row.rv_family_name]
              .map((x) => String(x || "").trim())
              .filter(Boolean)
              .join(" ") || null,
        }
      : null,
    order: row.order_id
      ? {
          id: String(row.order_id),
          orderCode: row.order_code || null,
          status: row.order_status || null,
          budget: row.order_budget != null ? String(row.order_budget) : null,
        }
      : null,
  };
}

const ADMIN_SELECT = `
  SELECT i.*,
         fl.first_name AS fl_first_name, fl.father_name AS fl_father_name,
         fl.family_name AS fl_family_name, fl.account_id AS fl_account_id, fl.email AS fl_email,
         rv.first_name AS rv_first_name, rv.family_name AS rv_family_name,
         o.id AS order_id, o.order_code, o.order_status, o.budget AS order_budget
    FROM external_order_intakes i
    JOIN users fl ON fl.id = i.freelancer_user_id
    LEFT JOIN users rv ON rv.id = i.reviewed_by_user_id
    LEFT JOIN orders o ON o.id = i.approved_order_id`;

// ---------------------------------------------------------------------------
// Freelancer API
// ---------------------------------------------------------------------------

async function findLiveIntakeByNormalized(normalized, runner = pool) {
  const { rows } = await runner.query(
    `SELECT i.*, o.id AS order_id, o.order_code, o.order_status
       FROM external_order_intakes i
       LEFT JOIN orders o ON o.id = i.approved_order_id AND o.assigned_freelancer_id = i.freelancer_user_id
      WHERE i.external_order_id_normalized = $1 AND i.status = ANY($2::text[])
      LIMIT 1`,
    [normalized, LIVE_STATUSES],
  );
  return rows[0] || null;
}

/**
 * Freelancer submits an external Order ID. `freelancerUserId` comes ONLY from the authenticated
 * identity. Idempotent for the same freelancer (double click / retry → the existing intake);
 * a live intake owned by anyone else → generic 409 that reveals nothing about it.
 *
 * @returns {Promise<{ intake: object, created: boolean }>}
 */
async function submitIntake({ freelancerUserId, externalOrderId }) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    throw intakeError(401, "UNAUTHORIZED", "يجب تسجيل الدخول.");
  }
  const parsed = normalizeExternalOrderId(externalOrderId);
  if (!parsed) {
    throw intakeError(
      400,
      ERROR_CODES.INVALID_ID,
      "رقم الطلب غير صالح. استخدم الأحرف الإنجليزية والأرقام فقط (حتى 64 حرفًا).",
    );
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // One round trip: insert intake + audit event; conflict on the live-ID unique index → no row.
    const { rows } = await pool.query(
      `WITH ins AS (
         INSERT INTO external_order_intakes (
           source, external_order_id, external_order_id_normalized, freelancer_user_id
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (external_order_id_normalized)
           WHERE status IN ('pending_review', 'approved')
           DO NOTHING
         RETURNING *
       ), ev AS (
         INSERT INTO external_order_intake_events (intake_id, action, actor_user_id, actor_role, detail)
         SELECT ins.id, 'submitted', ins.freelancer_user_id, 'freelancer', jsonb_build_object('source', ins.source)
           FROM ins
       )
       SELECT * FROM ins`,
      [SOURCE_WHATSAPP, parsed.display, parsed.normalized, uid],
    );
    if (rows[0]) {
      return { intake: mapIntakeForFreelancer(rows[0]), created: true };
    }
    const existing = await findLiveIntakeByNormalized(parsed.normalized);
    if (existing) {
      if (Number(existing.freelancer_user_id) === uid) {
        return { intake: mapIntakeForFreelancer(existing), created: false };
      }
      throw intakeError(409, ERROR_CODES.ALREADY_REGISTERED, "رقم الطلب هذا مسجّل مسبقًا أو قيد المراجعة.");
    }
    // The conflicting intake was rejected in between → retry the insert once.
  }
  throw intakeError(409, ERROR_CODES.ALREADY_REGISTERED, "رقم الطلب هذا مسجّل مسبقًا أو قيد المراجعة.");
}

function parsePage(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

function parseStatusFilter(raw) {
  const s = String(raw || "").trim();
  return Object.values(INTAKE_STATUSES).includes(s) ? s : null;
}

/** Freelancer's own intakes (newest first, 15/page). Order data only for their own assigned order. */
async function listFreelancerIntakes({ freelancerUserId, page, status }) {
  const uid = Number(freelancerUserId);
  const pg = parsePage(page);
  const statusFilter = parseStatusFilter(status);
  const values = [uid];
  let where = `i.freelancer_user_id = $1`;
  if (statusFilter) {
    values.push(statusFilter);
    where += ` AND i.status = $${values.length}`;
  }
  values.push(PAGE_SIZE, (pg - 1) * PAGE_SIZE);
  const { rows } = await pool.query(
    `SELECT i.*, o.id AS order_id, o.order_code, o.order_status,
            COUNT(*) OVER () AS total_count
       FROM external_order_intakes i
       LEFT JOIN orders o ON o.id = i.approved_order_id AND o.assigned_freelancer_id = i.freelancer_user_id
      WHERE ${where}
      ORDER BY i.submitted_at DESC, i.id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  let total = rows[0] ? Number(rows[0].total_count) : 0;
  if (!rows[0] && pg > 1) {
    const { rows: c } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM external_order_intakes i WHERE ${where}`,
      values.slice(0, values.length - 2),
    );
    total = c[0] ? Number(c[0].n) : 0;
  }
  return {
    items: rows.map(mapIntakeForFreelancer),
    pagination: { page: pg, limit: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
  };
}

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

function parseDateFilter(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

async function countPendingIntakes(runner = pool) {
  const { rows } = await runner.query(
    `SELECT COUNT(*)::int AS n FROM external_order_intakes WHERE status = 'pending_review'`,
  );
  return rows[0] ? Number(rows[0].n) : 0;
}

/**
 * Admin queue: newest first, 15/page.
 * Filters: status, q (external ID prefix, normalized), freelancer (name / email / account id / user id),
 * from / to (submitted date, YYYY-MM-DD, UTC).
 */
async function listAdminIntakes({ page, status, q, freelancer, from, to } = {}) {
  const pg = parsePage(page);
  const values = [];
  const where = [];
  const statusFilter = parseStatusFilter(status);
  if (statusFilter) {
    values.push(statusFilter);
    where.push(`i.status = $${values.length}`);
  }
  const qText = String(q || "").trim();
  if (qText) {
    const parsed = normalizeExternalOrderId(qText);
    if (!parsed) {
      return {
        items: [],
        pagination: { page: pg, limit: PAGE_SIZE, total: 0, totalPages: 1 },
        pendingCount: await countPendingIntakes(),
      };
    }
    const escaped = parsed.normalized.replace(/[%_]/g, (c) => `\\${c}`);
    values.push(`${escaped}%`);
    where.push(`i.external_order_id_normalized LIKE $${values.length}`);
  }
  const flText = String(freelancer || "").trim().toLowerCase().slice(0, 100);
  if (flText) {
    values.push(`%${flText.replace(/[%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${values.length}`;
    let idClause = "";
    if (/^\d{1,18}$/.test(flText)) {
      values.push(flText);
      idClause = ` OR fl.id::text = $${values.length} OR fl.account_id::text = $${values.length}`;
    }
    where.push(`(
      lower(COALESCE(fl.first_name, '') || ' ' || COALESCE(fl.father_name, '') || ' ' || COALESCE(fl.family_name, '')) LIKE ${p}
      OR lower(fl.email) LIKE ${p}${idClause}
    )`);
  }
  const fromDate = parseDateFilter(from);
  if (fromDate) {
    values.push(fromDate);
    where.push(`i.submitted_at >= $${values.length}::date`);
  }
  const toDate = parseDateFilter(to);
  if (toDate) {
    values.push(toDate);
    where.push(`i.submitted_at < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const filterValues = values.slice();
  values.push(PAGE_SIZE, (pg - 1) * PAGE_SIZE);

  const [listRes, pendingCount] = await Promise.all([
    pool.query(
      `${ADMIN_SELECT.replace("SELECT i.*,", "SELECT i.*, COUNT(*) OVER () AS total_count,")}
       ${whereSql}
       ORDER BY i.submitted_at DESC, i.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    ),
    countPendingIntakes(),
  ]);
  const rows = listRes.rows;
  let total = rows[0] ? Number(rows[0].total_count) : 0;
  if (!rows[0] && pg > 1) {
    const { rows: c } = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM external_order_intakes i JOIN users fl ON fl.id = i.freelancer_user_id
         ${whereSql}`,
      filterValues,
    );
    total = c[0] ? Number(c[0].n) : 0;
  }
  return {
    items: rows.map(mapIntakeForAdmin),
    pagination: { page: pg, limit: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    pendingCount,
  };
}

function parseIntakeId(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,18}$/.test(s) || Number(s) < 1) {
    throw intakeError(404, ERROR_CODES.NOT_FOUND, "طلب واتساب غير موجود.");
  }
  return s;
}

async function loadAdminIntake(intakeId, runner = pool) {
  const { rows } = await runner.query(`${ADMIN_SELECT} WHERE i.id = $1`, [intakeId]);
  return rows[0] || null;
}

/** Admin detail: intake, freelancer eligibility, audit trail and other intakes for the same ID. */
async function getAdminIntake({ intakeId }) {
  const id = parseIntakeId(intakeId);
  const row = await loadAdminIntake(id);
  if (!row) throw intakeError(404, ERROR_CODES.NOT_FOUND, "طلب واتساب غير موجود.");

  const subscriptionsService = require("./subscriptionsService");
  const [eventsRes, sameIdRes, eligibility] = await Promise.all([
    pool.query(
      `SELECT action, actor_role, detail, created_at
         FROM external_order_intake_events WHERE intake_id = $1 ORDER BY created_at ASC, id ASC`,
      [id],
    ),
    pool.query(
      `SELECT i.id, i.status, i.submitted_at, i.freelancer_user_id,
              u.first_name, u.father_name, u.family_name
         FROM external_order_intakes i JOIN users u ON u.id = i.freelancer_user_id
        WHERE i.external_order_id_normalized = $1 AND i.id <> $2
        ORDER BY i.submitted_at DESC LIMIT 10`,
      [row.external_order_id_normalized, id],
    ),
    row.status === INTAKE_STATUSES.PENDING_REVIEW
      ? subscriptionsService
          .canFreelancerTakeOrders(String(row.freelancer_user_id))
          .then((r) => ({ eligible: Boolean(r && r.eligible), reason: (r && (r.reason || r.code)) || null }))
          .catch(() => ({ eligible: null, reason: null }))
      : Promise.resolve(null),
  ]);

  return {
    intake: mapIntakeForAdmin(row),
    freelancerEligibility: eligibility,
    events: eventsRes.rows.map((e) => ({
      action: e.action,
      actorRole: e.actor_role,
      detail: e.detail || {},
      createdAt: iso(e.created_at),
    })),
    sameIdHistory: sameIdRes.rows.map((r) => ({
      id: String(r.id),
      status: r.status,
      submittedAt: iso(r.submitted_at),
      freelancer: {
        id: String(r.freelancer_user_id),
        name: [r.first_name, r.father_name, r.family_name].filter(Boolean).join(" ") || null,
      },
    })),
  };
}

function normalizeInternalNote(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/\p{Cc}/gu, (c) => (c === "\n" ? c : " ")).trim();
  if (!s) return null;
  if (s.length > MAX_INTERNAL_NOTE_LENGTH) {
    throw intakeError(400, ERROR_CODES.DETAILS_INVALID, "الملاحظة الداخلية طويلة جدًا.");
  }
  return s;
}

function parseDuration(rawValue, rawUnit) {
  const unit = rawUnit === undefined || rawUnit === null || rawUnit === "" ? DEFAULT_DURATION_UNIT : String(rawUnit);
  if (!Object.prototype.hasOwnProperty.call(MAX_DURATION, unit)) {
    throw intakeError(400, ERROR_CODES.DETAILS_INVALID, "وحدة المدة غير صالحة.");
  }
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return { durationValue: DEFAULT_DURATION_VALUE, durationUnit: DEFAULT_DURATION_UNIT };
  }
  const n = Number(rawValue);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DURATION[unit]) {
    throw intakeError(400, ERROR_CODES.DETAILS_INVALID, "مدة التنفيذ غير صالحة.");
  }
  return { durationValue: n, durationUnit: unit };
}

async function resolveCategoryId(rawCategoryId, client) {
  if (rawCategoryId !== undefined && rawCategoryId !== null && rawCategoryId !== "") {
    const n = Number(rawCategoryId);
    if (!Number.isInteger(n) || n < 1) {
      throw intakeError(400, ERROR_CODES.DETAILS_INVALID, "التصنيف غير صالح.");
    }
    return n;
  }
  const { rows } = await client.query(
    `SELECT id FROM categories
      WHERE is_active = TRUE
      ORDER BY (slug = $1) DESC, id ASC
      LIMIT 1`,
    [DEFAULT_CATEGORY_SLUG],
  );
  if (!rows[0]) throw intakeError(400, ERROR_CODES.DETAILS_INVALID, "لا يوجد تصنيف فعّال.");
  return Number(rows[0].id);
}

function systemOrderTexts(displayId) {
  return {
    title: `طلب خارجي #${displayId}`,
    titleEn: `External order #${displayId}`,
    description:
      `تم إرسال تفاصيل هذا الطلب إليك خارجيًا عبر واتساب. يرجى الرجوع إلى رسالة واتساب الخاصة بالطلب رقم ${displayId}، ثم تسليم العمل من هذه الصفحة.`,
    descriptionEn:
      `The details of this order were sent to you externally via WhatsApp. Please refer to the WhatsApp message for order ${displayId}, then deliver the work from this page.`,
  };
}

function alreadyProcessedError(row) {
  return intakeError(409, ERROR_CODES.ALREADY_PROCESSED, "تمت معالجة هذا الطلب مسبقًا.", {
    status: row.status,
    orderId: row.approved_order_id != null ? String(row.approved_order_id) : null,
  });
}

function mapAssigneeError(err) {
  if (err && err.assigneeReason) {
    return intakeError(
      409,
      ERROR_CODES.FREELANCER_NOT_ELIGIBLE,
      "لا يمكن إسناد الطلب لهذا المستقل حاليًا (الحساب أو العضوية غير مؤهلة لاستلام الطلبات).",
      { reason: err.assigneeReason },
    );
  }
  if (err && err.statusCode === 400 && /categor/i.test(String(err.message || ""))) {
    return intakeError(400, ERROR_CODES.DETAILS_INVALID, "التصنيف غير صالح.");
  }
  return err;
}

/**
 * Atomic approval. One transaction:
 *   lock intake → still pending → create canonical assigned order (existing domain service,
 *   no pool broadcast, no payment) → system EN title/description → link + price on intake → audit.
 * Concurrent approvals serialize on the row lock; the loser gets EXTERNAL_ORDER_ALREADY_PROCESSED.
 * Any failure rolls back everything (no half-created order). Notifications (canonical
 * `order.freelancer.assigned`) are dispatched only after COMMIT by notificationService.
 */
async function approveIntake({ intakeId, actorUserId, actorRole, price, categoryId, durationValue, durationUnit, internalNote }) {
  const id = parseIntakeId(intakeId);
  const priceText = parseApprovalPrice(price);
  const duration = parseDuration(durationValue, durationUnit);
  const note = normalizeInternalNote(internalNote);
  const role = actorRole === "super_admin" ? "super_admin" : "admin";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: locked } = await client.query(
      `SELECT * FROM external_order_intakes WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const intake = locked[0];
    if (!intake) throw intakeError(404, ERROR_CODES.NOT_FOUND, "طلب واتساب غير موجود.");
    if (intake.status !== INTAKE_STATUSES.PENDING_REVIEW || intake.approved_order_id != null) {
      throw alreadyProcessedError(intake);
    }

    const resolvedCategoryId = await resolveCategoryId(categoryId, client);
    const texts = systemOrderTexts(intake.external_order_id);

    let created;
    try {
      created = await ordersService.createInternalOrderInTransaction(client, {
        actorUserId: Number(actorUserId),
        actorRole: role,
        payload: {
          title: texts.title,
          description: texts.description,
          categoryId: resolvedCategoryId,
          subcategoryId: null,
          subSubcategoryId: null,
          projectType: "fixed",
          budget: priceText,
          durationValue: duration.durationValue,
          durationUnit: duration.durationUnit,
          assignedFreelancerId: Number(intake.freelancer_user_id),
          preferredSkills: [],
          archive: false,
        },
        uploadedFiles: [],
        options: { skipFreelancerBroadcast: true, visibilityScope: "public" },
      });
    } catch (err) {
      throw mapAssigneeError(err);
    }
    const orderRow = created && created.orderRow;
    if (!orderRow || !orderRow.id) {
      throw new Error("external intake approval: canonical order was not created");
    }

    // One round trip: system EN texts on the order + intake → approved + audit events.
    const { rows: updated } = await client.query(
      `WITH o AS (
         UPDATE orders SET title_en = $3, description_en = $4, updated_at = NOW()
          WHERE id = $2
          RETURNING id, budget, order_code
       ), i AS (
         UPDATE external_order_intakes
            SET status = 'approved',
                approved_order_id = (SELECT id FROM o),
                approved_price = (SELECT budget FROM o),
                reviewed_by_user_id = $5,
                reviewed_by_role = $6,
                reviewed_at = NOW(),
                internal_note = COALESCE($7, internal_note),
                updated_at = NOW()
          WHERE id = $1 AND status = 'pending_review'
          RETURNING *
       ), ev AS (
         INSERT INTO external_order_intake_events (intake_id, action, actor_user_id, actor_role, detail)
         SELECT i.id, x.action, $5, $6, x.detail
           FROM i
           CROSS JOIN o
           CROSS JOIN LATERAL (VALUES
             ('order_created', jsonb_build_object('orderId', o.id::text, 'orderCode', o.order_code)),
             ('approved', jsonb_build_object(
                 'price', o.budget::text, 'currency', 'JOD', 'categoryId', $8::int,
                 'durationValue', $9::int, 'durationUnit', $10::text))
           ) AS x(action, detail)
       )
       SELECT * FROM i`,
      [
        id,
        Number(orderRow.id),
        texts.titleEn,
        texts.descriptionEn,
        Number(actorUserId),
        role,
        note,
        resolvedCategoryId,
        duration.durationValue,
        duration.durationUnit,
      ],
    );
    if (!updated[0]) {
      // Unreachable under the row lock; fail closed (rolls back the order).
      throw intakeError(409, ERROR_CODES.ALREADY_PROCESSED, "تمت معالجة هذا الطلب مسبقًا.");
    }
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }

  const row = await loadAdminIntake(id);
  return { intake: mapIntakeForAdmin(row) };
}

/**
 * Reject a pending intake (never creates an order or money). The freelancer sees only the
 * localized reason code; the optional internal note stays Admin-only.
 */
async function rejectIntake({ intakeId, actorUserId, actorRole, reasonCode, internalNote }) {
  const id = parseIntakeId(intakeId);
  const reason = String(reasonCode || "").trim();
  if (!REJECTION_REASON_CODES.includes(reason)) {
    throw intakeError(400, ERROR_CODES.REJECTION_REASON_INVALID, "سبب الرفض غير صالح.");
  }
  const note = normalizeInternalNote(internalNote);
  const role = actorRole === "super_admin" ? "super_admin" : "admin";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: locked } = await client.query(
      `SELECT * FROM external_order_intakes WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const intake = locked[0];
    if (!intake) throw intakeError(404, ERROR_CODES.NOT_FOUND, "طلب واتساب غير موجود.");
    if (intake.status !== INTAKE_STATUSES.PENDING_REVIEW) throw alreadyProcessedError(intake);

    await client.query(
      `WITH i AS (
         UPDATE external_order_intakes
            SET status = 'rejected', rejection_reason_code = $2,
                reviewed_by_user_id = $3, reviewed_by_role = $4, reviewed_at = NOW(),
                internal_note = COALESCE($5, internal_note), updated_at = NOW()
          WHERE id = $1 AND status = 'pending_review'
          RETURNING id, rejection_reason_code, reviewed_by_user_id, reviewed_by_role
       )
       INSERT INTO external_order_intake_events (intake_id, action, actor_user_id, actor_role, detail)
       SELECT i.id, 'rejected', i.reviewed_by_user_id, i.reviewed_by_role,
              jsonb_build_object('reasonCode', i.rejection_reason_code)
         FROM i`,
      [id, reason, Number(actorUserId), role, note],
    );

    // Savepoint-isolated insert; realtime/push dispatched only after COMMIT.
    try {
      await notificationService.createIfNotExists(
        {
          recipientUserId: Number(intake.freelancer_user_id),
          recipientRole: "freelancer",
          actorUserId: Number(actorUserId),
          type: "external_order_intake.rejected",
          title: "لم يتم اعتماد طلب واتساب",
          message: `لم يتم اعتماد الطلب رقم ${intake.external_order_id}. راجع صفحة طلبات واتساب للتفاصيل.`,
          entityType: "external_order_intake",
          entityId: Number(intake.id),
          link: "/dashboard/freelancer/whatsapp-orders",
          priority: "medium",
          metadata: {
            intakeId: String(intake.id),
            externalOrderId: intake.external_order_id,
            reasonCode: reason,
            titleEn: "WhatsApp order not approved",
            messageEn: `Order ${intake.external_order_id} was not approved. See WhatsApp Orders for details.`,
          },
        },
        `external_order_intake_rejected_${String(intake.id)}`,
        client,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[external-order-intake] reject notification failed:", err?.message || err);
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }

  const row = await loadAdminIntake(id);
  return { intake: mapIntakeForAdmin(row) };
}

module.exports = {
  SOURCE_WHATSAPP,
  PAGE_SIZE,
  INTAKE_STATUSES,
  REJECTION_REASON_CODES,
  ERROR_CODES,
  normalizeExternalOrderId,
  parseApprovalPrice,
  mapIntakeForFreelancer,
  mapIntakeForAdmin,
  submitIntake,
  listFreelancerIntakes,
  listAdminIntakes,
  countPendingIntakes,
  getAdminIntake,
  approveIntake,
  rejectIntake,
};
