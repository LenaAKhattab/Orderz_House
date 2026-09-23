/**
 * Legacy Freelancer Administration Center.
 * Isolated to onboarding_source=LEGACY_INVITE. No Stripe/wallet/ledger mutations.
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const { ROLES } = require("../constants/roles");
const { ensureUserRole } = require("./rbacService");
const { createPublicApiError } = require("../utils/publicApiError");
const { ORDERZHOUSE_FREE_PLAN_ID } = require("../constants/orderzhousePlansCatalog");
const { uploadKycIdBuffer } = require("./cloudinaryUploadService");
const { getCloudinary } = require("../config/cloudinary");
const {
  normalizeAndValidateNationalId,
  maskFreelancerMemberId,
  isLegacyMemberIdUniqueViolation,
  duplicateNationalIdError,
} = require("../utils/legacyFreelancerMemberId");
const {
  normalizeLegacyWorkFields,
  resolveLegacyWorkAreasFromUserRow,
  WORK_FIELDS_REQUIRED_MESSAGE,
} = require("../constants/legacyFreelancerWorkFields");
const {
  writeAudit,
  waiveTrainingAndExam,
  assignLegacySubscription,
  upsertTrustRank,
  generateUniqueAccountId,
  composeE164,
  maskEmail,
  maskPhone,
  TRAINING_WAIVER_REASON,
  FINAL_EXAM_WAIVER_REASON,
  TRUST_LEVELS,
  BCRYPT_ROUNDS,
} = require("./legacyFreelancerInviteService");

const IDENTITY_BASE = "/api/super-admin/legacy-freelancers";

const AUDIT_ACTIONS = Object.freeze({
  MANUAL_CREATED: "LEGACY_FREELANCER_MANUAL_CREATED",
  PACKAGE_ASSIGNED: "LEGACY_FREELANCER_PACKAGE_ASSIGNED",
  PACKAGE_BULK_ASSIGNED: "LEGACY_FREELANCER_PACKAGE_BULK_ASSIGNED",
  DOC_TYPE_CREATED: "LEGACY_DOCUMENT_TYPE_CREATED",
  DOC_TYPE_UPDATED: "LEGACY_DOCUMENT_TYPE_UPDATED",
  CAMPAIGN_DOC_REQS_REPLACED: "LEGACY_CAMPAIGN_DOC_REQUIREMENTS_REPLACED",
  SIGNED_DOC_SET: "LEGACY_SIGNED_DOCUMENT_SET",
  SIGNED_DOC_REMOVED: "LEGACY_SIGNED_DOCUMENT_REMOVED",
  HISTORICAL_MONEY_ADDED: "LEGACY_HISTORICAL_MONEY_ADDED",
  HISTORICAL_MONEY_VOIDED: "LEGACY_HISTORICAL_MONEY_VOIDED",
  IDENTITY_REPLACED: "LEGACY_IDENTITY_DOCUMENT_REPLACED",
  IDENTITY_VIEWED: "LEGACY_IDENTITY_DOCUMENT_VIEWED",
});

function addMonthsUtc(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  // Clamp overflow (e.g. Jan 31 + 1 month)
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d;
}

function normalizeSide(side) {
  const s = String(side || "")
    .trim()
    .toUpperCase();
  if (s === "FRONT" || s === "BACK") return s;
  throw createPublicApiError("جهة صورة الهوية غير صالحة.", 400, "VALIDATION_ERROR");
}

function identityProtectedPath(userId, side) {
  return `${IDENTITY_BASE}/${Number(userId)}/identity/${String(side).toLowerCase()}`;
}

function mapIdentityDocPublic(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
    side: row.side,
    originalName: row.original_name || null,
    mimeType: row.mime_type || null,
    fileSize: row.file_size != null ? Number(row.file_size) : null,
    uploadedAt: row.uploaded_at,
    uploadSource: row.upload_source,
    status: row.status,
    protectedPath: identityProtectedPath(row.user_id, row.side),
  };
}

function mapSignedDocPublic(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
    documentTypeId: String(row.document_type_id),
    code: row.code || null,
    labelAr: row.label_ar || null,
    confirmedAt: row.confirmed_at,
    confirmationSource: row.confirmation_source,
    notes: row.notes || null,
    isActive: row.is_active !== false,
  };
}

function mapDocTypePublic(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    code: row.code,
    labelAr: row.label_ar,
    description: row.description || null,
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMoneyPublic(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    amount: Number(row.amount),
    currency: row.currency || "JOD",
    receivedAt: row.received_at || null,
    note: row.note || null,
    recordedByAdminId: row.recorded_by_admin_id != null ? String(row.recorded_by_admin_id) : null,
    isVoided: Boolean(row.is_voided),
    voidedAt: row.voided_at || null,
    voidReason: row.void_reason || null,
    createdAt: row.created_at,
  };
}

function mapPackageAssignmentPublic(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    planId: String(row.plan_id),
    planName: row.plan_name || null,
    planTitle: row.plan_title || null,
    subscriptionId: row.subscription_id != null ? String(row.subscription_id) : null,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    durationMonths: row.duration_months != null ? Number(row.duration_months) : null,
    assignmentSource: row.assignment_source,
    assignedByAdminId: row.assigned_by_admin_id != null ? String(row.assigned_by_admin_id) : null,
    notes: row.notes || null,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function assertLegacyUser(client, userId) {
  const runner = client || pool;
  let row;
  try {
    const { rows } = await runner.query(
      `SELECT id, onboarding_source, freelancer_member_id, is_active, legacy_entry_method,
              first_name, father_name, family_name, email, phone, account_id, skills, legacy_work_areas
         FROM users WHERE id = $1::bigint LIMIT 1`,
      [Number(userId)],
    );
    row = rows[0];
  } catch (e) {
    if (!(e && e.code === "42703")) throw e;
    try {
      const { rows } = await runner.query(
        `SELECT id, onboarding_source, freelancer_member_id, is_active, legacy_entry_method,
                first_name, father_name, family_name, email, phone, account_id, skills
           FROM users WHERE id = $1::bigint LIMIT 1`,
        [Number(userId)],
      );
      row = rows[0];
    } catch (e2) {
      if (!(e2 && e2.code === "42703")) throw e2;
      const { rows } = await runner.query(
        `SELECT id, onboarding_source, freelancer_member_id, is_active, legacy_entry_method,
                first_name, father_name, family_name, email, phone, account_id
           FROM users WHERE id = $1::bigint LIMIT 1`,
        [Number(userId)],
      );
      row = rows[0];
    }
  }
  if (!row) throw createPublicApiError("المستخدم غير موجود.", 404, "NOT_FOUND");
  if (String(row.onboarding_source) !== "LEGACY_INVITE") {
    throw createPublicApiError("هذا الحساب ليس فريلانسر قديماً.", 400, "NOT_LEGACY_FREELANCER");
  }
  return row;
}

async function ensureDefaultCampaignDocumentRequirements(campaignId, client = null) {
  const runner = client || pool;
  await runner.query(
    `INSERT INTO legacy_freelancer_campaign_document_requirements
       (campaign_id, document_type_id, is_enabled, is_required, sort_order)
     SELECT $1::bigint, t.id, TRUE, FALSE, t.sort_order
       FROM legacy_freelancer_document_types t
      WHERE t.code IN ('CONTRACTOR_AGREEMENT', 'TRAINING_AGREEMENT')
        AND t.is_active = TRUE
     ON CONFLICT (campaign_id, document_type_id) DO NOTHING`,
    [Number(campaignId)],
  );
}

async function getCampaignDocumentRequirements(campaignId) {
  await ensureDefaultCampaignDocumentRequirements(campaignId);
  const { rows } = await pool.query(
    `SELECT r.*, t.code, t.label_ar, t.description, t.is_active AS type_is_active
       FROM legacy_freelancer_campaign_document_requirements r
       JOIN legacy_freelancer_document_types t ON t.id = r.document_type_id
      WHERE r.campaign_id = $1::bigint
      ORDER BY r.sort_order ASC, t.sort_order ASC, r.id ASC`,
    [Number(campaignId)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    campaignId: String(r.campaign_id),
    documentTypeId: String(r.document_type_id),
    code: r.code,
    labelAr: r.label_ar,
    description: r.description || null,
    isEnabled: Boolean(r.is_enabled),
    isRequired: Boolean(r.is_required),
    sortOrder: Number(r.sort_order || 0),
    typeIsActive: Boolean(r.type_is_active),
  }));
}

async function replaceCampaignDocumentRequirements(campaignId, items, { actorAdminId } = {}) {
  if (!Array.isArray(items)) {
    throw createPublicApiError("قائمة متطلبات المستندات غير صالحة.", 400, "VALIDATION_ERROR");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: campRows } = await client.query(
      `SELECT id FROM legacy_freelancer_invite_campaigns WHERE id = $1::bigint LIMIT 1`,
      [Number(campaignId)],
    );
    if (!campRows[0]) throw createPublicApiError("الحملة غير موجودة.", 404, "NOT_FOUND");

    await client.query(
      `DELETE FROM legacy_freelancer_campaign_document_requirements WHERE campaign_id = $1::bigint`,
      [Number(campaignId)],
    );

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i] || {};
      const typeId = Number(it.documentTypeId ?? it.document_type_id);
      if (!Number.isInteger(typeId) || typeId < 1) {
        throw createPublicApiError("نوع المستند غير صالح.", 400, "VALIDATION_ERROR");
      }
      const isEnabled = it.isEnabled !== false && it.is_enabled !== false;
      const isRequired = Boolean(it.isRequired ?? it.is_required);
      if (isRequired && !isEnabled) {
        throw createPublicApiError("لا يمكن طلب مستند معطل.", 400, "VALIDATION_ERROR");
      }
      const sortOrder = Number(it.sortOrder ?? it.sort_order ?? i * 10);
      await client.query(
        `INSERT INTO legacy_freelancer_campaign_document_requirements
           (campaign_id, document_type_id, is_enabled, is_required, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [Number(campaignId), typeId, isEnabled, isRequired, sortOrder],
      );
    }

    await writeAudit(client, {
      action: AUDIT_ACTIONS.CAMPAIGN_DOC_REQS_REPLACED,
      actorAdminId,
      campaignId,
      detail: { count: items.length },
    });
    await client.query("COMMIT");
    return getCampaignDocumentRequirements(campaignId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listDocumentTypes({ includeInactive = true } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM legacy_freelancer_document_types
      WHERE ($1::boolean = TRUE OR is_active = TRUE)
      ORDER BY sort_order ASC, id ASC`,
    [Boolean(includeInactive)],
  );
  return rows.map(mapDocTypePublic);
}

async function createDocumentType(payload, { actorAdminId } = {}) {
  const code = String(payload.code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64);
  const labelAr = String(payload.labelAr || payload.label_ar || "").trim();
  if (!code || code.length < 2) {
    throw createPublicApiError("رمز نوع المستند غير صالح.", 400, "VALIDATION_ERROR");
  }
  if (!labelAr) {
    throw createPublicApiError("الاسم العربي لنوع المستند مطلوب.", 400, "VALIDATION_ERROR");
  }
  const description =
    payload.description != null ? String(payload.description).trim().slice(0, 2000) : null;
  const sortOrder = Number(payload.sortOrder ?? payload.sort_order ?? 100);
  const isActive = payload.isActive !== false && payload.is_active !== false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO legacy_freelancer_document_types
         (code, label_ar, description, is_active, sort_order, created_by_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        code,
        labelAr,
        description,
        isActive,
        Number.isFinite(sortOrder) ? sortOrder : 100,
        actorAdminId != null ? Number(actorAdminId) : null,
      ],
    );
    await writeAudit(client, {
      action: AUDIT_ACTIONS.DOC_TYPE_CREATED,
      actorAdminId,
      detail: { documentTypeId: String(rows[0].id), code },
    });
    await client.query("COMMIT");
    return mapDocTypePublic(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      throw createPublicApiError("رمز نوع المستند مستخدم مسبقاً.", 409, "DOC_TYPE_CODE_TAKEN");
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updateDocumentType(id, payload, { actorAdminId } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existing } = await client.query(
      `SELECT * FROM legacy_freelancer_document_types WHERE id = $1::bigint FOR UPDATE`,
      [Number(id)],
    );
    if (!existing[0]) throw createPublicApiError("نوع المستند غير موجود.", 404, "NOT_FOUND");

    const labelAr =
      payload.labelAr != null || payload.label_ar != null
        ? String(payload.labelAr ?? payload.label_ar).trim()
        : existing[0].label_ar;
    if (!labelAr) {
      throw createPublicApiError("الاسم العربي لنوع المستند مطلوب.", 400, "VALIDATION_ERROR");
    }
    const description =
      payload.description !== undefined
        ? payload.description != null
          ? String(payload.description).trim().slice(0, 2000)
          : null
        : existing[0].description;
    const sortOrder =
      payload.sortOrder != null || payload.sort_order != null
        ? Number(payload.sortOrder ?? payload.sort_order)
        : existing[0].sort_order;
    const isActive =
      payload.isActive != null || payload.is_active != null
        ? Boolean(payload.isActive ?? payload.is_active)
        : existing[0].is_active;

    const { rows } = await client.query(
      `UPDATE legacy_freelancer_document_types SET
         label_ar = $2,
         description = $3,
         sort_order = $4,
         is_active = $5,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [Number(id), labelAr, description, sortOrder, isActive],
    );
    await writeAudit(client, {
      action: AUDIT_ACTIONS.DOC_TYPE_UPDATED,
      actorAdminId,
      detail: { documentTypeId: String(id), code: rows[0].code, isActive },
    });
    await client.query("COMMIT");
    return mapDocTypePublic(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function storeIdentityDocument(client, {
  userId,
  campaignId = null,
  side,
  file,
  uploadSource = "ADMIN",
  uploadedByAdminId = null,
}) {
  const normalizedSide = normalizeSide(side);
  if (!file || !file.buffer) {
    throw createPublicApiError(
      normalizedSide === "FRONT"
        ? "صورة الهوية الأمامية مطلوبة."
        : "صورة الهوية الخلفية مطلوبة.",
      400,
      "VALIDATION_ERROR",
    );
  }
  const uploaded = await uploadKycIdBuffer({
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalname: file.originalname,
    userId,
    side: normalizedSide.toLowerCase(),
  });

  await client.query(
    `UPDATE legacy_freelancer_identity_documents
        SET status = 'REPLACED', updated_at = NOW()
      WHERE user_id = $1::bigint AND side = $2 AND status = 'ACTIVE'`,
    [Number(userId), normalizedSide],
  );

  const { rows } = await client.query(
    `INSERT INTO legacy_freelancer_identity_documents (
       user_id, campaign_id, side, storage_key, original_name, mime_type, file_size,
       upload_source, uploaded_by_admin_id, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE')
     RETURNING *`,
    [
      Number(userId),
      campaignId != null ? Number(campaignId) : null,
      normalizedSide,
      uploaded.fileKey,
      file.originalname ? String(file.originalname).slice(0, 255) : null,
      file.mimetype ? String(file.mimetype).slice(0, 80) : null,
      uploaded.bytes != null ? Number(uploaded.bytes) : Number(file.size || file.buffer.length || 0),
      uploadSource,
      uploadedByAdminId != null ? Number(uploadedByAdminId) : null,
    ],
  );
  return { row: rows[0], fileKey: uploaded.fileKey };
}

async function saveSignedDocuments(client, {
  userId,
  campaignId = null,
  documentTypeIds,
  confirmationSource = "ADMIN",
  confirmedByAdminId = null,
  notes = null,
}) {
  const ids = [...new Set((documentTypeIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  for (const typeId of ids) {
    await client.query(
      `INSERT INTO legacy_freelancer_signed_documents (
         user_id, campaign_id, document_type_id, confirmation_source,
         confirmed_by_admin_id, notes, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (user_id, document_type_id) DO UPDATE SET
         is_active = TRUE,
         confirmed_at = NOW(),
         confirmation_source = EXCLUDED.confirmation_source,
         confirmed_by_admin_id = EXCLUDED.confirmed_by_admin_id,
         notes = COALESCE(EXCLUDED.notes, legacy_freelancer_signed_documents.notes),
         campaign_id = COALESCE(EXCLUDED.campaign_id, legacy_freelancer_signed_documents.campaign_id),
         updated_at = NOW()`,
      [
        Number(userId),
        campaignId != null ? Number(campaignId) : null,
        typeId,
        confirmationSource,
        confirmedByAdminId != null ? Number(confirmedByAdminId) : null,
        notes != null ? String(notes).slice(0, 2000) : null,
      ],
    );
  }
  return ids;
}

async function listLegacyFreelancers({ q = null, filters = {}, page = 1, pageSize = 25 } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const offset = (safePage - 1) * safeSize;
  const params = [];
  const where = [`u.onboarding_source = 'LEGACY_INVITE'`];

  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    const qi = `$${params.length}`;
    params.push(String(q).trim().replace(/\D/g, ""));
    const qDigits = `$${params.length}`;
    where.push(`(
      u.first_name ILIKE ${qi} OR u.father_name ILIKE ${qi} OR u.family_name ILIKE ${qi}
      OR u.email ILIKE ${qi} OR u.phone ILIKE ${qi} OR u.account_id ILIKE ${qi}
      OR (u.freelancer_member_id IS NOT NULL AND (
        u.freelancer_member_id ILIKE ${qi}
        OR (${qDigits} <> '' AND u.freelancer_member_id = ${qDigits})
      ))
    )`);
  }

  if (filters.entryMethod) {
    params.push(String(filters.entryMethod).toUpperCase());
    where.push(`u.legacy_entry_method = $${params.length}`);
  }
  if (filters.isActive != null && filters.isActive !== "") {
    params.push(filters.isActive === true || filters.isActive === "true" || filters.isActive === "1");
    where.push(`u.is_active = $${params.length}`);
  }
  if (filters.planId) {
    params.push(Number(filters.planId));
    where.push(`fs.plan_id = $${params.length}`);
  }
  if (filters.packageStatus === "active") {
    where.push(`fs.status = 'active' AND (fs.expiry_date IS NULL OR fs.expiry_date > NOW())`);
  } else if (filters.packageStatus === "expired") {
    where.push(`(fs.expiry_date IS NOT NULL AND fs.expiry_date <= NOW())`);
  }
  if (filters.identityComplete === true || filters.identityComplete === "true") {
    where.push(`COALESCE(idc.front_ok, FALSE) AND COALESCE(idc.back_ok, FALSE)`);
  } else if (filters.identityComplete === false || filters.identityComplete === "false") {
    where.push(`NOT (COALESCE(idc.front_ok, FALSE) AND COALESCE(idc.back_ok, FALSE))`);
  }
  if (filters.joinedFrom) {
    params.push(new Date(filters.joinedFrom).toISOString());
    where.push(`u.created_at >= $${params.length}::timestamptz`);
  }
  if (filters.joinedTo) {
    params.push(new Date(filters.joinedTo).toISOString());
    where.push(`u.created_at <= $${params.length}::timestamptz`);
  }
  if (filters.campaignId != null && filters.campaignId !== "") {
    params.push(Number(filters.campaignId));
    where.push(`u.legacy_invite_campaign_id = $${params.length}::bigint`);
  }
  if (filters.workField) {
    const key = String(filters.workField).trim();
    if (key) {
      params.push(key);
      // Prefer dedicated legacy_work_areas; transitional OR against skills for pre-196 rows.
      where.push(`(
        (u.legacy_work_areas IS NOT NULL AND $${params.length}::text = ANY(u.legacy_work_areas))
        OR (
          (u.legacy_work_areas IS NULL OR cardinality(u.legacy_work_areas) = 0)
          AND u.skills IS NOT NULL
          AND $${params.length}::text = ANY(u.skills)
        )
      )`);
    }
  }

  const whereSql = where.join(" AND ");
  const countParams = [...params];
  const listParams = [...params, safeSize, offset];

  const sqlFrom = `
    FROM users u
    LEFT JOIN LATERAL (
      SELECT fs0.*
        FROM freelancer_subscriptions fs0
       WHERE fs0.freelancer_user_id = u.id AND fs0.is_current = TRUE
       ORDER BY fs0.id DESC
       LIMIT 1
    ) fs ON TRUE
    LEFT JOIN plans p ON p.id = fs.plan_id
    LEFT JOIN LATERAL (
      SELECT
        BOOL_OR(side = 'FRONT' AND status = 'ACTIVE') AS front_ok,
        BOOL_OR(side = 'BACK' AND status = 'ACTIVE') AS back_ok
        FROM legacy_freelancer_identity_documents d
       WHERE d.user_id = u.id
    ) idc ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE sd.is_active) AS signed_count
        FROM legacy_freelancer_signed_documents sd
       WHERE sd.user_id = u.id
    ) sdc ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(m.amount) FILTER (WHERE NOT m.is_voided), 0) AS money_total,
        COUNT(*) FILTER (WHERE NOT m.is_voided) AS money_count
        FROM legacy_freelancer_historical_money_received m
       WHERE m.user_id = u.id
    ) hm ON TRUE
    WHERE ${whereSql}
  `;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total ${sqlFrom}`,
    countParams,
  );
  const total = Number(countRows[0]?.total || 0);

  const { rows } = await pool.query(
    `SELECT
       u.id, u.account_id, u.first_name, u.father_name, u.family_name,
       u.email, u.phone, u.is_active, u.created_at, u.legacy_entry_method,
       u.freelancer_member_id, u.freelancer_categories, u.skills, u.legacy_work_areas,
       fs.plan_id, fs.status AS sub_status, fs.actual_start_date, fs.expiry_date,
       p.name AS plan_name, p.title AS plan_title,
       COALESCE(idc.front_ok, FALSE) AS identity_front_ok,
       COALESCE(idc.back_ok, FALSE) AS identity_back_ok,
       COALESCE(sdc.signed_count, 0)::int AS signed_docs_count,
       COALESCE(hm.money_total, 0)::numeric AS historical_money_total,
       COALESCE(hm.money_count, 0)::int AS historical_money_count
     ${sqlFrom}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );

  return {
    items: rows.map((r) => ({
      id: String(r.id),
      accountId: r.account_id,
      fullName: [r.first_name, r.father_name, r.family_name].filter(Boolean).join(" "),
      firstName: r.first_name,
      fatherName: r.father_name,
      familyName: r.family_name,
      email: r.email,
      phone: r.phone,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      legacyEntryMethod: r.legacy_entry_method || null,
      freelancerMemberIdMasked: maskFreelancerMemberId(r.freelancer_member_id),
      categories: r.freelancer_categories || null,
      workFields: resolveLegacyWorkAreasFromUserRow(r),
      plan: r.plan_id
        ? {
            id: String(r.plan_id),
            name: r.plan_name,
            title: r.plan_title,
            status: r.sub_status,
            startsAt: r.actual_start_date,
            expiresAt: r.expiry_date,
          }
        : null,
      identity: {
        frontOk: Boolean(r.identity_front_ok),
        backOk: Boolean(r.identity_back_ok),
        complete: Boolean(r.identity_front_ok) && Boolean(r.identity_back_ok),
      },
      signedDocuments: {
        count: Number(r.signed_docs_count || 0),
      },
      historicalMoney: {
        total: Number(r.historical_money_total || 0),
        count: Number(r.historical_money_count || 0),
        currency: "JOD",
      },
    })),
    page: safePage,
    pageSize: safeSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / safeSize)),
  };
}

async function getLegacyFreelancerDetail(userId) {
  const user = await assertLegacyUser(null, userId);
  const uid = Number(userId);

  const [
    { rows: subRows },
    { rows: identityRows },
    { rows: signedRows },
    { rows: packageRows },
    { rows: moneyRows },
  ] = await Promise.all([
    pool.query(
      `SELECT fs.*, p.name AS plan_name, p.title AS plan_title
         FROM freelancer_subscriptions fs
         LEFT JOIN plans p ON p.id = fs.plan_id
        WHERE fs.freelancer_user_id = $1 AND fs.is_current = TRUE
        ORDER BY fs.id DESC LIMIT 1`,
      [uid],
    ),
    pool.query(
      `SELECT * FROM legacy_freelancer_identity_documents
        WHERE user_id = $1 AND status = 'ACTIVE'
        ORDER BY side ASC`,
      [uid],
    ),
    pool.query(
      `SELECT sd.*, t.code, t.label_ar
         FROM legacy_freelancer_signed_documents sd
         JOIN legacy_freelancer_document_types t ON t.id = sd.document_type_id
        WHERE sd.user_id = $1
        ORDER BY t.sort_order ASC, sd.id ASC`,
      [uid],
    ),
    pool.query(
      `SELECT a.*, p.name AS plan_name, p.title AS plan_title
         FROM legacy_freelancer_package_assignments a
         LEFT JOIN plans p ON p.id = a.plan_id
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC, a.id DESC`,
      [uid],
    ),
    pool.query(
      `SELECT * FROM legacy_freelancer_historical_money_received
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC`,
      [uid],
    ),
  ]);

  const moneyActive = moneyRows.filter((m) => !m.is_voided);
  const moneyTotal = moneyActive.reduce((sum, m) => sum + Number(m.amount || 0), 0);
  const sub = subRows[0] || null;

  return {
    id: String(user.id),
    accountId: user.account_id,
    firstName: user.first_name,
    fatherName: user.father_name,
    familyName: user.family_name,
    fullName: [user.first_name, user.father_name, user.family_name].filter(Boolean).join(" "),
    email: user.email,
    phone: user.phone,
    isActive: Boolean(user.is_active),
    legacyEntryMethod: user.legacy_entry_method || null,
    freelancerMemberId: user.freelancer_member_id || null,
    freelancerMemberIdMasked: maskFreelancerMemberId(user.freelancer_member_id),
    workFields: resolveLegacyWorkAreasFromUserRow(user),
    detailedSkills: Array.isArray(user.skills) ? user.skills : [],
    plan: sub
      ? {
          id: String(sub.plan_id),
          name: sub.plan_name,
          title: sub.plan_title,
          status: sub.status,
          startsAt: sub.actual_start_date,
          expiresAt: sub.expiry_date,
          subscriptionId: String(sub.id),
          paymentStatus: sub.payment_status,
          activationStatus: sub.activation_status,
          notes: sub.notes || null,
        }
      : null,
    identityDocuments: identityRows.map(mapIdentityDocPublic),
    signedDocuments: signedRows.map(mapSignedDocPublic),
    packageHistory: packageRows.map(mapPackageAssignmentPublic),
    historicalMoney: {
      total: moneyTotal,
      count: moneyActive.length,
      currency: "JOD",
      records: moneyRows.map(mapMoneyPublic),
      informationalOnly: true,
    },
  };
}

async function createManualLegacyFreelancer(payload, { actorAdminId, files = {} } = {}) {
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createPublicApiError("البريد الإلكتروني غير صالح.", 400, "VALIDATION_ERROR");
  }
  const phone = composeE164(payload.phone);
  const firstName = String(payload.firstName || payload.first_name || "").trim();
  const fatherName = String(payload.fatherName || payload.father_name || "").trim();
  const familyName = String(payload.familyName || payload.family_name || "").trim();
  if (!firstName || !fatherName || !familyName) {
    throw createPublicApiError("الاسم الأول واسم الأب واسم العائلة مطلوبة.", 400, "VALIDATION_ERROR");
  }
  const nationalId = normalizeAndValidateNationalId(
    payload.nationalId ?? payload.national_id ?? payload.freelancerMemberId,
    { required: true },
  );
  const country = payload.country ? String(payload.country).trim().toUpperCase().slice(0, 2) : "JO";
  const genderRaw = String(payload.gender || "").trim();
  const gender = genderRaw === "أنثى" || genderRaw === "female" ? "أنثى" : "ذكر";
  const city = payload.city ? String(payload.city).trim().slice(0, 120) : null;
  const trust = String(payload.trustLevel || payload.defaultTrustLevel || TRUST_LEVELS.APPROVED).toUpperCase();
  if (!Object.values(TRUST_LEVELS).includes(trust)) {
    throw createPublicApiError("مستوى الثقة غير صالح.", 400, "VALIDATION_ERROR");
  }

  let categories = null;
  if (Array.isArray(payload.categories) && payload.categories.length) {
    categories = [...new Set(payload.categories.map(String))].sort();
  } else if (payload.specialization || payload.specialty) {
    categories = [String(payload.specialization || payload.specialty).trim()].filter(Boolean);
  }

  let workFieldKeys;
  try {
    workFieldKeys = normalizeLegacyWorkFields(
      payload.workFields ?? payload.work_fields,
      { required: true },
    );
  } catch (wfErr) {
    if (wfErr && wfErr.code === "WORK_FIELDS_REQUIRED") {
      throw createPublicApiError(WORK_FIELDS_REQUIRED_MESSAGE, 400, "WORK_FIELDS_REQUIRED");
    }
    throw wfErr;
  }

  // Prefer explicit categories; otherwise mirror declared work fields (no silent fabrications).
  if (!categories || !categories.length) {
    categories = workFieldKeys.length ? [...workFieldKeys] : null;
  }

  const planId = payload.planId != null && payload.planId !== ""
    ? Number(payload.planId)
    : ORDERZHOUSE_FREE_PLAN_ID;
  const durationMonths =
    payload.durationMonths != null && payload.durationMonths !== ""
      ? Number(payload.durationMonths)
      : null;
  const startsAt = payload.startsAt ? new Date(payload.startsAt) : new Date();

  const passwordHash = await bcrypt.hash(nationalId, BCRYPT_ROUNDS);
  if (!passwordHash.startsWith("$2")) {
    throw createPublicApiError("تعذّر تأمين كلمة المرور.", 500, "HASH_FAILED");
  }

  const signedTypeIds = Array.isArray(payload.signedDocumentTypeIds)
    ? payload.signedDocumentTypeIds
    : Array.isArray(payload.signed_document_type_ids)
      ? payload.signed_document_type_ids
      : [];

  const idFront = files.idFront || files.front || null;
  const idBack = files.idBack || files.back || null;
  const uploadedKeys = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: memberDup } = await client.query(
      `SELECT id FROM users
        WHERE onboarding_source = 'LEGACY_INVITE' AND freelancer_member_id = $1
        LIMIT 1`,
      [nationalId],
    );
    if (memberDup[0]) throw duplicateNationalIdError();

    const { rows: emailRows } = await client.query(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    const { rows: phoneRows } = await client.query(`SELECT id FROM users WHERE phone = $1 LIMIT 1`, [phone]);
    if (emailRows[0] || phoneRows[0]) {
      throw createPublicApiError(
        "يوجد حساب مسجل بهذا البريد أو الرقم. الرجاء التواصل مع الإدارة.",
        409,
        "ACCOUNT_EXISTS",
      );
    }

    const accountId = await generateUniqueAccountId(client);
    const nowIso = new Date().toISOString();

    const { rows: userRows } = await client.query(
      `INSERT INTO users (
         account_id, first_name, father_name, family_name, email, password_hash, role,
         country, phone, whatsapp, gender, terms_accepted, terms_accepted_at,
         privacy_accepted, privacy_accepted_at,
         freelancer_categories, email_verified, is_active,
         onboarding_source, legacy_invite_campaign_id,
         identity_verification_source,
         training_waiver_reason, final_exam_waiver_reason,
         legacy_verified_at, legacy_verified_by_admin_id,
         freelancer_member_id, legacy_entry_method, must_change_password,
         billing_city, legacy_work_areas
       ) VALUES (
         $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
         $8::text, $9::text, $9::text, $10::text, TRUE, $11::timestamptz,
         TRUE, $11::timestamptz,
         $12::text[], TRUE, TRUE,
         'LEGACY_INVITE', NULL,
         'COMPANY_OFFLINE_VERIFIED',
         $13::text, $14::text,
         $11::timestamptz, $15::bigint,
         $16::text, 'ADMIN_MANUAL', TRUE,
         $17::text, $18::text[]
       )
       RETURNING id, account_id, freelancer_member_id, first_name, father_name, family_name,
                 email, role, phone, is_active, created_at, onboarding_source,
                 legacy_entry_method, must_change_password, password_hash`,
      [
        accountId,
        firstName,
        fatherName,
        familyName,
        email,
        passwordHash,
        ROLES.FREELANCER,
        country,
        phone,
        gender,
        nowIso,
        categories,
        TRAINING_WAIVER_REASON,
        FINAL_EXAM_WAIVER_REASON,
        actorAdminId != null ? Number(actorAdminId) : null,
        nationalId,
        city,
        workFieldKeys,
      ],
    );
    const user = userRows[0];
    if (!String(user.password_hash || "").startsWith("$2")) {
      throw createPublicApiError("تعذّر تأمين كلمة المرور.", 500, "HASH_FAILED");
    }
    delete user.password_hash;

    await ensureUserRole({ userId: user.id, roleName: ROLES.FREELANCER, client });

    if (Number.isInteger(durationMonths) && durationMonths >= 1) {
      const expiresAt = addMonthsUtc(startsAt, durationMonths);
      await assignLegacySubscription(client, {
        freelancerUserId: user.id,
        planId,
        actorAdminId,
        startsAt,
        expiresAt,
        durationMonths,
        notes: "LEGACY_ADMIN_ASSIGNMENT",
        assignmentSource: "LEGACY_ADMIN_ASSIGNMENT",
      });
    } else {
      await assignLegacySubscription(client, {
        freelancerUserId: user.id,
        planId,
        actorAdminId,
        notes: "Legacy company freelancer admin manual create",
        assignmentSource: "LEGACY_ADMIN_ASSIGNMENT",
      });
    }

    await waiveTrainingAndExam(client, {
      freelancerUserId: user.id,
      actorAdminId,
    });

    await upsertTrustRank(client, {
      freelancerUserId: user.id,
      trustLevel: trust,
      notes: "Legacy admin manual create",
    });

    if (idFront) {
      const stored = await storeIdentityDocument(client, {
        userId: user.id,
        side: "FRONT",
        file: idFront,
        uploadSource: "ADMIN",
        uploadedByAdminId: actorAdminId,
      });
      uploadedKeys.push(stored.fileKey);
    }
    if (idBack) {
      const stored = await storeIdentityDocument(client, {
        userId: user.id,
        side: "BACK",
        file: idBack,
        uploadSource: "ADMIN",
        uploadedByAdminId: actorAdminId,
      });
      uploadedKeys.push(stored.fileKey);
    }

    if (signedTypeIds.length) {
      await saveSignedDocuments(client, {
        userId: user.id,
        documentTypeIds: signedTypeIds,
        confirmationSource: "ADMIN",
        confirmedByAdminId: actorAdminId,
      });
    }

    if (payload.historicalAmount != null && payload.historicalAmount !== "") {
      const amount = Number(payload.historicalAmount);
      if (Number.isFinite(amount) && amount > 0) {
        await client.query(
          `INSERT INTO legacy_freelancer_historical_money_received
             (user_id, amount, currency, received_at, note, recorded_by_admin_id)
           VALUES ($1,$2,'JOD',$3,$4,$5)`,
          [
            user.id,
            amount.toFixed(2),
            payload.historicalReceivedAt || null,
            payload.historicalNote != null ? String(payload.historicalNote).slice(0, 2000) : null,
            actorAdminId != null ? Number(actorAdminId) : null,
          ],
        );
      }
    }

    await writeAudit(client, {
      action: AUDIT_ACTIONS.MANUAL_CREATED,
      actorAdminId,
      targetUserId: user.id,
      detail: {
        userId: String(user.id),
        emailMasked: maskEmail(email),
        phoneMasked: maskPhone(phone),
        memberIdMasked: maskFreelancerMemberId(nationalId),
        entryMethod: "ADMIN_MANUAL",
        planId: String(planId),
        hasIdentityFront: Boolean(idFront),
        hasIdentityBack: Boolean(idBack),
        signedDocCount: signedTypeIds.length,
        mustChangePassword: true,
        institutionId:
          payload.institutionId != null && payload.institutionId !== ""
            ? String(payload.institutionId)
            : payload.institution_id != null && payload.institution_id !== ""
              ? String(payload.institution_id)
              : null,
      },
    });

    const rawInstitutionId = payload.institutionId ?? payload.institution_id ?? null;
    if (rawInstitutionId != null && rawInstitutionId !== "") {
      const institutionsService = require("./institutionsService");
      await institutionsService.ensureActiveMembership(client, {
        institutionId: rawInstitutionId,
        userId: user.id,
        memberRole: "member",
        actorUserId: actorAdminId,
        source: "legacy_admin_manual",
      });
    }

    await client.query("COMMIT");

    return {
      user: {
        id: String(user.id),
        accountId: user.account_id,
        firstName: user.first_name,
        fatherName: user.father_name,
        familyName: user.family_name,
        email: user.email,
        phone: user.phone,
        freelancerMemberIdMasked: maskFreelancerMemberId(user.freelancer_member_id),
        legacyEntryMethod: user.legacy_entry_method,
        mustChangePassword: true,
        onboardingSource: user.onboarding_source,
      },
      message:
        "تم إنشاء الحساب. كلمة المرور الأولية هي الرقم الوطني، وسيُطلب من الفريلانسر تغييرها عند أول تسجيل دخول.",
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    // Best-effort cleanup of uploaded identity objects after failed create.
    for (const key of uploadedKeys) {
      try {
        if (String(key).startsWith("local:")) {
          const rel = String(key).slice("local:".length).replace(/^[/\\]+/, "");
          const abs = path.join(__dirname, "..", "..", "uploads", ...rel.split("/"));
          await fsp.unlink(abs).catch(() => {});
        }
      } catch (_) {
        /* ignore */
      }
    }
    if (err.code === "23505") {
      if (isLegacyMemberIdUniqueViolation(err)) throw duplicateNationalIdError();
      throw createPublicApiError(
        "يوجد حساب مسجل بهذا البريد أو الرقم. الرجاء التواصل مع الإدارة.",
        409,
        "ACCOUNT_EXISTS",
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

async function assignPackage({
  userId,
  planId,
  durationMonths,
  startsAt = null,
  notes = null,
  actorAdminId = null,
  source = "LEGACY_ADMIN_ASSIGNMENT",
}) {
  const months = Number(durationMonths);
  if (!Number.isInteger(months) || months < 1 || months > 120) {
    throw createPublicApiError("مدة الباقة غير صالحة.", 400, "VALIDATION_ERROR");
  }
  const pid = Number(planId);
  if (!Number.isInteger(pid) || pid < 1) {
    throw createPublicApiError("الباقة غير صالحة.", 400, "VALIDATION_ERROR");
  }
  const start = startsAt ? new Date(startsAt) : new Date();
  if (!Number.isFinite(start.getTime())) {
    throw createPublicApiError("تاريخ البداية غير صالح.", 400, "VALIDATION_ERROR");
  }
  const expiresAt = addMonthsUtc(start, months);
  const assignmentSource =
    source === "LEGACY_BULK_ASSIGNMENT" ? "LEGACY_BULK_ASSIGNMENT" : "LEGACY_ADMIN_ASSIGNMENT";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertLegacyUser(client, userId);

    const { rows: planRows } = await client.query(
      `SELECT id, name FROM plans WHERE id = $1::bigint AND deleted_at IS NULL LIMIT 1`,
      [pid],
    );
    if (!planRows[0]) throw createPublicApiError("الباقة غير موجودة.", 404, "PLAN_NOT_FOUND");

    const subscription = await assignLegacySubscription(client, {
      freelancerUserId: userId,
      planId: pid,
      actorAdminId,
      startsAt: start,
      expiresAt,
      durationMonths: months,
      notes: notes || "LEGACY_ADMIN_ASSIGNMENT",
      assignmentSource,
    });

    await writeAudit(client, {
      action: AUDIT_ACTIONS.PACKAGE_ASSIGNED,
      actorAdminId,
      targetUserId: userId,
      detail: {
        userId: String(userId),
        planId: String(pid),
        planName: planRows[0].name,
        durationMonths: months,
        startsAt: start.toISOString(),
        expiresAt: expiresAt.toISOString(),
        assignmentSource,
      },
    });
    await client.query("COMMIT");
    return { subscription, startsAt: start, expiresAt, durationMonths: months, planId: pid };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function bulkAssignPackage({
  userIds,
  planId,
  durationMonths,
  startsAt = null,
  notes = null,
  actorAdminId = null,
}) {
  const ids = [...new Set((userIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) {
    throw createPublicApiError("لم يتم تحديد أي فريلانسر.", 400, "VALIDATION_ERROR");
  }
  const selected = ids.length;
  const updated = [];
  const skipped = [];
  const failed = [];

  for (const uid of ids) {
    try {
      await assignPackage({
        userId: uid,
        planId,
        durationMonths,
        startsAt,
        notes,
        actorAdminId,
        source: "LEGACY_BULK_ASSIGNMENT",
      });
      updated.push(String(uid));
    } catch (err) {
      const code = err.publicCode || err.code || "ERROR";
      if (code === "NOT_LEGACY_FREELANCER" || code === "NOT_FOUND") {
        skipped.push({ userId: String(uid), reason: code, message: err.message });
      } else {
        failed.push({ userId: String(uid), reason: code, message: err.message });
      }
    }
  }

  const client = await pool.connect();
  try {
    await writeAudit(client, {
      action: AUDIT_ACTIONS.PACKAGE_BULK_ASSIGNED,
      actorAdminId,
      detail: {
        selected,
        updated: updated.length,
        skipped: skipped.length,
        failed: failed.length,
        planId: String(planId),
        durationMonths: Number(durationMonths),
      },
    });
  } finally {
    client.release();
  }

  return { selected, updated: updated.length, skipped, failed, updatedUserIds: updated };
}

async function setSignedDocument({
  userId,
  documentTypeId,
  notes = null,
  actorAdminId = null,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertLegacyUser(client, userId);
    const typeId = Number(documentTypeId);
    const { rows: typeRows } = await client.query(
      `SELECT id, code FROM legacy_freelancer_document_types WHERE id = $1::bigint LIMIT 1`,
      [typeId],
    );
    if (!typeRows[0]) throw createPublicApiError("نوع المستند غير موجود.", 404, "NOT_FOUND");

    const { rows: prevRows } = await client.query(
      `SELECT is_active FROM legacy_freelancer_signed_documents
        WHERE user_id = $1::bigint AND document_type_id = $2::bigint
        LIMIT 1`,
      [Number(userId), typeId],
    );
    const previousActive = Boolean(prevRows[0]?.is_active);

    await saveSignedDocuments(client, {
      userId,
      documentTypeIds: [typeId],
      confirmationSource: "ADMIN",
      confirmedByAdminId: actorAdminId,
      notes,
    });
    await writeAudit(client, {
      action: AUDIT_ACTIONS.SIGNED_DOC_SET,
      actorAdminId,
      targetUserId: userId,
      detail: {
        documentTypeId: String(typeId),
        code: typeRows[0].code,
        previousState: previousActive ? "signed" : "unsigned",
        newState: "signed",
      },
    });
    await client.query("COMMIT");
    return getLegacyFreelancerDetail(userId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function removeSignedDocument({ userId, documentTypeId, actorAdminId = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertLegacyUser(client, userId);
    const { rows } = await client.query(
      `UPDATE legacy_freelancer_signed_documents
          SET is_active = FALSE, updated_at = NOW()
        WHERE user_id = $1::bigint AND document_type_id = $2::bigint
        RETURNING id, document_type_id`,
      [Number(userId), Number(documentTypeId)],
    );
    if (!rows[0]) throw createPublicApiError("تأكيد المستند غير موجود.", 404, "NOT_FOUND");
    await writeAudit(client, {
      action: AUDIT_ACTIONS.SIGNED_DOC_REMOVED,
      actorAdminId,
      targetUserId: userId,
      detail: {
        documentTypeId: String(documentTypeId),
        previousState: "signed",
        newState: "unsigned",
      },
    });
    await client.query("COMMIT");
    return { removed: true, documentTypeId: String(documentTypeId) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function addHistoricalMoney({
  userId,
  amount,
  currency = "JOD",
  receivedAt = null,
  note = null,
  actorAdminId = null,
}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw createPublicApiError("المبلغ يجب أن يكون أكبر من صفر.", 400, "VALIDATION_ERROR");
  }
  const cur = String(currency || "JOD")
    .trim()
    .toUpperCase()
    .slice(0, 3);
  if (!/^[A-Z]{3}$/.test(cur)) {
    throw createPublicApiError("العملة غير صالحة.", 400, "VALIDATION_ERROR");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertLegacyUser(client, userId);
    const { rows } = await client.query(
      `INSERT INTO legacy_freelancer_historical_money_received
         (user_id, amount, currency, received_at, note, recorded_by_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        Number(userId),
        amt.toFixed(2),
        cur,
        receivedAt || null,
        note != null ? String(note).slice(0, 2000) : null,
        actorAdminId != null ? Number(actorAdminId) : null,
      ],
    );
    await writeAudit(client, {
      action: AUDIT_ACTIONS.HISTORICAL_MONEY_ADDED,
      actorAdminId,
      targetUserId: userId,
      detail: {
        recordId: String(rows[0].id),
        amount: Number(rows[0].amount),
        currency: cur,
        informationalOnly: true,
      },
    });
    await client.query("COMMIT");
    return mapMoneyPublic(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function voidHistoricalMoney({ userId, id, voidReason = null, actorAdminId = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertLegacyUser(client, userId);
    const { rows } = await client.query(
      `UPDATE legacy_freelancer_historical_money_received
          SET is_voided = TRUE,
              voided_at = NOW(),
              voided_by_admin_id = $3,
              void_reason = $4,
              updated_at = NOW()
        WHERE id = $1::bigint AND user_id = $2::bigint AND is_voided = FALSE
        RETURNING *`,
      [
        Number(id),
        Number(userId),
        actorAdminId != null ? Number(actorAdminId) : null,
        voidReason != null ? String(voidReason).slice(0, 2000) : null,
      ],
    );
    if (!rows[0]) throw createPublicApiError("السجل غير موجود أو ملغى مسبقاً.", 404, "NOT_FOUND");
    await writeAudit(client, {
      action: AUDIT_ACTIONS.HISTORICAL_MONEY_VOIDED,
      actorAdminId,
      targetUserId: userId,
      detail: { recordId: String(id), informationalOnly: true },
    });
    await client.query("COMMIT");
    return mapMoneyPublic(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function replaceIdentityDocument({ userId, side, file, actorAdminId = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertLegacyUser(client, userId);
    const { row } = await storeIdentityDocument(client, {
      userId,
      side,
      file,
      uploadSource: "ADMIN",
      uploadedByAdminId: actorAdminId,
    });
    await writeAudit(client, {
      action: AUDIT_ACTIONS.IDENTITY_REPLACED,
      actorAdminId,
      targetUserId: userId,
      detail: {
        side: normalizeSide(side),
        mimeType: row.mime_type || null,
        fileSize: row.file_size != null ? Number(row.file_size) : null,
      },
    });
    await client.query("COMMIT");
    return mapIdentityDocPublic(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function resolveStorageBytes(storageKey) {
  const key = String(storageKey || "");
  if (key.startsWith("local:")) {
    const rel = key.slice("local:".length).replace(/^[/\\]+/, "");
    const abs = path.join(__dirname, "..", "..", "uploads", ...rel.split("/"));
    const uploadsRoot = path.join(__dirname, "..", "..", "uploads");
    if (!abs.startsWith(uploadsRoot)) {
      throw createPublicApiError("مفتاح التخزين غير صالح.", 400, "INVALID_STORAGE_KEY");
    }
    await fsp.access(abs, fs.constants.R_OK);
    const buffer = await fsp.readFile(abs);
    return { buffer };
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
    const upstream = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "image/*,*/*" },
    });
    if (!upstream.ok) {
      throw createPublicApiError("تعذر تحميل صورة الهوية الآن. حاول مرة أخرى.", 502, "STORAGE_UNAVAILABLE");
    }
    const arr = await upstream.arrayBuffer();
    return { buffer: Buffer.from(arr) };
  }
  throw createPublicApiError("مفتاح التخزين غير مدعوم.", 500, "UNSUPPORTED_STORAGE");
}

async function getIdentityFileBytes({ userId, side, actorAdminId = null }) {
  const normalizedSide = normalizeSide(side);
  await assertLegacyUser(null, userId);
  const { rows } = await pool.query(
    `SELECT * FROM legacy_freelancer_identity_documents
      WHERE user_id = $1::bigint AND side = $2 AND status = 'ACTIVE'
      LIMIT 1`,
    [Number(userId), normalizedSide],
  );
  const row = rows[0];
  if (!row) {
    throw createPublicApiError("لم يتم العثور على صورة الهوية.", 404, "IDENTITY_NOT_FOUND");
  }

  // Audit view without storage key / PII
  try {
    await writeAudit(pool, {
      action: AUDIT_ACTIONS.IDENTITY_VIEWED,
      actorAdminId,
      targetUserId: userId,
      detail: { side: normalizedSide },
    });
  } catch (_) {
    /* non-fatal */
  }

  const { buffer } = await resolveStorageBytes(row.storage_key);
  return {
    buffer,
    mimeType: row.mime_type || "image/jpeg",
    originalName: row.original_name || `${normalizedSide.toLowerCase()}.jpg`,
  };
}

/**
 * Legacy: campaign document requirements are an Admin checklist only.
 * Public registration must NEVER call this to block or persist signed docs.
 * Kept for Admin tooling / historical compatibility — no longer used by invite register.
 */
async function validateAndPersistRegistrationSignedDocs(client, {
  campaignId,
  userId,
  signedDocumentTypeIds,
}) {
  // Do not enforce required docs against public self-registration.
  // If invoked, only persist Admin-style selections that are enabled for the campaign.
  const reqs = await client.query(
    `SELECT r.document_type_id, r.is_enabled, r.is_required, t.code, t.label_ar
       FROM legacy_freelancer_campaign_document_requirements r
       JOIN legacy_freelancer_document_types t ON t.id = r.document_type_id
      WHERE r.campaign_id = $1::bigint`,
    [Number(campaignId)],
  );
  const enabled = new Map();
  for (const r of reqs.rows) {
    if (r.is_enabled) {
      enabled.set(Number(r.document_type_id), r);
    }
  }

  const selected = [
    ...new Set(
      (signedDocumentTypeIds || [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0 && enabled.has(n)),
    ),
  ];

  if (selected.length) {
    await saveSignedDocuments(client, {
      userId,
      campaignId,
      documentTypeIds: selected,
      confirmationSource: "SELF_REGISTRATION",
    });
  }
  return selected;
}

module.exports = {
  AUDIT_ACTIONS,
  ensureDefaultCampaignDocumentRequirements,
  listLegacyFreelancers,
  getLegacyFreelancerDetail,
  createManualLegacyFreelancer,
  assignPackage,
  bulkAssignPackage,
  listDocumentTypes,
  createDocumentType,
  updateDocumentType,
  getCampaignDocumentRequirements,
  replaceCampaignDocumentRequirements,
  setSignedDocument,
  removeSignedDocument,
  addHistoricalMoney,
  voidHistoricalMoney,
  replaceIdentityDocument,
  getIdentityFileBytes,
  storeIdentityDocument,
  validateAndPersistRegistrationSignedDocs,
  addMonthsUtc,
};
