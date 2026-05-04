const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { pool } = require("../config/db");
const { ROLES, PUBLIC_SIGNUP_ROLES } = require("../constants/roles");
const { ensureUserRole, resolveAuthzContext } = require("./rbacService");
const notificationService = require("./notificationService");
const authOtpService = require("./authOtpService");
const { createPublicApiError } = require("../utils/publicApiError");

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

const BCRYPT_ROUNDS = 12;
const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ACCOUNT_ID_ATTEMPTS = 25;

const ensureJwtSecret = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    const err = new Error("Server configuration error.");
    err.statusCode = 500;
    throw err;
  }
};

function generateAccountIdCandidate() {
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += ACCOUNT_ID_CHARS[crypto.randomInt(0, ACCOUNT_ID_CHARS.length)];
  }
  return out;
}

async function generateUniqueAccountId() {
  for (let i = 0; i < MAX_ACCOUNT_ID_ATTEMPTS; i += 1) {
    const id = generateAccountIdCandidate();
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE account_id = $1::text", [id]);
    if (rowCount === 0) {
      return id;
    }
  }
  throw createPublicApiError("تعذّر إكمال التسجيل مؤقتاً. حاول لاحقاً.", 503, "SERVICE_UNAVAILABLE");
}

/**
 * Public signup: role is derived only from accountType — never from raw client "role".
 */
function resolveSignupRole(accountType) {
  if (accountType === "client") {
    return ROLES.CLIENT;
  }
  if (accountType === "freelancer") {
    return ROLES.FREELANCER;
  }
  return null;
}

function mapUserPublic(row) {
  if (!row) return null;
  const prefs = row.notification_preferences;
  const notificationPreferences =
    prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs : {};
  return {
    id: String(row.id),
    accountId: row.account_id,
    firstName: row.first_name,
    fatherName: row.father_name,
    familyName: row.family_name,
    email: row.email,
    emailVerified: row.email_verified !== false,
    // Backward-compatible legacy role field (deprecated once RBAC fully migrated)
    role: row.role,
    country: row.country,
    phone: row.phone,
    whatsApp: row.whatsapp,
    gender: row.gender,
    freelancerCategories: row.freelancer_categories || null,
    isActive: row.is_active,
    createdAt: row.created_at,
    avatarUrl: row.avatar_url || null,
    professionalTitle: row.professional_title || null,
    bio: row.bio || null,
    skills: row.skills || null,
    websiteUrl: row.website_url || null,
    linkedinUrl: row.linkedin_url || null,
    githubUrl: row.github_url || null,
    behanceUrl: row.behance_url || null,
    portfolioUrl: row.portfolio_url || null,
    companyName: row.company_name || null,
    billingName: row.billing_name || null,
    billingCountry: row.billing_country || null,
    billingCity: row.billing_city || null,
    billingNotes: row.billing_notes || null,
    preferredWithdrawalMethod: row.preferred_withdrawal_method || null,
    payoutNotesHint: row.payout_notes_hint || null,
    notificationPreferences,
  };
}

function withAuthz(user, authz) {
  return {
    ...user,
    primaryRole: authz.primaryRole,
    roles: authz.roles.map((r) => r.name),
    permissions: authz.permissions,
  };
}

async function findUserByEmail(emailNormalized) {
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, password_hash, role,
            country, phone, whatsapp, gender, freelancer_categories, is_active, email_verified, created_at,
            avatar_url, professional_title, bio, skills, website_url, linkedin_url, github_url, behance_url, portfolio_url,
            company_name, billing_name, billing_country, billing_city, billing_notes,
            preferred_withdrawal_method, payout_notes_hint, notification_preferences
     FROM users WHERE lower(email::text) = lower($1::text) LIMIT 1`,
    [emailNormalized],
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, role,
            country, phone, whatsapp, gender, freelancer_categories, is_active, email_verified, created_at,
            avatar_url, avatar_public_id, professional_title, bio, skills, website_url, linkedin_url, github_url, behance_url, portfolio_url,
            company_name, billing_name, billing_country, billing_city, billing_notes,
            preferred_withdrawal_method, payout_notes_hint, notification_preferences
     FROM users WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

async function getUserRowByIdForAuthz(id) {
  const { rows } = await pool.query(
    `SELECT id, account_id, email, role, is_active
     FROM users WHERE id = $1::bigint LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

function signToken(userRow) {
  ensureJwtSecret();
  return jwt.sign(
    {
      sub: String(userRow.id),
      accountId: userRow.account_id,
      role: userRow.role,
      email: userRow.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}

function handleUniqueViolation(error) {
  if (error.code !== "23505") {
    return null;
  }
  const detail = error.detail || "";
  if (detail.includes("(email)")) {
    return createPublicApiError("هذا البريد الإلكتروني مسجّل مسبقاً.", 409, "EMAIL_ALREADY_REGISTERED");
  }
  if (detail.includes("(account_id)")) {
    return createPublicApiError("تعذّر إكمال التسجيل. حاول مجدداً.", 409, "REGISTRATION_FAILED");
  }
  return createPublicApiError("تعذّر إكمال التسجيل. حاول مجدداً.", 409, "REGISTRATION_FAILED");
}

function mapDbSchemaError(error) {
  if (!error || !error.code) return null;
  if (error.code === "42P01") {
    return createPublicApiError("قاعدة البيانات غير مكتملة. تواصل مع الدعم أو نفّذ التهيئة والترحيل.", 503, "SCHEMA_MISMATCH");
  }
  if (error.code === "42703") {
    return createPublicApiError("إعداد قاعدة البيانات غير متطابق. حدّث المخطط أو تواصل مع الدعم.", 503, "SCHEMA_MISMATCH");
  }
  return null;
}

function normalizePhonePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

function composeE164(fieldName, raw) {
  const cc = normalizePhonePart(raw?.countryCode);
  const num = normalizePhonePart(raw?.number);
  const e164 = `${cc}${num}`;
  const phonePattern = /^\+[1-9]\d{7,14}$/;
  if (!phonePattern.test(e164)) {
    throw createPublicApiError(
      fieldName === "phone"
        ? "رقم الجوال يجب أن يكون بالصيغة الدولية (مثال: +9665xxxxxxxx)."
        : "رقم واتساب يجب أن يكون بالصيغة الدولية (مثال: +9665xxxxxxxx).",
      400,
      "VALIDATION_ERROR",
    );
  }
  return e164;
}

async function buildRegistrationRowData(payload) {
  const email = String(payload.email).trim().toLowerCase();
  const role = resolveSignupRole(payload.accountType);

  if (!role || !PUBLIC_SIGNUP_ROLES.includes(role)) {
    throw createPublicApiError("نوع الحساب غير صالح.", 400, "VALIDATION_ERROR");
  }

  const passwordHash = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);

  let freelancerCategories = null;
  if (role === ROLES.FREELANCER) {
    const raw = payload.categories;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw createPublicApiError("اختر تصنيفاً واحداً على الأقل.", 400, "VALIDATION_ERROR");
    }
    freelancerCategories = [...new Set(raw)].sort();
  }

  const phone = composeE164("phone", payload.phone);
  const whatsApp = composeE164("whatsApp", payload.whatsApp);

  return {
    email,
    role,
    passwordHash,
    freelancerCategories,
    phone,
    whatsApp,
    firstName: String(payload.firstName).trim(),
    fatherName: String(payload.fatherName).trim(),
    familyName: String(payload.familyName).trim(),
    country: String(payload.country).trim().toUpperCase(),
    gender: String(payload.gender).trim(),
    termsAccepted: Boolean(payload.termsAccepted),
  };
}

async function registerUser(payload) {
  ensureJwtSecret();

  const data = await buildRegistrationRowData(payload);
  const { email, role, passwordHash, freelancerCategories, phone, whatsApp } = data;

  const existing = await findUserByEmail(email);
  if (existing && existing.email_verified) {
    throw createPublicApiError("هذا البريد الإلكتروني مسجّل مسبقاً.", 409, "EMAIL_ALREADY_REGISTERED");
  }

  try {
    if (existing && !existing.email_verified) {
      await pool.query(
        `UPDATE users SET
          first_name = $1::text, father_name = $2::text, family_name = $3::text,
          password_hash = $4::text, role = $5::text, country = $6::text, phone = $7::text, whatsapp = $8::text,
          gender = $9::text, terms_accepted = $10::boolean, freelancer_categories = $11::text[],
          email_verified = FALSE, updated_at = NOW()
        WHERE id = $12::bigint`,
        [
          data.firstName,
          data.fatherName,
          data.familyName,
          passwordHash,
          role,
          data.country,
          phone,
          whatsApp,
          data.gender,
          data.termsAccepted,
          freelancerCategories,
          existing.id,
        ],
      );
      await ensureUserRole({ userId: existing.id, roleName: role });
      await authOtpService.insertRegistrationOtp({ userId: existing.id, email });
      return { requiresEmailVerification: true, email };
    }

    const accountId = await generateUniqueAccountId();
    const { rows } = await pool.query(
      `INSERT INTO users (
        account_id, first_name, father_name, family_name, email, password_hash, role,
        country, phone, whatsapp, gender, terms_accepted, freelancer_categories, email_verified
      ) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::text, $10::text, $11::text, $12::boolean, $13::text[], FALSE)
      RETURNING id, account_id, first_name, father_name, family_name, email, role,
                country, phone, whatsapp, gender, freelancer_categories, is_active, email_verified, created_at`,
      [
        accountId,
        data.firstName,
        data.fatherName,
        data.familyName,
        email,
        passwordHash,
        role,
        data.country,
        phone,
        whatsApp,
        data.gender,
        data.termsAccepted,
        freelancerCategories,
      ],
    );
    const row = rows[0];
    try {
      await ensureUserRole({ userId: row.id, roleName: row.role });
      await authOtpService.insertRegistrationOtp({ userId: row.id, email: row.email });
    } catch (e) {
      await pool.query(`DELETE FROM users WHERE id = $1::bigint`, [row.id]);
      throw e;
    }
    return { requiresEmailVerification: true, email: row.email };
  } catch (error) {
    const mapped = handleUniqueViolation(error);
    if (mapped) throw mapped;

    const schemaErr = mapDbSchemaError(error);
    if (schemaErr) throw schemaErr;

    throw error;
  }
}

async function buildAuthResponseForUserId(userId) {
  ensureJwtSecret();
  const row = await findUserById(userId);
  if (!row) {
    throw createPublicApiError("المستخدم غير موجود.", 404, "NOT_FOUND");
  }
  await ensureUserRole({ userId: row.id, roleName: row.role });
  const authz = await resolveAuthzContext({ userId: row.id, legacyRole: row.role });
  const token = signToken(row);
  return { user: withAuthz(mapUserPublic(row), authz), token };
}

async function loginUser(emailRaw, password) {
  ensureJwtSecret();
  const email = String(emailRaw).trim().toLowerCase();
  let user;
  try {
    user = await findUserByEmail(email);
  } catch (error) {
    const schemaErr = mapDbSchemaError(error);
    if (schemaErr) throw schemaErr;
    throw error;
  }

  const generic = () => createPublicApiError("البريد الإلكتروني أو كلمة المرور غير صحيحة.", 401, "INVALID_CREDENTIALS");

  if (!user) {
    throw generic();
  }
  if (user.email_verified === false) {
    throw createPublicApiError("يرجى تأكيد البريد الإلكتروني قبل تسجيل الدخول.", 403, "EMAIL_NOT_VERIFIED");
  }
  if (!user.is_active) {
    throw createPublicApiError("تم تعطيل هذا الحساب.", 403, "ACCOUNT_DISABLED");
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw generic();
  }

  const token = signToken(user);
  const { password_hash: _, ...rest } = user;
  await ensureUserRole({ userId: rest.id, roleName: rest.role });
  const authz = await resolveAuthzContext({ userId: rest.id, legacyRole: rest.role });
  return { user: withAuthz(mapUserPublic(rest), authz), token };
}

async function getPublicUserById(id) {
  let row;
  try {
    row = await findUserById(id);
  } catch (error) {
    const schemaErr = mapDbSchemaError(error);
    if (schemaErr) throw schemaErr;
    throw error;
  }
  if (!row) {
    throw createPublicApiError("المستخدم غير موجود.", 404, "NOT_FOUND");
  }
  if (row.email_verified === false) {
    throw createPublicApiError("يرجى تأكيد البريد الإلكتروني قبل المتابعة.", 403, "EMAIL_NOT_VERIFIED");
  }
  const authz = await resolveAuthzContext({ userId: row.id, legacyRole: row.role });
  return withAuthz(mapUserPublic(row), authz);
}

async function changePasswordForUser(userId, currentPassword, newPassword) {
  const { rows } = await pool.query(`SELECT id, password_hash FROM users WHERE id = $1::bigint LIMIT 1`, [userId]);
  const row = rows[0];
  if (!row) {
    throw createPublicApiError("المستخدم غير موجود.", 404, "NOT_FOUND");
  }
  const match = await bcrypt.compare(String(currentPassword || ""), row.password_hash);
  if (!match) {
    throw createPublicApiError("كلمة المرور الحالية غير صحيحة.", 400, "INVALID_PASSWORD");
  }
  const np = String(newPassword || "");
  if (np.length < 8) {
    throw createPublicApiError("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.", 400, "VALIDATION_ERROR");
  }
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(np)) {
    throw createPublicApiError("كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل.", 400, "VALIDATION_ERROR");
  }
  const newHash = await bcrypt.hash(np, BCRYPT_ROUNDS);
  await pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::bigint`, [newHash, userId]);
}

module.exports = {
  registerUser,
  loginUser,
  getPublicUserById,
  getUserRowByIdForAuthz,
  buildAuthResponseForUserId,
  changePasswordForUser,
  findUserById,
};
