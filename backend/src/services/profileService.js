const { pool } = require("../config/db");
const { ROLES } = require("../constants/roles");
const { createPublicApiError } = require("../utils/publicApiError");

const PHONE_E164 = /^\+[1-9]\d{7,14}$/;
const BIO_MAX = 2000;
const SKILL_ITEM_MAX = 80;
const SKILL_MAX_COUNT = 50;
const NOTES_MAX = 500;

function normalizeOptionalUrl(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error("bad");
    }
    return u.toString();
  } catch {
    throw createPublicApiError("رابط غير صالح.", 400, "VALIDATION_ERROR");
  }
}

function validateE164(fieldLabel, value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") {
    throw createPublicApiError(`${fieldLabel} مطلوب.`, 400, "VALIDATION_ERROR");
  }
  const s = String(value).trim();
  if (!PHONE_E164.test(s)) {
    throw createPublicApiError(`${fieldLabel} يجب أن يكون بالصيغة الدولية (مثال: +9665xxxxxxxx).`, 400, "VALIDATION_ERROR");
  }
  return s;
}

function normalizeNamePart(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  return String(raw).trim().slice(0, 80);
}

function normalizeSkills(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw createPublicApiError("المهارات يجب أن تكون مصفوفة نصوص.", 400, "VALIDATION_ERROR");
  }
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const t = String(item ?? "")
      .trim()
      .slice(0, SKILL_ITEM_MAX);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length > SKILL_MAX_COUNT) {
      throw createPublicApiError(`يمكنك إضافة ${SKILL_MAX_COUNT} مهارة كحد أقصى.`, 400, "VALIDATION_ERROR");
    }
  }
  return out;
}

function mergeNotificationPreferences(existing, patch) {
  if (patch === undefined) return undefined;
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
    throw createPublicApiError("تفضيلات الإشعارات غير صالحة.", 400, "VALIDATION_ERROR");
  }
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  const allowedKeys = new Set([
    "orders",
    "claims",
    "courses",
    "payments",
    "offers",
    "delivery",
    "general",
  ]);
  for (const [k, v] of Object.entries(patch)) {
    if (!allowedKeys.has(k)) continue;
    if (typeof v === "boolean") {
      base[k] = v;
    }
  }
  return base;
}

function assertNamePresent(first, father, family) {
  const full = [first, father, family]
    .map((s) => (s == null ? "" : String(s).trim()))
    .join(" ")
    .trim();
  if (full.length < 2) {
    throw createPublicApiError("الاسم الكامل يجب أن يكون حرفين على الأقل.", 400, "VALIDATION_ERROR");
  }
}

function truncateNotes(raw, label) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const s = String(raw).trim().slice(0, NOTES_MAX);
  return s || null;
}

/**
 * @param {object} body — camelCase keys from client
 */
async function patchUserProfile(userId, legacyRole, body) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1::bigint LIMIT 1`, [userId]);
  const row = rows[0];
  if (!row) {
    throw createPublicApiError("المستخدم غير موجود.", 404, "NOT_FOUND");
  }

  let first = row.first_name;
  let father = row.father_name;
  let family = row.family_name;

  if (body.firstName !== undefined) first = normalizeNamePart(body.firstName);
  if (body.fatherName !== undefined) father = normalizeNamePart(body.fatherName);
  if (body.familyName !== undefined) family = normalizeNamePart(body.familyName);

  assertNamePresent(first, father, family);

  const updates = [];
  const params = [];
  let idx = 1;

  const push = (sqlFrag, val) => {
    updates.push(`${sqlFrag} = $${idx}`);
    params.push(val);
    idx += 1;
  };

  push("first_name", first);
  push("father_name", father);
  push("family_name", family);

  if (body.phone !== undefined) {
    push("phone", validateE164("رقم الجوال", body.phone));
  }
  if (body.whatsApp !== undefined) {
    push("whatsapp", validateE164("رقم واتساب", body.whatsApp));
  }

  if (legacyRole === ROLES.FREELANCER) {
    if (body.professionalTitle !== undefined) {
      const v =
        body.professionalTitle === null || body.professionalTitle === ""
          ? null
          : String(body.professionalTitle).trim().slice(0, 160);
      push("professional_title", v);
    }
    if (body.bio !== undefined) {
      const v =
        body.bio === null || body.bio === ""
          ? null
          : String(body.bio).trim().slice(0, BIO_MAX);
      push("bio", v);
    }
    if (body.skills !== undefined) {
      const skills = normalizeSkills(body.skills);
      push("skills", skills.length ? skills : null);
    }
    if (body.websiteUrl !== undefined) push("website_url", normalizeOptionalUrl(body.websiteUrl));
    if (body.linkedinUrl !== undefined) push("linkedin_url", normalizeOptionalUrl(body.linkedinUrl));
    if (body.githubUrl !== undefined) push("github_url", normalizeOptionalUrl(body.githubUrl));
    if (body.behanceUrl !== undefined) push("behance_url", normalizeOptionalUrl(body.behanceUrl));
    if (body.portfolioUrl !== undefined) push("portfolio_url", normalizeOptionalUrl(body.portfolioUrl));
    if (body.preferredWithdrawalMethod !== undefined) {
      const v =
        body.preferredWithdrawalMethod === null || body.preferredWithdrawalMethod === ""
          ? null
          : String(body.preferredWithdrawalMethod).trim().slice(0, 40);
      push("preferred_withdrawal_method", v);
    }
    if (body.payoutNotesHint !== undefined) {
      push("payout_notes_hint", truncateNotes(body.payoutNotesHint, "ملاحظات"));
    }
  }

  if (legacyRole === ROLES.CLIENT) {
    if (body.companyName !== undefined) {
      const v =
        body.companyName === null || body.companyName === ""
          ? null
          : String(body.companyName).trim().slice(0, 200);
      push("company_name", v);
    }
    if (body.billingName !== undefined) {
      const v =
        body.billingName === null || body.billingName === ""
          ? null
          : String(body.billingName).trim().slice(0, 200);
      push("billing_name", v);
    }
    if (body.billingCountry !== undefined) {
      const v =
        body.billingCountry === null || body.billingCountry === ""
          ? null
          : String(body.billingCountry).trim().toUpperCase().slice(0, 2);
      if (v && v.length !== 2) {
        throw createPublicApiError("رمز الدولة يجب أن يكون حرفين (ISO).", 400, "VALIDATION_ERROR");
      }
      push("billing_country", v);
    }
    if (body.billingCity !== undefined) {
      const v =
        body.billingCity === null || body.billingCity === ""
          ? null
          : String(body.billingCity).trim().slice(0, 120);
      push("billing_city", v);
    }
    if (body.billingNotes !== undefined) {
      push("billing_notes", truncateNotes(body.billingNotes, "ملاحظات الفوترة"));
    }
  }

  if (legacyRole === ROLES.ADMIN || legacyRole === ROLES.SUPER_ADMIN) {
    // Basic fields only (already applied): names + phone + whatsapp
  }

  if (body.notificationPreferences !== undefined) {
    const merged = mergeNotificationPreferences(row.notification_preferences, body.notificationPreferences);
    push("notification_preferences", merged);
  }

  updates.push(`updated_at = NOW()`);

  params.push(userId);
  const sql = `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}::bigint`;
  await pool.query(sql, params);
}

async function clearAvatar(userId) {
  await pool.query(
    `UPDATE users SET avatar_url = NULL, avatar_public_id = NULL, updated_at = NOW() WHERE id = $1::bigint`,
    [userId],
  );
}

async function setAvatar(userId, { secureUrl, publicId }) {
  await pool.query(
    `UPDATE users SET avatar_url = $1, avatar_public_id = $2, updated_at = NOW() WHERE id = $3::bigint`,
    [secureUrl, publicId, userId],
  );
}

module.exports = {
  patchUserProfile,
  clearAvatar,
  setAvatar,
};
