const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const { pool } = require("../config/db");
const { ROLES } = require("../constants/roles");
const { ASSIGNABLE_ADMIN_PERMISSIONS } = require("../constants/dashboardPermissions");
const { ensureUserRole, setUserPermissions, getUserDirectPermissionKeys } = require("./rbacService");
const { createPublicApiError } = require("../utils/publicApiError");

const BCRYPT_ROUNDS = 12;
const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function buildDisplayName(row) {
  return [row.first_name, row.father_name, row.family_name]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
}

function generateAccountIdCandidate() {
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += ACCOUNT_ID_CHARS[crypto.randomInt(0, ACCOUNT_ID_CHARS.length)];
  }
  return out;
}

async function generateUniqueAccountId() {
  for (let i = 0; i < 25; i += 1) {
    const id = generateAccountIdCandidate();
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE account_id = $1::text", [id]);
    if (rowCount === 0) return id;
  }
  throw createPublicApiError("تعذّر إكمال العملية مؤقتاً. حاول لاحقاً.", 503, "SERVICE_UNAVAILABLE");
}

function normalizePermissionKeys(raw) {
  const allowed = new Set(ASSIGNABLE_ADMIN_PERMISSIONS);
  const keys = Array.isArray(raw) ? raw.map((k) => String(k).trim()).filter(Boolean) : [];
  const invalid = keys.filter((k) => !allowed.has(k));
  if (invalid.length) {
    throw createPublicApiError("صلاحيات غير صالحة.", 400, "VALIDATION_ERROR");
  }
  return [...new Set(keys)];
}

async function assertDelegatorCanGrantPermissions({ grantedBy, permissionKeys, targetUserId, isSuperAdmin }) {
  if (!grantedBy || isSuperAdmin) return;

  const grantorId = Number(grantedBy);
  if (!Number.isInteger(grantorId) || grantorId < 1) {
    throw createPublicApiError("جلسة غير صالحة.", 401, "UNAUTHORIZED");
  }

  if (targetUserId != null && grantorId === Number(targetUserId)) {
    throw createPublicApiError("لا يمكنك تعديل صلاحيات حسابك.", 403, "FORBIDDEN");
  }

  const keys = normalizePermissionKeys(permissionKeys);
  const grantorKeys = new Set(await getUserDirectPermissionKeys(grantorId));
  const cannotGrant = keys.filter((key) => !grantorKeys.has(key));
  if (cannotGrant.length) {
    throw createPublicApiError("لا يمكنك منح صلاحيات لا تملكها.", 403, "FORBIDDEN");
  }
}

function validatePassword(password) {
  const np = String(password || "");
  if (np.length < 8) {
    throw createPublicApiError("كلمة المرور يجب ألا تقل عن 8 أحرف.", 400, "VALIDATION_ERROR");
  }
  if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(np)) {
    throw createPublicApiError("كلمة المرور يجب أن تحتوي على حرف ورقم على الأقل.", 400, "VALIDATION_ERROR");
  }
  return np;
}

async function getAdminUserRowById(id) {
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId < 1) return null;
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, role, is_active, created_at, updated_at
     FROM users
     WHERE id = $1::bigint
     LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row || row.role !== ROLES.ADMIN) return null;
  return row;
}

function mapAdminPublic(row, permissionKeys) {
  return {
    id: String(row.id),
    accountId: row.account_id,
    name: buildDisplayName(row) || row.first_name,
    firstName: row.first_name,
    fatherName: row.father_name,
    familyName: row.family_name,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    status: row.is_active ? "active" : "inactive",
    permissions: permissionKeys,
    permissionCount: permissionKeys.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listAdmins() {
  const { rows } = await pool.query(
    `SELECT u.id, u.account_id, u.first_name, u.father_name, u.family_name, u.email, u.role, u.is_active, u.created_at, u.updated_at
     FROM users u
     WHERE u.role = $1::text
     ORDER BY u.is_active DESC, u.created_at DESC`,
    [ROLES.ADMIN],
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => Number(r.id));
  const { rows: permRows } = await pool.query(
    `SELECT up.user_id, p.key
     FROM user_permissions up
     JOIN permissions p ON p.id = up.permission_id
     WHERE up.user_id = ANY($1::bigint[])
     ORDER BY p.key ASC`,
    [ids],
  );
  const permsByUser = new Map();
  for (const pr of permRows) {
    const uid = Number(pr.user_id);
    if (!permsByUser.has(uid)) permsByUser.set(uid, []);
    permsByUser.get(uid).push(pr.key);
  }

  return rows.map((row) => mapAdminPublic(row, permsByUser.get(Number(row.id)) || []));
}

async function createAdmin({ name, email, password, permissionKeys, grantedBy, isSuperAdmin = false }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw createPublicApiError("البريد الإلكتروني غير صالح.", 400, "VALIDATION_ERROR");
  }
  const displayName = String(name || "").trim();
  if (displayName.length < 2) {
    throw createPublicApiError("الاسم يجب ألا يقل عن حرفين.", 400, "VALIDATION_ERROR");
  }
  const validPassword = validatePassword(password);
  const keys = normalizePermissionKeys(permissionKeys);
  await assertDelegatorCanGrantPermissions({
    grantedBy,
    permissionKeys: keys,
    targetUserId: null,
    isSuperAdmin,
  });

  const { rows: existing } = await pool.query(
    `SELECT id FROM users WHERE lower(email::text) = lower($1::text) LIMIT 1`,
    [normalizedEmail],
  );
  if (existing[0]) {
    throw createPublicApiError("هذا البريد الإلكتروني مسجّل مسبقاً.", 409, "EMAIL_ALREADY_REGISTERED");
  }

  const passwordHash = await bcrypt.hash(validPassword, BCRYPT_ROUNDS);
  const accountId = await generateUniqueAccountId();

  const { rows } = await pool.query(
    `INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, email_verified, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, TRUE, TRUE)
    RETURNING id, account_id, first_name, father_name, family_name, email, role, is_active, created_at, updated_at`,
    [
      accountId,
      displayName,
      "-",
      "أدمن",
      normalizedEmail,
      passwordHash,
      ROLES.ADMIN,
      "JO",
      "+962791111111",
      "+962791111111",
      "ذكر",
    ],
  );
  const row = rows[0];
  await ensureUserRole({ userId: row.id, roleName: ROLES.ADMIN });
  const assigned = await setUserPermissions({ userId: row.id, permissionKeys: keys, grantedBy });
  return mapAdminPublic(row, assigned);
}

async function updateAdmin({ id, name, email, isActive, permissionKeys, grantedBy, isSuperAdmin = false }) {
  const row = await getAdminUserRowById(id);
  if (!row) {
    throw createPublicApiError("حساب الأدمن غير موجود.", 404, "NOT_FOUND");
  }

  const updates = [];
  const values = [];
  let i = 1;

  if (name !== undefined) {
    const displayName = String(name || "").trim();
    if (displayName.length < 2) {
      throw createPublicApiError("الاسم يجب ألا يقل عن حرفين.", 400, "VALIDATION_ERROR");
    }
    updates.push(`first_name = $${i}::text`);
    values.push(displayName);
    i += 1;
  }

  if (email !== undefined) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw createPublicApiError("البريد الإلكتروني غير صالح.", 400, "VALIDATION_ERROR");
    }
    const { rows: dup } = await pool.query(
      `SELECT id FROM users WHERE lower(email::text) = lower($1::text) AND id <> $2::bigint LIMIT 1`,
      [normalizedEmail, row.id],
    );
    if (dup[0]) {
      throw createPublicApiError("هذا البريد الإلكتروني مسجّل مسبقاً.", 409, "EMAIL_ALREADY_REGISTERED");
    }
    updates.push(`email = $${i}::text`);
    values.push(normalizedEmail);
    i += 1;
  }

  if (isActive !== undefined) {
    updates.push(`is_active = $${i}::boolean`);
    values.push(Boolean(isActive));
    i += 1;
  }

  let updatedRow = row;
  if (updates.length) {
    updates.push("updated_at = NOW()");
    values.push(row.id);
    const { rows } = await pool.query(
      `UPDATE users SET ${updates.join(", ")}
       WHERE id = $${i}::bigint AND role = $${i + 1}::text
       RETURNING id, account_id, first_name, father_name, family_name, email, role, is_active, created_at, updated_at`,
      [...values, ROLES.ADMIN],
    );
    updatedRow = rows[0];
  }

  let assigned;
  if (permissionKeys !== undefined) {
    const keys = normalizePermissionKeys(permissionKeys);
    await assertDelegatorCanGrantPermissions({
      grantedBy,
      permissionKeys: keys,
      targetUserId: updatedRow.id,
      isSuperAdmin,
    });
    assigned = await setUserPermissions({ userId: updatedRow.id, permissionKeys: keys, grantedBy });
  } else {
    const { rows: permRows } = await pool.query(
      `SELECT p.key
       FROM user_permissions up
       JOIN permissions p ON p.id = up.permission_id
       WHERE up.user_id = $1::bigint
       ORDER BY p.key ASC`,
      [updatedRow.id],
    );
    assigned = permRows.map((r) => r.key);
  }

  return mapAdminPublic(updatedRow, assigned);
}

module.exports = {
  listAdmins,
  createAdmin,
  updateAdmin,
  getAdminUserRowById,
};
