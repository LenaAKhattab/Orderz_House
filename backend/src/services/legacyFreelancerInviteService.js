/**
 * Legacy Freelancer Fast Track — Shared Invite Link.
 * One campaign link; freelancers self-register. No wallets/Stripe/ledger mutations.
 */

const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const { ROLES } = require("../constants/roles");
const { ensureUserRole, resolveAuthzContext } = require("./rbacService");
const { createPublicApiError } = require("../utils/publicApiError");
const { getPrimaryClientUrl } = require("../config/clientUrl");
const { ORDERZHOUSE_FREE_PLAN_ID, ORDERZHOUSE_FREE_PLAN_NAME } = require("../constants/orderzhousePlansCatalog");
const {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_SOURCES,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_ACTIVATION_STATUSES,
  endCurrentSubscription,
  mapSubscription,
  evaluateFreelancerTakeOrdersEligibility,
} = require("./subscriptionsService");
const {
  normalizeAndValidateNationalId,
  maskFreelancerMemberId,
  isLegacyMemberIdUniqueViolation,
  duplicateNationalIdError,
} = require("../utils/legacyFreelancerMemberId");

const BCRYPT_ROUNDS = 12;
const TOKEN_BYTES = 32;
const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ACCOUNT_ID_ATTEMPTS = 25;

const AUDIT_ACTIONS = Object.freeze({
  CAMPAIGN_CREATED: "LEGACY_FREELANCER_CAMPAIGN_CREATED",
  CAMPAIGN_UPDATED: "LEGACY_FREELANCER_CAMPAIGN_UPDATED",
  CAMPAIGN_REVOKED: "LEGACY_FREELANCER_CAMPAIGN_REVOKED",
  INVITE_REDEEMED: "LEGACY_FREELANCER_INVITE_REDEEMED",
  CAMPAIGN_INSTITUTION_CHANGED: "LEGACY_CAMPAIGN_INSTITUTION_CHANGED",
  REGISTRATION_JOINED_INSTITUTION: "LEGACY_REGISTRATION_JOINED_INSTITUTION",
});

function addMonthsUtc(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

const TRUST_LEVELS = Object.freeze({
  APPROVED: "APPROVED",
  TRUSTED: "TRUSTED",
});

const TRAINING_WAIVER_REASON = "Legacy company freelancer — offline training completed";
const FINAL_EXAM_WAIVER_REASON = "Legacy company freelancer — offline final exam waived";
const PLAN_ASSIGNMENT_REASON = "Legacy company freelancer shared invite";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function generateSecureToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function maskEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at < 1) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain || "?"}`;
}

function maskPhone(phone) {
  const p = String(phone || "").replace(/\s+/g, "");
  if (p.length < 4) return "***";
  return `${"*".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}`;
}

function normalizeSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function normalizePhonePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

function composeE164(raw) {
  if (typeof raw === "string" && raw.trim().startsWith("+")) {
    const e164 = normalizePhonePart(raw);
    if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
      throw createPublicApiError(
        "رقم الجوال يجب أن يكون بالصيغة الدولية (مثال: +9627xxxxxxxx).",
        400,
        "VALIDATION_ERROR",
      );
    }
    return e164;
  }
  const cc = normalizePhonePart(raw?.countryCode);
  const num = normalizePhonePart(raw?.number);
  const e164 = `${cc}${num}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw createPublicApiError(
      "رقم الجوال يجب أن يكون بالصيغة الدولية (مثال: +9627xxxxxxxx).",
      400,
      "VALIDATION_ERROR",
    );
  }
  return e164;
}

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    throw createPublicApiError("الاسم الكامل مطلوب.", 400, "VALIDATION_ERROR");
  }
  if (parts.length === 1) {
    return { firstName: parts[0], fatherName: parts[0], familyName: parts[0] };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], fatherName: parts[0], familyName: parts[1] };
  }
  return {
    firstName: parts[0],
    fatherName: parts.slice(1, -1).join(" "),
    familyName: parts[parts.length - 1],
  };
}

function generateAccountIdCandidate() {
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += ACCOUNT_ID_CHARS[crypto.randomInt(0, ACCOUNT_ID_CHARS.length)];
  }
  return out;
}

async function generateUniqueAccountId(client) {
  for (let i = 0; i < MAX_ACCOUNT_ID_ATTEMPTS; i += 1) {
    const id = generateAccountIdCandidate();
    const { rowCount } = await client.query("SELECT 1 FROM users WHERE account_id = $1::text", [id]);
    if (rowCount === 0) return id;
  }
  throw createPublicApiError("تعذّر إكمال التسجيل مؤقتاً. حاول لاحقاً.", 503, "SERVICE_UNAVAILABLE");
}

function publicBaseUrl() {
  return getPrimaryClientUrl() || "https://orderzhouse.com";
}

function buildPublicJoinUrl(slug, plaintextToken) {
  const base = publicBaseUrl();
  return `${base}/freelancer/legacy-join/${encodeURIComponent(slug)}?token=${encodeURIComponent(plaintextToken)}`;
}

function campaignUnavailableError(campaign) {
  if (!campaign) {
    return createPublicApiError("تم إيقاف رابط الدعوة.", 404, "LEGACY_INVITE_NOT_FOUND");
  }
  if (campaign.revoked_at || campaign.is_active === false) {
    return createPublicApiError("تم إيقاف رابط الدعوة.", 410, "LEGACY_INVITE_REVOKED");
  }
  if (campaign.expires_at && new Date(campaign.expires_at).getTime() <= Date.now()) {
    return createPublicApiError("انتهت صلاحية رابط الدعوة.", 410, "LEGACY_INVITE_EXPIRED");
  }
  if (Number(campaign.used_count) >= Number(campaign.max_redemptions)) {
    return createPublicApiError("اكتمل عدد المقاعد المتاحة لهذا الرابط.", 410, "LEGACY_INVITE_FULL");
  }
  return null;
}

function mapCampaignPublic(row, { includeJoinUrl = false, plaintextToken = null } = {}) {
  if (!row) return null;
  const remaining = Math.max(0, Number(row.max_redemptions) - Number(row.used_count));
  const out = {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    defaultPlanCode: row.default_plan_code,
    defaultPlanId: row.default_plan_id != null ? String(row.default_plan_id) : null,
    defaultTrustLevel: row.default_trust_level,
    defaultCategoryId: row.default_category_id != null ? String(row.default_category_id) : null,
    institutionId: row.institution_id != null ? String(row.institution_id) : null,
    institutionName: row.institution_name || null,
    institutionStatus: row.institution_status || null,
    maxRedemptions: Number(row.max_redemptions),
    usedCount: Number(row.used_count),
    remainingSeats: remaining,
    seatsLimited: true,
    expiresAt: row.expires_at,
    isActive: Boolean(row.is_active) && !row.revoked_at,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at || null,
    createdByAdminId: row.created_by_admin_id != null ? String(row.created_by_admin_id) : null,
  };
  if (includeJoinUrl && plaintextToken) {
    out.joinUrl = buildPublicJoinUrl(row.slug, plaintextToken);
    out.token = plaintextToken;
  }
  return out;
}

function mapCampaignPreview(row) {
  if (!row) return null;
  // Public preview must not expose seat capacity / remaining counts.
  return {
    name: row.name,
    slug: row.slug,
    expiresAt: row.expires_at,
    defaultTrustLevel: row.default_trust_level,
    defaultCategoryId: row.default_category_id != null ? String(row.default_category_id) : null,
    requireIdFront: Boolean(row.require_id_front),
    requireIdBack: Boolean(row.require_id_back),
  };
}

async function writeAudit(client, { action, actorAdminId = null, campaignId = null, targetUserId = null, detail = null }) {
  await client.query(
    `INSERT INTO legacy_freelancer_invite_audit_logs
      (action, actor_admin_id, campaign_id, target_user_id, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      action,
      actorAdminId != null ? Number(actorAdminId) : null,
      campaignId != null ? Number(campaignId) : null,
      targetUserId != null ? Number(targetUserId) : null,
      detail != null ? JSON.stringify(detail) : null,
    ],
  );
}

async function resolvePlanByCode(planCode, client) {
  const runner = client || pool;
  const code = String(planCode || ORDERZHOUSE_FREE_PLAN_NAME).trim();
  if (/^\d+$/.test(code)) {
    const { rows } = await runner.query(
      `SELECT id, name FROM plans WHERE id = $1::bigint AND deleted_at IS NULL LIMIT 1`,
      [Number(code)],
    );
    if (rows[0]) return { planId: Number(rows[0].id), planCode: rows[0].name };
  }
  const { rows } = await runner.query(
    `SELECT id, name FROM plans WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
    [code],
  );
  if (rows[0]) return { planId: Number(rows[0].id), planCode: rows[0].name };
  return { planId: ORDERZHOUSE_FREE_PLAN_ID, planCode: ORDERZHOUSE_FREE_PLAN_NAME };
}

async function listCampaigns() {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              i.name AS institution_name,
              i.status AS institution_status
         FROM legacy_freelancer_invite_campaigns c
         LEFT JOIN institutions i ON i.id = c.institution_id
        ORDER BY c.created_at DESC, c.id DESC`,
    );
    return rows.map((r) => mapCampaignPublic(r));
  } catch (e) {
    if (!(e && e.code === "42703")) throw e;
    const { rows } = await pool.query(
      `SELECT *
         FROM legacy_freelancer_invite_campaigns
        ORDER BY created_at DESC, id DESC`,
    );
    return rows.map((r) => mapCampaignPublic(r));
  }
}

async function getCampaignById(campaignId) {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              i.name AS institution_name,
              i.status AS institution_status
         FROM legacy_freelancer_invite_campaigns c
         LEFT JOIN institutions i ON i.id = c.institution_id
        WHERE c.id = $1::bigint
        LIMIT 1`,
      [Number(campaignId)],
    );
    return mapCampaignPublic(rows[0] || null);
  } catch (e) {
    if (!(e && e.code === "42703")) throw e;
    const { rows } = await pool.query(
      `SELECT * FROM legacy_freelancer_invite_campaigns WHERE id = $1::bigint LIMIT 1`,
      [Number(campaignId)],
    );
    return mapCampaignPublic(rows[0] || null);
  }
}

async function createCampaign({
  actorAdminId,
  name,
  slug,
  maxRedemptions,
  expiresAt,
  defaultPlanCode,
  defaultTrustLevel,
  defaultCategoryId = null,
  notes = null,
  isActive = true,
  institutionId = null,
}) {
  const safeName = String(name || "").trim();
  if (!safeName) throw createPublicApiError("اسم الحملة مطلوب.", 400, "VALIDATION_ERROR");
  const safeSlug = normalizeSlug(slug || safeName);
  if (!safeSlug || safeSlug.length < 3) {
    throw createPublicApiError("رابط الحملة غير صالح.", 400, "VALIDATION_ERROR");
  }
  const maxSeats = Number(maxRedemptions);
  if (!Number.isInteger(maxSeats) || maxSeats < 1) {
    throw createPublicApiError("عدد المقاعد يجب أن يكون رقماً صحيحاً ≥ 1.", 400, "VALIDATION_ERROR");
  }
  const expires = new Date(expiresAt);
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) {
    throw createPublicApiError("تاريخ انتهاء الرابط يجب أن يكون في المستقبل.", 400, "VALIDATION_ERROR");
  }
  const trust = String(defaultTrustLevel || TRUST_LEVELS.APPROVED).toUpperCase();
  if (!Object.values(TRUST_LEVELS).includes(trust)) {
    throw createPublicApiError("مستوى الثقة غير صالح.", 400, "VALIDATION_ERROR");
  }

  let resolvedInstitutionId = null;
  if (institutionId != null && institutionId !== "") {
    const institutionsService = require("./institutionsService");
    const resolved = await institutionsService.resolveAssignableInstitutionId(institutionId, {
      allowInactive: true,
    });
    resolvedInstitutionId = resolved.id;
  }

  const plaintextToken = generateSecureToken();
  const tokenHash = sha256Hex(plaintextToken);
  const resolved = await resolvePlanByCode(defaultPlanCode);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let campaign;
    try {
      const { rows } = await client.query(
        `INSERT INTO legacy_freelancer_invite_campaigns (
           name, slug, secure_token_hash, created_by_admin_id,
           default_plan_id, default_plan_code, default_trust_level, default_category_id,
           max_redemptions, used_count, expires_at, is_active, notes, institution_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13)
         RETURNING *`,
        [
          safeName,
          safeSlug,
          tokenHash,
          Number(actorAdminId),
          resolved.planId,
          resolved.planCode,
          trust,
          defaultCategoryId != null && defaultCategoryId !== "" ? Number(defaultCategoryId) : null,
          maxSeats,
          expires.toISOString(),
          Boolean(isActive),
          notes != null ? String(notes).slice(0, 4000) : null,
          resolvedInstitutionId,
        ],
      );
      campaign = rows[0];
    } catch (insErr) {
      if (!(insErr && insErr.code === "42703")) throw insErr;
      const { rows } = await client.query(
        `INSERT INTO legacy_freelancer_invite_campaigns (
           name, slug, secure_token_hash, created_by_admin_id,
           default_plan_id, default_plan_code, default_trust_level, default_category_id,
           max_redemptions, used_count, expires_at, is_active, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12)
         RETURNING *`,
        [
          safeName,
          safeSlug,
          tokenHash,
          Number(actorAdminId),
          resolved.planId,
          resolved.planCode,
          trust,
          defaultCategoryId != null && defaultCategoryId !== "" ? Number(defaultCategoryId) : null,
          maxSeats,
          expires.toISOString(),
          Boolean(isActive),
          notes != null ? String(notes).slice(0, 4000) : null,
        ],
      );
      campaign = rows[0];
      if (resolvedInstitutionId != null) {
        throw createPublicApiError(
          "عمود ربط المؤسسة غير متاح بعد. طبّق ترحيل 192 أولاً.",
          500,
          "MIGRATION_REQUIRED",
        );
      }
    }
    await writeAudit(client, {
      action: AUDIT_ACTIONS.CAMPAIGN_CREATED,
      actorAdminId,
      campaignId: campaign.id,
      detail: {
        slug: campaign.slug,
        maxRedemptions: maxSeats,
        defaultPlanCode: resolved.planCode,
        defaultTrustLevel: trust,
        institutionId: resolvedInstitutionId != null ? String(resolvedInstitutionId) : null,
      },
    });
    try {
      const contractFields = require("./legacyFreelancerContractFieldsService");
      await contractFields.ensureDefaultFieldsForCampaign(campaign.id, client);
    } catch (seedErr) {
      if (!(seedErr && (seedErr.code === "42P01" || seedErr.code === "42703"))) {
        throw seedErr;
      }
    }
    try {
      const adminCenter = require("./legacyFreelancerAdminService");
      await adminCenter.ensureDefaultCampaignDocumentRequirements(campaign.id, client);
    } catch (seedDocErr) {
      if (!(seedDocErr && (seedDocErr.code === "42P01" || seedDocErr.code === "42703"))) {
        throw seedDocErr;
      }
    }
    await client.query("COMMIT");
    if (resolvedInstitutionId != null) {
      campaign.institution_id = resolvedInstitutionId;
    }
    return mapCampaignPublic(campaign, { includeJoinUrl: true, plaintextToken });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      throw createPublicApiError("رابط الحملة مستخدم مسبقاً. اختر slug مختلفاً.", 409, "SLUG_TAKEN");
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updateCampaign({
  actorAdminId,
  campaignId,
  name,
  maxRedemptions,
  expiresAt,
  defaultPlanCode,
  defaultTrustLevel,
  defaultCategoryId,
  notes,
  isActive,
  requireIdFront,
  requireIdBack,
  institutionId,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query(
      `SELECT * FROM legacy_freelancer_invite_campaigns WHERE id = $1::bigint FOR UPDATE`,
      [Number(campaignId)],
    );
    const existing = existingRows[0];
    if (!existing) throw createPublicApiError("الحملة غير موجودة.", 404, "NOT_FOUND");

    let planId = existing.default_plan_id;
    let planCode = existing.default_plan_code;
    if (defaultPlanCode != null && String(defaultPlanCode).trim()) {
      const resolved = await resolvePlanByCode(defaultPlanCode, client);
      planId = resolved.planId;
      planCode = resolved.planCode;
    }

    let trust = existing.default_trust_level;
    if (defaultTrustLevel != null) {
      trust = String(defaultTrustLevel).toUpperCase();
      if (!Object.values(TRUST_LEVELS).includes(trust)) {
        throw createPublicApiError("مستوى الثقة غير صالح.", 400, "VALIDATION_ERROR");
      }
    }

    let maxSeats = existing.max_redemptions;
    if (maxRedemptions != null) {
      maxSeats = Number(maxRedemptions);
      if (!Number.isInteger(maxSeats) || maxSeats < Number(existing.used_count)) {
        throw createPublicApiError("عدد المقاعد غير صالح (يجب أن يكون ≥ عدد المسجلين).", 400, "VALIDATION_ERROR");
      }
    }

    let expires = existing.expires_at;
    if (expiresAt != null) {
      const d = new Date(expiresAt);
      if (!Number.isFinite(d.getTime())) {
        throw createPublicApiError("تاريخ انتهاء غير صالح.", 400, "VALIDATION_ERROR");
      }
      expires = d.toISOString();
    }

    let nextInstitutionId =
      existing.institution_id != null ? Number(existing.institution_id) : null;
    let institutionChanged = false;
    if (institutionId !== undefined) {
      if (institutionId == null || institutionId === "") {
        nextInstitutionId = null;
      } else {
        const institutionsService = require("./institutionsService");
        const resolved = await institutionsService.resolveAssignableInstitutionId(institutionId, {
          client,
          allowInactive: true,
        });
        nextInstitutionId = resolved.id;
      }
      institutionChanged =
        String(existing.institution_id || "") !== String(nextInstitutionId || "");
    }

    let rows;
    try {
      ({ rows } = await client.query(
        `UPDATE legacy_freelancer_invite_campaigns SET
           name = COALESCE($2, name),
           max_redemptions = $3,
           expires_at = $4,
           default_plan_id = $5,
           default_plan_code = $6,
           default_trust_level = $7,
           default_category_id = CASE WHEN $8::boolean THEN $9 ELSE default_category_id END,
           notes = CASE WHEN $10::boolean THEN $11 ELSE notes END,
           is_active = COALESCE($12, is_active),
           require_id_front = CASE WHEN $13::boolean THEN $14 ELSE require_id_front END,
           require_id_back = CASE WHEN $15::boolean THEN $16 ELSE require_id_back END,
           institution_id = CASE WHEN $17::boolean THEN $18 ELSE institution_id END,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          Number(campaignId),
          name != null ? String(name).trim() : null,
          maxSeats,
          expires,
          planId,
          planCode,
          trust,
          defaultCategoryId !== undefined,
          defaultCategoryId != null && defaultCategoryId !== "" ? Number(defaultCategoryId) : null,
          notes !== undefined,
          notes != null ? String(notes).slice(0, 4000) : null,
          isActive != null ? Boolean(isActive) : null,
          requireIdFront !== undefined,
          requireIdFront != null ? Boolean(requireIdFront) : true,
          requireIdBack !== undefined,
          requireIdBack != null ? Boolean(requireIdBack) : true,
          institutionId !== undefined,
          nextInstitutionId,
        ],
      ));
    } catch (updErr) {
      if (!(updErr && updErr.code === "42703")) throw updErr;
      if (institutionId !== undefined && institutionChanged) {
        throw createPublicApiError(
          "عمود ربط المؤسسة غير متاح بعد. طبّق ترحيل 192 أولاً.",
          500,
          "MIGRATION_REQUIRED",
        );
      }
      ({ rows } = await client.query(
        `UPDATE legacy_freelancer_invite_campaigns SET
           name = COALESCE($2, name),
           max_redemptions = $3,
           expires_at = $4,
           default_plan_id = $5,
           default_plan_code = $6,
           default_trust_level = $7,
           default_category_id = CASE WHEN $8::boolean THEN $9 ELSE default_category_id END,
           notes = CASE WHEN $10::boolean THEN $11 ELSE notes END,
           is_active = COALESCE($12, is_active),
           require_id_front = CASE WHEN $13::boolean THEN $14 ELSE require_id_front END,
           require_id_back = CASE WHEN $15::boolean THEN $16 ELSE require_id_back END,
           updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          Number(campaignId),
          name != null ? String(name).trim() : null,
          maxSeats,
          expires,
          planId,
          planCode,
          trust,
          defaultCategoryId !== undefined,
          defaultCategoryId != null && defaultCategoryId !== "" ? Number(defaultCategoryId) : null,
          notes !== undefined,
          notes != null ? String(notes).slice(0, 4000) : null,
          isActive != null ? Boolean(isActive) : null,
          requireIdFront !== undefined,
          requireIdFront != null ? Boolean(requireIdFront) : true,
          requireIdBack !== undefined,
          requireIdBack != null ? Boolean(requireIdBack) : true,
        ],
      ));
    }

    await writeAudit(client, {
      action: AUDIT_ACTIONS.CAMPAIGN_UPDATED,
      actorAdminId,
      campaignId,
      detail: {
        name: rows[0].name,
        maxRedemptions: rows[0].max_redemptions,
        isActive: rows[0].is_active,
        defaultTrustLevel: rows[0].default_trust_level,
        defaultPlanCode: rows[0].default_plan_code,
        institutionId: rows[0].institution_id != null ? String(rows[0].institution_id) : null,
      },
    });
    if (institutionChanged) {
      await writeAudit(client, {
        action: AUDIT_ACTIONS.CAMPAIGN_INSTITUTION_CHANGED,
        actorAdminId,
        campaignId,
        detail: {
          previousInstitutionId:
            existing.institution_id != null ? String(existing.institution_id) : null,
          institutionId: nextInstitutionId != null ? String(nextInstitutionId) : null,
        },
      });
    }
    await client.query("COMMIT");
    return mapCampaignPublic(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function revokeCampaign({ actorAdminId, campaignId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE legacy_freelancer_invite_campaigns SET
         is_active = FALSE,
         revoked_at = COALESCE(revoked_at, NOW()),
         revoked_by_admin_id = COALESCE(revoked_by_admin_id, $2),
         updated_at = NOW()
       WHERE id = $1::bigint
       RETURNING *`,
      [Number(campaignId), Number(actorAdminId)],
    );
    if (!rows[0]) throw createPublicApiError("الحملة غير موجودة.", 404, "NOT_FOUND");
    await writeAudit(client, {
      action: AUDIT_ACTIONS.CAMPAIGN_REVOKED,
      actorAdminId,
      campaignId,
      detail: { slug: rows[0].slug },
    });
    await client.query("COMMIT");
    return mapCampaignPublic(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function regenerateCampaignToken({ actorAdminId, campaignId }) {
  const plaintextToken = generateSecureToken();
  const tokenHash = sha256Hex(plaintextToken);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE legacy_freelancer_invite_campaigns SET
         secure_token_hash = $2,
         updated_at = NOW()
       WHERE id = $1::bigint
       RETURNING *`,
      [Number(campaignId), tokenHash],
    );
    if (!rows[0]) throw createPublicApiError("الحملة غير موجودة.", 404, "NOT_FOUND");
    await writeAudit(client, {
      action: AUDIT_ACTIONS.CAMPAIGN_UPDATED,
      actorAdminId,
      campaignId,
      detail: { tokenRegenerated: true, slug: rows[0].slug },
    });
    await client.query("COMMIT");
    return mapCampaignPublic(rows[0], { includeJoinUrl: true, plaintextToken });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listRedemptions(campaignId) {
  let rows;
  try {
    ({ rows } = await pool.query(
      `SELECT r.*,
              u.account_id, u.freelancer_member_id, u.first_name, u.family_name,
              u.email, u.phone, u.created_at AS user_created_at
         FROM legacy_freelancer_invite_redemptions r
         JOIN users u ON u.id = r.user_id
        WHERE r.campaign_id = $1::bigint
        ORDER BY r.redeemed_at DESC, r.id DESC`,
      [Number(campaignId)],
    ));
  } catch (err) {
    if (err.code !== "42703") throw err;
    ({ rows } = await pool.query(
      `SELECT r.*,
              u.account_id, u.first_name, u.family_name,
              u.email, u.phone, u.created_at AS user_created_at
         FROM legacy_freelancer_invite_redemptions r
         JOIN users u ON u.id = r.user_id
        WHERE r.campaign_id = $1::bigint
        ORDER BY r.redeemed_at DESC, r.id DESC`,
      [Number(campaignId)],
    ));
  }
  return rows.map((r) => ({
    id: String(r.id),
    campaignId: String(r.campaign_id),
    userId: String(r.user_id),
    accountId: r.account_id,
    // List views: masked only. Full value is available via Super Admin answers detail.
    freelancerMemberIdMasked: maskFreelancerMemberId(r.freelancer_member_id),
    fullName: [r.first_name, r.family_name].filter(Boolean).join(" "),
    emailMasked: r.email_masked,
    phoneMasked: r.phone_masked,
    identityLast4: r.identity_last4 || null,
    internalReference: r.internal_reference || null,
    redeemedAt: r.redeemed_at,
    userCreatedAt: r.user_created_at,
  }));
}

async function loadCampaignBySlugForToken(slug, token, { forUpdate = false, client = null } = {}) {
  const runner = client || pool;
  const safeSlug = normalizeSlug(slug);
  const tokenHash = sha256Hex(String(token || ""));
  const lock = forUpdate ? "FOR UPDATE" : "";
  const { rows } = await runner.query(
    `SELECT * FROM legacy_freelancer_invite_campaigns
      WHERE slug = $1 AND secure_token_hash = $2
      ${lock}
      LIMIT 1`,
    [safeSlug, tokenHash],
  );
  return rows[0] || null;
}

async function previewInvite({ campaignSlug, token }) {
  const campaign = await loadCampaignBySlugForToken(campaignSlug, token);
  const err = campaignUnavailableError(campaign);
  if (err) throw err;
  const contractFields = require("./legacyFreelancerContractFieldsService");
  let formConfig;
  try {
    formConfig = await contractFields.getCampaignFieldConfig(campaign.id, { includeDisabled: false });
  } catch (e) {
    // Tables may not exist yet in environments without migration 188
    if (e && (e.code === "42P01" || e.code === "42703")) {
      formConfig = { fields: [] };
    } else {
      throw e;
    }
  }
  const base = mapCampaignPreview(campaign);
  let documentRequirements = [];
  try {
    const adminCenter = require("./legacyFreelancerAdminService");
    const allReqs = await adminCenter.getCampaignDocumentRequirements(campaign.id);
    documentRequirements = allReqs
      .filter((r) => r.isEnabled && r.typeIsActive)
      .map((r) => ({
        documentTypeId: r.documentTypeId,
        code: r.code,
        labelAr: r.labelAr,
        description: r.description,
        isRequired: r.isRequired,
        sortOrder: r.sortOrder,
      }));
  } catch (docErr) {
    if (!(docErr && (docErr.code === "42P01" || docErr.code === "42703"))) {
      throw docErr;
    }
  }
  return {
    ...base,
    formFields: contractFields.buildPublicFormFields(formConfig),
    sections: (formConfig.sections || []).map((s) => ({ key: s.key, label: s.labelAr, sortOrder: s.sortOrder })),
    documentRequirements,
  };
}

async function waiveTrainingAndExam(client, { freelancerUserId, actorAdminId }) {
  let requiredCourseId = null;
  try {
    const { rows } = await client.query(
      `SELECT marketplace_membership_required_course_id AS course_id
         FROM marketplace_economy_settings WHERE id = 1`,
    );
    requiredCourseId = rows[0]?.course_id != null ? Number(rows[0].course_id) : null;
  } catch (err) {
    if (err.code !== "42P01" && err.code !== "42703") throw err;
  }

  if (!Number.isInteger(requiredCourseId) || requiredCourseId < 1) {
    return { waived: false, reason: "no_required_course" };
  }

  await client.query(
    `INSERT INTO course_assignments (course_id, freelancer_id, assigned_by, assigned_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (course_id, freelancer_id) DO NOTHING`,
    [requiredCourseId, Number(freelancerUserId), actorAdminId ? Number(actorAdminId) : null],
  );

  try {
    await client.query(
      `INSERT INTO course_lesson_progress (course_id, lesson_id, freelancer_id, completed_at)
       SELECT $1, l.id, $2, NOW()
         FROM course_lessons l
        WHERE l.course_id = $1 AND l.is_active = TRUE
       ON CONFLICT (freelancer_id, course_id, lesson_id) DO NOTHING`,
      [requiredCourseId, Number(freelancerUserId)],
    );
  } catch (err) {
    if (err.code !== "42P01") throw err;
  }

  await client.query(
    `UPDATE course_assignments
        SET completed_at = COALESCE(completed_at, NOW()),
            audit_confirmed = TRUE,
            audit_submitted_at = COALESCE(audit_submitted_at, NOW()),
            exam_final_grade = COALESCE(exam_final_grade, 100),
            audit_notes = COALESCE(
              audit_notes,
              $3
            )
      WHERE course_id = $1 AND freelancer_id = $2`,
    [
      requiredCourseId,
      Number(freelancerUserId),
      `LEGACY_WAIVER | training=${TRAINING_WAIVER_REASON} | exam=${FINAL_EXAM_WAIVER_REASON}`,
    ],
  );

  return { waived: true, courseId: requiredCourseId };
}

async function assignLegacySubscription(
  client,
  {
    freelancerUserId,
    planId,
    actorAdminId,
    startsAt = null,
    expiresAt = null,
    durationMonths = null,
    notes = null,
    assignmentSource = null,
  } = {},
) {
  await endCurrentSubscription({ freelancerUserId }, client);

  const startDate = startsAt ? new Date(startsAt) : null;
  let endDate = expiresAt ? new Date(expiresAt) : null;
  if (startDate && Number.isFinite(startDate.getTime()) && !endDate && durationMonths != null) {
    endDate = addMonthsUtc(startDate, Number(durationMonths));
  }
  const hasDates = Boolean(
    startDate &&
      endDate &&
      Number.isFinite(startDate.getTime()) &&
      Number.isFinite(endDate.getTime()) &&
      endDate.getTime() > startDate.getTime(),
  );

  const notesVal = notes != null && String(notes).trim()
    ? String(notes).slice(0, 2000)
    : hasDates
      ? "LEGACY_ADMIN_ASSIGNMENT"
      : PLAN_ASSIGNMENT_REASON;
  const status = hasDates ? SUBSCRIPTION_STATUSES.ACTIVE : SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED;

  // Dated Legacy admin entitlements use constraint Case 3 (migration 191):
  // active dates with has_first_order=FALSE — never fabricate a first order/payment.
  const startIso = hasDates ? startDate.toISOString() : null;
  const endIso = hasDates ? endDate.toISOString() : null;

  const { rows } = await client.query(
    `INSERT INTO freelancer_subscriptions (
       freelancer_user_id, plan_id, assigned_by_user_id, notes,
       status, has_first_order, first_order_date, actual_start_date, expiry_date,
       is_current, source, payment_status, activation_status,
       company_activated_at, company_activated_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,FALSE,NULL,$6,$7,TRUE,$8,$9,$10,NOW(),$11)
     RETURNING *`,
    [
      Number(freelancerUserId),
      Number(planId),
      actorAdminId ? Number(actorAdminId) : null,
      notesVal,
      status,
      startIso,
      endIso,
      SUBSCRIPTION_SOURCES.ADMIN,
      SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
      SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      actorAdminId ? Number(actorAdminId) : null,
    ],
  );
  const subscription = mapSubscription(rows[0]);

  if (hasDates) {
    const source =
      assignmentSource &&
      ["LEGACY_ADMIN_ASSIGNMENT", "LEGACY_INVITE_DEFAULT", "LEGACY_BULK_ASSIGNMENT"].includes(
        String(assignmentSource),
      )
        ? String(assignmentSource)
        : "LEGACY_ADMIN_ASSIGNMENT";
    try {
      await client.query(
        `UPDATE legacy_freelancer_package_assignments
            SET status = 'SUPERSEDED', updated_at = NOW()
          WHERE user_id = $1::bigint AND status = 'ACTIVE'`,
        [Number(freelancerUserId)],
      );
      await client.query(
        `INSERT INTO legacy_freelancer_package_assignments (
           user_id, plan_id, subscription_id, starts_at, expires_at, duration_months,
           assignment_source, assigned_by_admin_id, notes, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ACTIVE')`,
        [
          Number(freelancerUserId),
          Number(planId),
          rows[0].id,
          startDate.toISOString(),
          endDate.toISOString(),
          durationMonths != null ? Number(durationMonths) : null,
          source,
          actorAdminId ? Number(actorAdminId) : null,
          notesVal,
        ],
      );
    } catch (histErr) {
      if (!(histErr && (histErr.code === "42P01" || histErr.code === "42703"))) {
        throw histErr;
      }
    }
  }

  return subscription;
}

async function upsertTrustRank(client, { freelancerUserId, trustLevel, notes }) {
  try {
    const { PARTNER_CODE } = require("../config/fazatIntegration");
    await client.query(
      `INSERT INTO partner_freelancer_profiles (
         partner_code, freelancer_user_id, rank, is_assignable, notes_internal,
         skills_snapshot_json, last_synced_at, updated_at
       ) VALUES ($1,$2,$3,TRUE,$4,'[]'::jsonb, NOW(), NOW())
       ON CONFLICT (partner_code, freelancer_user_id) DO UPDATE SET
         rank = EXCLUDED.rank,
         is_assignable = TRUE,
         notes_internal = COALESCE(EXCLUDED.notes_internal, partner_freelancer_profiles.notes_internal),
         last_synced_at = NOW(),
         updated_at = NOW()`,
      [PARTNER_CODE, Number(freelancerUserId), trustLevel, notes],
    );
    return true;
  } catch (err) {
    if (err.code === "42P01" || err.code === "42703") return false;
    throw err;
  }
}

/**
 * Atomic shared-link registration. Increments used_count only when seats remain.
 * @param {object} payload
 * @param {{ ip?: string|null, userAgent?: string|null, files?: { idFront?: object, idBack?: object } }} [opts]
 */
async function registerLegacyFreelancer(payload, { ip = null, userAgent = null, files = {} } = {}) {
  const campaignSlug = payload.campaignSlug;
  const token = payload.token;
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const password = String(payload.password || "");
  const passwordConfirm = payload.passwordConfirm != null ? String(payload.passwordConfirm) : password;
  const termsAccepted = Boolean(payload.termsAccepted);
  const privacyAccepted = Boolean(payload.privacyAccepted);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createPublicApiError("البريد الإلكتروني غير صالح.", 400, "VALIDATION_ERROR");
  }
  if (password.length < 8) {
    throw createPublicApiError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.", 400, "VALIDATION_ERROR");
  }
  if (password !== passwordConfirm) {
    throw createPublicApiError("تأكيد كلمة المرور غير مطابق.", 400, "VALIDATION_ERROR");
  }
  if (!termsAccepted || !privacyAccepted) {
    throw createPublicApiError("يجب الموافقة على الشروط والأحكام وسياسة الخصوصية.", 400, "TERMS_REQUIRED");
  }

  const phone = composeE164(payload.phone);
  const country = payload.country ? String(payload.country).trim().toUpperCase().slice(0, 2) : null;
  const genderRaw = String(payload.gender || "").trim();
  const gender = genderRaw === "أنثى" || genderRaw === "female" ? "أنثى" : "ذكر";
  const identityLast4 = payload.identityLast4
    ? String(payload.identityLast4).replace(/\D/g, "").slice(-4)
    : null;
  const internalReference = payload.internalReference
    ? String(payload.internalReference).trim().slice(0, 120)
    : null;

  let categories = null;
  if (Array.isArray(payload.categories) && payload.categories.length > 0) {
    categories = [...new Set(payload.categories.map(String))].sort();
  } else if (payload.category || payload.specialty) {
    categories = [String(payload.category || payload.specialty).trim()].filter(Boolean);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (passwordHash === password || !passwordHash.startsWith("$2")) {
    throw createPublicApiError("تعذّر تأمين كلمة المرور.", 500, "HASH_FAILED");
  }

  const contractFields = require("./legacyFreelancerContractFieldsService");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const campaign = await loadCampaignBySlugForToken(campaignSlug, token, { forUpdate: true, client });
    const unavailable = campaignUnavailableError(campaign);
    if (unavailable) throw unavailable;

    let fieldConfig;
    try {
      fieldConfig = await contractFields.getCampaignFieldConfig(campaign.id, {
        client,
        includeDisabled: true,
      });
    } catch (cfgErr) {
      if (cfgErr && (cfgErr.code === "42P01" || cfgErr.code === "42703")) {
        fieldConfig = { fields: [] };
      } else {
        throw cfgErr;
      }
    }

    const rawAnswers = payload.answers && typeof payload.answers === "object" ? payload.answers : {};
    // Merge top-level name fields into answers for convenience
    if (payload.firstName && rawAnswers.first_name == null) rawAnswers.first_name = payload.firstName;
    if (payload.fatherName && rawAnswers.father_name == null) rawAnswers.father_name = payload.fatherName;
    if (payload.familyName && rawAnswers.family_name == null) rawAnswers.family_name = payload.familyName;
    if (payload.city && rawAnswers.city == null) rawAnswers.city = payload.city;

    let normalized = {};
    let canonicalUserPatches = {};
    if (fieldConfig.fields && fieldConfig.fields.length > 0) {
      const validated = contractFields.validateAndNormalizeAnswers(fieldConfig.fields, rawAnswers);
      normalized = validated.normalized;
      canonicalUserPatches = validated.canonicalUserPatches;
    } else if (payload.fullName || payload.firstName) {
      // Pre-188 fallback: no contract config table
      const namesFallback = contractFields.extractNamesFromAnswersOrPayload({}, payload);
      canonicalUserPatches = {
        first_name: namesFallback.firstName,
        father_name: namesFallback.fatherName,
        family_name: namesFallback.familyName,
      };
      if (payload.city) canonicalUserPatches.city = String(payload.city).trim().slice(0, 120);
      normalized = {};
    } else {
      throw createPublicApiError("بيانات التسجيل غير مكتملة.", 400, "VALIDATION_ERROR");
    }

    const names = contractFields.extractNamesFromAnswersOrPayload(normalized, {
      ...payload,
      firstName: canonicalUserPatches.first_name || payload.firstName,
      fatherName: canonicalUserPatches.father_name || payload.fatherName,
      familyName: canonicalUserPatches.family_name || payload.familyName,
    });
    const city =
      (canonicalUserPatches.city && String(canonicalUserPatches.city).trim().slice(0, 120)) ||
      (payload.city ? String(payload.city).trim().slice(0, 120) : null);

    // Freelancer Business ID for Legacy Invite = Jordanian national ID (not users.id).
    let freelancerMemberId = null;
    if (normalized.national_id != null && normalized.national_id !== "") {
      freelancerMemberId = normalizeAndValidateNationalId(normalized.national_id, { required: true });
      normalized.national_id = freelancerMemberId;
    } else {
      const nationalFieldEnabled = (fieldConfig.fields || []).some(
        (f) => f.fieldKey === "national_id" && f.isEnabled,
      );
      if (nationalFieldEnabled) {
        freelancerMemberId = normalizeAndValidateNationalId(null, { required: true });
      }
    }

    // Uniqueness before seat claim so a duplicate never consumes a seat.
    let memberIdColumnReady = true;
    if (freelancerMemberId) {
      try {
        const { rows: memberDup } = await client.query(
          `SELECT id FROM users
            WHERE onboarding_source = 'LEGACY_INVITE'
              AND freelancer_member_id = $1
            LIMIT 1`,
          [freelancerMemberId],
        );
        if (memberDup[0]) {
          throw duplicateNationalIdError();
        }
      } catch (dupErr) {
        if (dupErr && dupErr.publicCode === "LEGACY_NATIONAL_ID_EXISTS") throw dupErr;
        if (!(dupErr && dupErr.code === "42703")) throw dupErr;
        // Migration 189 not applied yet — answers still store national_id; member column skipped.
        memberIdColumnReady = false;
      }
    }

    const { rows: seatRows } = await client.query(
      `UPDATE legacy_freelancer_invite_campaigns
          SET used_count = used_count + 1,
              updated_at = NOW()
        WHERE id = $1
          AND is_active = TRUE
          AND revoked_at IS NULL
          AND expires_at > NOW()
          AND used_count < max_redemptions
        RETURNING *`,
      [campaign.id],
    );
    if (!seatRows[0]) {
      throw createPublicApiError("اكتمل عدد المقاعد المتاحة لهذا الرابط.", 410, "LEGACY_INVITE_FULL");
    }
    const lockedCampaign = seatRows[0];

    const { rows: emailRows } = await client.query(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    const { rows: phoneRows } = await client.query(
      `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
      [phone],
    );
    if (emailRows[0] || phoneRows[0]) {
      throw createPublicApiError(
        "يوجد حساب مسجل بهذا البريد أو الرقم. الرجاء تسجيل الدخول أو التواصل مع الإدارة.",
        409,
        "ACCOUNT_EXISTS",
      );
    }

    const categoryId =
      payload.categoryId != null && payload.categoryId !== ""
        ? Number(payload.categoryId)
        : lockedCampaign.default_category_id != null
          ? Number(lockedCampaign.default_category_id)
          : null;

    if ((!categories || categories.length === 0) && categoryId) {
      try {
        const { rows: catRows } = await client.query(
          `SELECT slug, name FROM categories WHERE id = $1 LIMIT 1`,
          [categoryId],
        );
        if (catRows[0]) {
          categories = [catRows[0].slug || catRows[0].name || String(categoryId)];
        }
      } catch (_) {
        /* optional */
      }
    }
    // Prefer freelance_joining_skills / specialization as category hint
    if ((!categories || categories.length === 0) && normalized.specialization) {
      categories = [String(normalized.specialization).slice(0, 80)];
    }
    if ((!categories || categories.length === 0) && normalized.freelance_joining_skills) {
      categories = [String(normalized.freelance_joining_skills).split(/[,\n]/)[0].trim().slice(0, 80)].filter(Boolean);
    }
    if (!categories || categories.length === 0) {
      categories = ["content_writing"];
    }

    const accountId = await generateUniqueAccountId(client);
    const nowIso = new Date().toISOString();
    const skillsArr = canonicalUserPatches.skills
      ? String(canonicalUserPatches.skills)
          .split(/[,|\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 40)
      : null;
    const insertParamsBase = [
      accountId,
      names.firstName,
      names.fatherName,
      names.familyName,
      email,
      passwordHash,
      ROLES.FREELANCER,
      country || "JO",
      phone,
      gender,
      nowIso,
      categories,
      lockedCampaign.id,
      TRAINING_WAIVER_REASON,
      FINAL_EXAM_WAIVER_REASON,
      lockedCampaign.created_by_admin_id,
      skillsArr,
    ];

    // Identity requirements (migration 190) — enforce before user insert when columns exist.
    const requireIdFront = Boolean(lockedCampaign.require_id_front);
    const requireIdBack = Boolean(lockedCampaign.require_id_back);
    const idFrontFile = files.idFront || files.front || null;
    const idBackFile = files.idBack || files.back || null;
    const identityColumnsReady =
      Object.prototype.hasOwnProperty.call(lockedCampaign, "require_id_front") ||
      Object.prototype.hasOwnProperty.call(lockedCampaign, "require_id_back");
    if (identityColumnsReady) {
      if (requireIdFront && !idFrontFile) {
        throw createPublicApiError("صورة الهوية الأمامية مطلوبة.", 400, "ID_FRONT_REQUIRED");
      }
      if (requireIdBack && !idBackFile) {
        throw createPublicApiError("صورة الهوية الخلفية مطلوبة.", 400, "ID_BACK_REQUIRED");
      }
    }

    let signedDocumentTypeIds = payload.signedDocumentTypeIds ?? payload.signed_document_type_ids ?? [];
    if (typeof signedDocumentTypeIds === "string") {
      try {
        signedDocumentTypeIds = JSON.parse(signedDocumentTypeIds);
      } catch (_) {
        signedDocumentTypeIds = signedDocumentTypeIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
    if (!Array.isArray(signedDocumentTypeIds)) signedDocumentTypeIds = [];

    let userRows;
    let entryMethodColumnReady = true;
    if (memberIdColumnReady) {
      try {
        ({ rows: userRows } = await client.query(
          `INSERT INTO users (
             account_id, first_name, father_name, family_name, email, password_hash, role,
             country, phone, whatsapp, gender, terms_accepted, terms_accepted_at,
             privacy_accepted, privacy_accepted_at,
             freelancer_categories, email_verified, is_active,
             onboarding_source, legacy_invite_campaign_id,
             identity_verification_source,
             training_waiver_reason, final_exam_waiver_reason,
             legacy_verified_at, legacy_verified_by_admin_id,
             skills, freelancer_member_id, legacy_entry_method
           ) VALUES (
             $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
             $8::text, $9::text, $9::text, $10::text, TRUE, $11::timestamptz,
             TRUE, $11::timestamptz,
             $12::text[], TRUE, TRUE,
             'LEGACY_INVITE', $13::bigint,
             'COMPANY_OFFLINE_VERIFIED',
             $14::text, $15::text,
             $11::timestamptz, $16::bigint,
             $17::text[], $18::text, 'SHARED_INVITE'
           )
           RETURNING id, account_id, freelancer_member_id, first_name, father_name, family_name, email, role,
                     country, phone, whatsapp, gender, freelancer_categories, is_active,
                     email_verified, created_at, onboarding_source, identity_verification_source,
                     legacy_entry_method, password_hash`,
          [...insertParamsBase, freelancerMemberId],
        ));
      } catch (insErr) {
        if (insErr && insErr.code === "42703" && String(insErr.message || "").includes("legacy_entry_method")) {
          entryMethodColumnReady = false;
        } else if (!(insErr && insErr.code === "42703")) {
          throw insErr;
        } else {
          memberIdColumnReady = false;
        }
      }
    }
    if (!userRows && memberIdColumnReady && !entryMethodColumnReady) {
      ({ rows: userRows } = await client.query(
        `INSERT INTO users (
           account_id, first_name, father_name, family_name, email, password_hash, role,
           country, phone, whatsapp, gender, terms_accepted, terms_accepted_at,
           privacy_accepted, privacy_accepted_at,
           freelancer_categories, email_verified, is_active,
           onboarding_source, legacy_invite_campaign_id,
           identity_verification_source,
           training_waiver_reason, final_exam_waiver_reason,
           legacy_verified_at, legacy_verified_by_admin_id,
           skills, freelancer_member_id
         ) VALUES (
           $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
           $8::text, $9::text, $9::text, $10::text, TRUE, $11::timestamptz,
           TRUE, $11::timestamptz,
           $12::text[], TRUE, TRUE,
           'LEGACY_INVITE', $13::bigint,
           'COMPANY_OFFLINE_VERIFIED',
           $14::text, $15::text,
           $11::timestamptz, $16::bigint,
           $17::text[], $18::text
         )
         RETURNING id, account_id, freelancer_member_id, first_name, father_name, family_name, email, role,
                   country, phone, whatsapp, gender, freelancer_categories, is_active,
                   email_verified, created_at, onboarding_source, identity_verification_source,
                   password_hash`,
        [...insertParamsBase, freelancerMemberId],
      ));
    }
    if (!memberIdColumnReady) {
      try {
        ({ rows: userRows } = await client.query(
          `INSERT INTO users (
             account_id, first_name, father_name, family_name, email, password_hash, role,
             country, phone, whatsapp, gender, terms_accepted, terms_accepted_at,
             privacy_accepted, privacy_accepted_at,
             freelancer_categories, email_verified, is_active,
             onboarding_source, legacy_invite_campaign_id,
             identity_verification_source,
             training_waiver_reason, final_exam_waiver_reason,
             legacy_verified_at, legacy_verified_by_admin_id,
             skills, legacy_entry_method
           ) VALUES (
             $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
             $8::text, $9::text, $9::text, $10::text, TRUE, $11::timestamptz,
             TRUE, $11::timestamptz,
             $12::text[], TRUE, TRUE,
             'LEGACY_INVITE', $13::bigint,
             'COMPANY_OFFLINE_VERIFIED',
             $14::text, $15::text,
             $11::timestamptz, $16::bigint,
             $17::text[], 'SHARED_INVITE'
           )
           RETURNING id, account_id, first_name, father_name, family_name, email, role,
                     country, phone, whatsapp, gender, freelancer_categories, is_active,
                     email_verified, created_at, onboarding_source, identity_verification_source,
                     legacy_entry_method, password_hash`,
          insertParamsBase,
        ));
      } catch (insErr2) {
        if (!(insErr2 && insErr2.code === "42703")) throw insErr2;
        ({ rows: userRows } = await client.query(
          `INSERT INTO users (
             account_id, first_name, father_name, family_name, email, password_hash, role,
             country, phone, whatsapp, gender, terms_accepted, terms_accepted_at,
             privacy_accepted, privacy_accepted_at,
             freelancer_categories, email_verified, is_active,
             onboarding_source, legacy_invite_campaign_id,
             identity_verification_source,
             training_waiver_reason, final_exam_waiver_reason,
             legacy_verified_at, legacy_verified_by_admin_id,
             skills
           ) VALUES (
             $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text,
             $8::text, $9::text, $9::text, $10::text, TRUE, $11::timestamptz,
             TRUE, $11::timestamptz,
             $12::text[], TRUE, TRUE,
             'LEGACY_INVITE', $13::bigint,
             'COMPANY_OFFLINE_VERIFIED',
             $14::text, $15::text,
             $11::timestamptz, $16::bigint,
             $17::text[]
           )
           RETURNING id, account_id, first_name, father_name, family_name, email, role,
                     country, phone, whatsapp, gender, freelancer_categories, is_active,
                     email_verified, created_at, onboarding_source, identity_verification_source,
                     password_hash`,
          insertParamsBase,
        ));
      }
    }
    const user = userRows[0];

    // Never return plaintext password; assert hash stored
    if (user.password_hash === password || !String(user.password_hash || "").startsWith("$2")) {
      throw createPublicApiError("تعذّر تأمين كلمة المرور.", 500, "HASH_FAILED");
    }
    delete user.password_hash;

    await ensureUserRole({ userId: user.id, roleName: ROLES.FREELANCER, client });

    const subscription = await assignLegacySubscription(client, {
      freelancerUserId: user.id,
      planId: lockedCampaign.default_plan_id || ORDERZHOUSE_FREE_PLAN_ID,
      actorAdminId: lockedCampaign.created_by_admin_id,
      assignmentSource: "LEGACY_INVITE_DEFAULT",
    });

    await waiveTrainingAndExam(client, {
      freelancerUserId: user.id,
      actorAdminId: lockedCampaign.created_by_admin_id,
    });

    await upsertTrustRank(client, {
      freelancerUserId: user.id,
      trustLevel: lockedCampaign.default_trust_level || TRUST_LEVELS.APPROVED,
      notes: PLAN_ASSIGNMENT_REASON,
    });

    // Identity uploads + signed docs (migration 190) — best-effort when schema ready.
    try {
      const adminCenter = require("./legacyFreelancerAdminService");
      if (idFrontFile) {
        await adminCenter.storeIdentityDocument(client, {
          userId: user.id,
          campaignId: lockedCampaign.id,
          side: "FRONT",
          file: idFrontFile,
          uploadSource: "SELF_REGISTRATION",
        });
      }
      if (idBackFile) {
        await adminCenter.storeIdentityDocument(client, {
          userId: user.id,
          campaignId: lockedCampaign.id,
          side: "BACK",
          file: idBackFile,
          uploadSource: "SELF_REGISTRATION",
        });
      }
      await adminCenter.validateAndPersistRegistrationSignedDocs(client, {
        campaignId: lockedCampaign.id,
        userId: user.id,
        signedDocumentTypeIds,
      });
    } catch (idDocErr) {
      if (!(idDocErr && (idDocErr.code === "42P01" || idDocErr.code === "42703"))) {
        throw idDocErr;
      }
    }

    const ipHash = ip ? sha256Hex(ip) : null;
    const uaHash = userAgent ? sha256Hex(userAgent) : null;

    const { rows: redemptionRows } = await client.query(
      `INSERT INTO legacy_freelancer_invite_redemptions (
         campaign_id, user_id, email_masked, phone_masked,
         identity_last4, internal_reference, ip_hash, user_agent_hash, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       RETURNING id`,
      [
        lockedCampaign.id,
        user.id,
        maskEmail(email),
        maskPhone(phone),
        identityLast4 || null,
        internalReference || null,
        ipHash,
        uaHash,
        JSON.stringify({
          city: city || null,
          categoryId: categoryId || null,
          categories,
          trustLevel: lockedCampaign.default_trust_level,
          planCode: lockedCampaign.default_plan_code,
          contractFieldKeys: Object.keys(normalized),
          signedDocumentTypeIds,
          hasIdentityFront: Boolean(idFrontFile),
          hasIdentityBack: Boolean(idBackFile),
        }),
      ],
    );
    const redemptionId = redemptionRows[0]?.id;

    if (Object.keys(normalized).length > 0) {
      try {
        await contractFields.saveAnswers(client, {
          campaignId: lockedCampaign.id,
          userId: user.id,
          redemptionId,
          normalized,
        });
      } catch (ansErr) {
        if (!(ansErr && (ansErr.code === "42P01" || ansErr.code === "42703"))) {
          throw ansErr;
        }
      }
    }

    // Apply remaining canonical patches (names/skills already in INSERT)
    const remainingPatches = { ...canonicalUserPatches };
    delete remainingPatches.first_name;
    delete remainingPatches.father_name;
    delete remainingPatches.family_name;
    delete remainingPatches.skills;
    if (Object.keys(remainingPatches).length) {
      await contractFields.applyCanonicalUserPatches(client, user.id, remainingPatches);
    }

    await writeAudit(client, {
      action: AUDIT_ACTIONS.INVITE_REDEEMED,
      actorAdminId: lockedCampaign.created_by_admin_id,
      campaignId: lockedCampaign.id,
      targetUserId: user.id,
      detail: {
        campaignId: String(lockedCampaign.id),
        userId: String(user.id),
        emailMasked: maskEmail(email),
        phoneMasked: maskPhone(phone),
        trustLevel: lockedCampaign.default_trust_level,
        planCode: lockedCampaign.default_plan_code,
        identitySource: "company_offline_verified",
        trainingWaiverReason: TRAINING_WAIVER_REASON,
        finalExamWaiverReason: FINAL_EXAM_WAIVER_REASON,
        termsAcceptedAt: nowIso,
        privacyAcceptedAt: nowIso,
        contractAnswerKeys: Object.keys(normalized),
        entryMethod: "SHARED_INVITE",
        signedDocumentCount: signedDocumentTypeIds.length,
        timestamp: nowIso,
      },
    });

    // Optional Institution membership — same transaction; failure rolls back seat + user.
    if (lockedCampaign.institution_id != null) {
      const institutionsService = require("./institutionsService");
      await institutionsService.ensureActiveMembership(client, {
        institutionId: lockedCampaign.institution_id,
        userId: user.id,
        memberRole: "member",
        actorUserId: lockedCampaign.created_by_admin_id,
        source: "legacy_invite_registration",
      });
      await writeAudit(client, {
        action: AUDIT_ACTIONS.REGISTRATION_JOINED_INSTITUTION,
        actorAdminId: lockedCampaign.created_by_admin_id,
        campaignId: lockedCampaign.id,
        targetUserId: user.id,
        detail: {
          institutionId: String(lockedCampaign.institution_id),
          source: "legacy_invite_registration",
        },
      });
    }

    await client.query("COMMIT");

    const authz = await resolveAuthzContext({ userId: user.id, legacyRole: ROLES.FREELANCER });
    const authService = require("./authService");
    const { user: publicUser, token: jwtToken } = await authService.buildAuthResponseForUserId(user.id);

    const eligibility = evaluateFreelancerTakeOrdersEligibility(subscription);

    return {
      user: publicUser,
      token: jwtToken,
      authz,
      message: "تم إنشاء حسابك كفريلانسر معتمد سابقًا.",
      subscription,
      eligibility,
      campaign: {
        id: String(lockedCampaign.id),
        slug: lockedCampaign.slug,
        usedCount: Number(lockedCampaign.used_count),
        maxRedemptions: Number(lockedCampaign.max_redemptions),
      },
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    if (err.code === "23505") {
      if (isLegacyMemberIdUniqueViolation(err)) {
        throw duplicateNationalIdError();
      }
      throw createPublicApiError(
        "يوجد حساب مسجل بهذا البريد أو الرقم. الرجاء تسجيل الدخول أو التواصل مع الإدارة.",
        409,
        "ACCOUNT_EXISTS",
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  AUDIT_ACTIONS,
  TRUST_LEVELS,
  TRAINING_WAIVER_REASON,
  FINAL_EXAM_WAIVER_REASON,
  PLAN_ASSIGNMENT_REASON,
  BCRYPT_ROUNDS,
  sha256Hex,
  generateSecureToken,
  generateUniqueAccountId,
  composeE164,
  maskEmail,
  maskPhone,
  maskFreelancerMemberId,
  normalizeSlug,
  buildPublicJoinUrl,
  campaignUnavailableError,
  mapCampaignPublic,
  writeAudit,
  waiveTrainingAndExam,
  assignLegacySubscription,
  upsertTrustRank,
  listCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  revokeCampaign,
  regenerateCampaignToken,
  listRedemptions,
  previewInvite,
  registerLegacyFreelancer,
  evaluateFreelancerTakeOrdersEligibility,
};
