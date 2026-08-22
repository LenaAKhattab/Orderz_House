/**
 * Super Admin review / manual link for OrderzHouse-side Bildazo writer requests.
 * Does not call Bildazo. Does not create Bildazo users. Does not store passwords.
 * status=linked is set only here after confirmVerified.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  BILDAZO_AUTHOR_LINK_FLOWS,
  BILDAZO_AUTHOR_LINK_STATUSES,
  BILDAZO_ADMIN_REVIEW_STATUSES,
  BILDAZO_AUTHOR_LINK_ERROR_CODES,
} = require("../constants/bildazoAuthorLink");
const { bildazoAuthorLinkSchemaReady } = require("../utils/bildazoAuthorLinkSchema");
const {
  assertBildazoWriterIdentifierAvailableForFreelancer,
} = require("../utils/bildazoAuthorLinkIdentifierGuard");
const { mapLinkRow } = require("./bildazoAuthorLinkService");

const SCHEMA_MISSING_AR = "جدول ربط Bildazo غير جاهز. طبّق الترحيل 164 أولاً.";
const FORBIDDEN_BODY_KEY_RE =
  /^(password|passwordhash|password_hash|role|roleid|role_id|token|admintoken|admin_token|authorization|jwt|apikey|api_key)$/i;

function throwSchemaMissing() {
  throw createAppError(SCHEMA_MISSING_AR, 503, {
    exposeToClient: true,
    publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_GATE_SCHEMA_MISSING,
  });
}

async function requireSchema(db) {
  const ready = await bildazoAuthorLinkSchemaReady(db);
  if (!ready) throwSchemaMissing();
}

function rejectSensitiveFields(body = {}) {
  const keys = Object.keys(body || {});
  const passwordHit = keys.find((k) => /password/i.test(String(k)));
  if (passwordHit) {
    throw createAppError("لا يتم جمع أو تخزين كلمة مرور Bildazo من OrderzHouse.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED,
    });
  }
  const sensitive = keys.find((k) => FORBIDDEN_BODY_KEY_RE.test(String(k)));
  if (sensitive) {
    throw createAppError("حقل غير مسموح في طلب الربط اليدوي.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_SENSITIVE_FIELD,
    });
  }
}

function normalizeOptionalText(raw, max) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function sanitizeSearch(raw) {
  return String(raw || "")
    .trim()
    .slice(0, 80)
    .replace(/[%_\\]/g, "");
}

function freelancerDisplayName(row) {
  const fromLink = String(row.full_name || "").trim();
  if (fromLink) return fromLink;
  return [row.freelancer_first_name, row.freelancer_father_name, row.freelancer_family_name]
    .map((p) => String(p || "").trim())
    .filter(Boolean)
    .join(" ");
}

function mapAdminLinkRow(row) {
  const mapped = mapLinkRow(row);
  if (!mapped) return null;
  return {
    ...mapped,
    freelancerEmail: row.freelancer_email || row.orderz_verified_email || null,
    freelancerDisplayName: freelancerDisplayName(row) || null,
  };
}

function parsePageLimit(query = {}) {
  const page = Math.max(1, Number.parseInt(String(query.page || "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit || "25"), 10) || 25));
  return { page, limit, offset: (page - 1) * limit };
}

function isTruthyConfirm(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeBildazoPublicId(raw) {
  const id = normalizeOptionalText(raw, 120);
  if (!id) return null;
  if (/\s/.test(id) || /:\/\//.test(id) || id.includes("@")) {
    throw createAppError("معرّف Bildazo العام غير صالح.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  return id;
}

function normalizeBildazoUserId(raw) {
  const id = normalizeOptionalText(raw, 80);
  if (!id) return null;
  if (/\s/.test(id) || /:\/\//.test(id)) {
    throw createAppError("معرّف مستخدم Bildazo غير صالح.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  return id;
}

function normalizeBildazoProfileUrl(raw) {
  const text = normalizeOptionalText(raw, 500);
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw createAppError("رابط الملف الشخصي في Bildazo غير صالح.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (parsed.protocol !== "https:") {
    throw createAppError("رابط الملف الشخصي يجب أن يبدأ بـ https.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  const host = String(parsed.hostname || "").toLowerCase();
  if (host !== "bildazo.com" && host !== "www.bildazo.com") {
    throw createAppError("رابط الملف الشخصي يجب أن يكون على bildazo.com.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (parsed.username || parsed.password) {
    throw createAppError("رابط الملف الشخصي غير آمن.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  parsed.hash = "";
  return parsed.toString();
}

function parseManualLinkBody(body = {}) {
  rejectSensitiveFields(body);
  if (!isTruthyConfirm(body.confirmVerified)) {
    throw createAppError("يجب تأكيد التحقق من ملكية حساب Bildazo قبل الربط.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_CONFIRM_REQUIRED,
    });
  }
  const bildazoUserId = normalizeBildazoUserId(body.bildazoUserId);
  const bildazoPublicId = normalizeBildazoPublicId(body.bildazoPublicId);
  const bildazoProfileUrl = normalizeBildazoProfileUrl(body.bildazoProfileUrl);
  if (!bildazoPublicId && !bildazoProfileUrl) {
    throw createAppError("أدخل المعرّف العام أو رابط الملف الشخصي في Bildazo.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  return {
    bildazoUserId,
    bildazoPublicId,
    bildazoProfileUrl,
    manualReviewReason: normalizeOptionalText(body.manualReviewReason, 2000),
  };
}

async function findLinkById(id, db) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1) {
    throw createAppError("طلب الربط غير موجود.", 404, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_NOT_FOUND,
    });
  }
  const { rows } = await db.query(
    `SELECT l.*,
            u.email AS freelancer_email,
            u.first_name AS freelancer_first_name,
            u.father_name AS freelancer_father_name,
            u.family_name AS freelancer_family_name
       FROM freelancer_bildazo_author_links l
       JOIN users u ON u.id = l.freelancer_user_id
      WHERE l.id = $1
      LIMIT 1`,
    [numericId],
  );
  return rows[0] || null;
}

async function assertIdentifierAvailable({ id, bildazoUserId, bildazoPublicId, bildazoProfileUrl }, db) {
  await assertBildazoWriterIdentifierAvailableForFreelancer(
    {
      excludeFreelancerUserId: null,
      excludeLinkId: id,
      bildazoUserId,
      bildazoPublicId,
      bildazoProfileUrl,
    },
    db,
  );
}

async function listBildazoAuthorLinks(query = {}, { db = pool } = {}) {
  await requireSchema(db);
  const status = String(query.status || "").trim();
  const linkFlow = String(query.linkFlow || "").trim();
  if (status && status !== "all" && !BILDAZO_AUTHOR_LINK_STATUSES.includes(status)) {
    throw createAppError("حالة الربط غير صالحة.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (linkFlow && !BILDAZO_AUTHOR_LINK_FLOWS.includes(linkFlow)) {
    throw createAppError("نوع طلب الربط غير صالح.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  const search = sanitizeSearch(query.search || query.q);
  const { page, limit, offset } = parsePageLimit(query);
  const statusFilter = !status || status === "all" ? null : status;
  const flowFilter = linkFlow || null;
  const searchFilter = search || null;

  const whereSql = `
      WHERE ($1::text IS NULL OR l.status = $1)
        AND ($2::text IS NULL OR l.link_flow = $2)
        AND (
          $3::text IS NULL
          OR l.orderz_verified_email ILIKE '%' || $3 || '%'
          OR COALESCE(l.full_name, '') ILIKE '%' || $3 || '%'
          OR COALESCE(l.existing_bildazo_email, '') ILIKE '%' || $3 || '%'
          OR COALESCE(l.existing_bildazo_public_id, '') ILIKE '%' || $3 || '%'
          OR COALESCE(l.bildazo_public_id, '') ILIKE '%' || $3 || '%'
          OR u.email ILIKE '%' || $3 || '%'
          OR COALESCE(u.first_name, '') ILIKE '%' || $3 || '%'
          OR COALESCE(u.family_name, '') ILIKE '%' || $3 || '%'
        )`;

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total
       FROM freelancer_bildazo_author_links l
       JOIN users u ON u.id = l.freelancer_user_id
      ${whereSql}`,
    [statusFilter, flowFilter, searchFilter],
  );
  const listResult = await db.query(
    `SELECT l.*,
            u.email AS freelancer_email,
            u.first_name AS freelancer_first_name,
            u.father_name AS freelancer_father_name,
            u.family_name AS freelancer_family_name
       FROM freelancer_bildazo_author_links l
       JOIN users u ON u.id = l.freelancer_user_id
      ${whereSql}
      ORDER BY l.updated_at DESC
      LIMIT $4 OFFSET $5`,
    [statusFilter, flowFilter, searchFilter, limit, offset],
  );

  return {
    items: listResult.rows.map(mapAdminLinkRow),
    total: Number(countResult.rows[0]?.total || 0),
    page,
    limit,
  };
}

async function manualLinkBildazoAuthor(id, body, actorUserId, { db = pool } = {}) {
  await requireSchema(db);
  const parsed = parseManualLinkBody(body || {});
  const row = await findLinkById(id, db);
  if (!row) {
    throw createAppError("طلب الربط غير موجود.", 404, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_NOT_FOUND,
    });
  }
  if (row.status === "blocked") {
    throw createAppError("لا يمكن ربط حساب موقوف. غيّر الحالة أولاً إن لزم.", 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_BLOCKED,
    });
  }

  await assertIdentifierAvailable(
    {
      id: row.id,
      bildazoUserId: parsed.bildazoUserId,
      bildazoPublicId: parsed.bildazoPublicId,
      bildazoProfileUrl: parsed.bildazoProfileUrl,
    },
    db,
  );

  const alreadyLinked = row.status === "linked";
  const identifiersUnchanged =
    alreadyLinked &&
    String(row.bildazo_user_id || "") === String(parsed.bildazoUserId || "") &&
    String(row.bildazo_public_id || "") === String(parsed.bildazoPublicId || "") &&
    String(row.bildazo_profile_url || "") === String(parsed.bildazoProfileUrl || "");

  const updated = await db.query(
    `UPDATE freelancer_bildazo_author_links
        SET status = 'linked',
            bildazo_user_id = $2,
            bildazo_public_id = $3,
            bildazo_profile_url = $4,
            linked_at = COALESCE(linked_at, NOW()),
            linked_by_user_id = $5,
            manual_review_reason = COALESCE($6, manual_review_reason),
            last_error = NULL,
            updated_at = NOW()
      WHERE id = $1
        AND status <> 'blocked'
      RETURNING *`,
    [
      Number(row.id),
      parsed.bildazoUserId,
      parsed.bildazoPublicId,
      parsed.bildazoProfileUrl,
      Number(actorUserId) || null,
      parsed.manualReviewReason,
    ],
  );
  const next = updated.rows[0];
  if (!next) {
    throw createAppError("تعذر حفظ الربط اليدوي.", 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  const hydrated = await findLinkById(next.id, db);
  return {
    alreadyLinked: alreadyLinked && identifiersUnchanged,
    updated: alreadyLinked && !identifiersUnchanged,
    link: mapAdminLinkRow(hydrated || { ...next, freelancer_email: row.freelancer_email }),
  };
}

async function updateBildazoAuthorLinkStatus(id, body, actorUserId, { db = pool } = {}) {
  await requireSchema(db);
  rejectSensitiveFields(body || {});
  const status = String(body?.status || "").trim();
  if (status === "linked") {
    throw createAppError("الربط يتم فقط عبر مسار الربط اليدوي بعد التحقق.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  if (!BILDAZO_ADMIN_REVIEW_STATUSES.includes(status)) {
    throw createAppError("الحالة المسموحة: مراجعة يدوية أو فشل أو إيقاف.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }
  const reason = normalizeOptionalText(body?.manualReviewReason, 2000);
  if ((status === "failed" || status === "blocked") && !reason) {
    throw createAppError("سبب المراجعة مطلوب لحالة الفشل أو الإيقاف.", 400, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_INVALID,
    });
  }

  const row = await findLinkById(id, db);
  if (!row) {
    throw createAppError("طلب الربط غير موجود.", 404, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_LINK_NOT_FOUND,
    });
  }
  if (row.status === "linked") {
    throw createAppError("الحساب مرتبط. لا يمكن تغيير الحالة من هذا المسار.", 409, {
      exposeToClient: true,
      publicCode: BILDAZO_AUTHOR_LINK_ERROR_CODES.BILDAZO_AUTHOR_ALREADY_LINKED,
    });
  }

  const updated = await db.query(
    `UPDATE freelancer_bildazo_author_links
        SET status = $2,
            manual_review_reason = $3,
            last_error = CASE WHEN $2 = 'failed' THEN $3 ELSE last_error END,
            updated_at = NOW()
      WHERE id = $1
        AND status <> 'linked'
      RETURNING *`,
    [Number(row.id), status, reason],
  );
  const next = updated.rows[0];
  const hydrated = next ? await findLinkById(next.id, db) : row;
  return {
    actorUserId: actorUserId != null ? String(actorUserId) : null,
    link: mapAdminLinkRow(hydrated || row),
  };
}

module.exports = {
  listBildazoAuthorLinks,
  manualLinkBildazoAuthor,
  updateBildazoAuthorLinkStatus,
  parseManualLinkBody,
  mapAdminLinkRow,
  assertBildazoWriterIdentifierAvailableForFreelancer,
  SCHEMA_MISSING_AR,
};
