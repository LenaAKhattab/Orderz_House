const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const { pool } = require("../config/db");
const { ROLES } = require("../constants/roles");
const { ensureUserRole } = require("./rbacService");
const { createPublicApiError } = require("../utils/publicApiError");
const { logFinancialAudit } = require("./financialCenterAuditService");

const BCRYPT_ROUNDS = 12;
const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { firstName: "مستخدم", fatherName: "-", familyName: "مالي" };
  if (parts.length === 1) return { firstName: parts[0], fatherName: "-", familyName: "-" };
  return {
    firstName: parts[0],
    fatherName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "-",
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
  const runner = client || pool;
  for (let i = 0; i < 25; i += 1) {
    const id = generateAccountIdCandidate();
    const { rowCount } = await runner.query("SELECT 1 FROM users WHERE account_id = $1::text", [id]);
    if (rowCount === 0) return id;
  }
  throw createPublicApiError("تعذّر إكمال العملية مؤقتاً.", 503, "SERVICE_UNAVAILABLE");
}

async function getPersonRowForAccount(personId, client) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT * FROM financial_people WHERE id = $1`, [Number(personId)]);
  return rows[0] || null;
}

async function assertPersonHasNoAccount(person) {
  if (!person) throw createPublicApiError("الموظف غير موجود.", 404, "NOT_FOUND");
  if (person.user_id) {
    throw createPublicApiError("هذا الموظف لديه حساب دخول مسبقاً.", 409, "ACCOUNT_ALREADY_EXISTS");
  }
}

async function assertEmailAvailable(email, client) {
  const runner = client || pool;
  const normalized = String(email || "").trim().toLowerCase();
  const { rows } = await runner.query(`SELECT id FROM users WHERE lower(email) = $1 LIMIT 1`, [normalized]);
  if (rows[0]) {
    throw createPublicApiError("هذا البريد الإلكتروني مسجّل مسبقاً.", 409, "EMAIL_ALREADY_REGISTERED");
  }
  return normalized;
}

/**
 * Create users row + link financial_people.user_id
 */
async function createLoginAccountForPerson({
  actorUserId,
  personId,
  loginEmail,
  password,
  fullName,
  client: externalClient,
}) {
  const person = await getPersonRowForAccount(personId, externalClient);
  await assertPersonHasNoAccount(person);

  const email = await assertEmailAvailable(loginEmail, externalClient);
  const validPassword = validatePassword(password);
  const names = splitFullName(fullName || person.full_name);
  const passwordHash = await bcrypt.hash(validPassword, BCRYPT_ROUNDS);

  const ownsTransaction = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (ownsTransaction) await client.query("BEGIN");
    const accountId = await generateUniqueAccountId(client);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (
        account_id, first_name, father_name, family_name, email, password_hash, role,
        country, phone, whatsapp, gender, terms_accepted, email_verified, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,TRUE,TRUE)
      RETURNING id, email, is_active, created_at`,
      [
        accountId,
        names.firstName,
        names.fatherName,
        names.familyName,
        email,
        passwordHash,
        ROLES.FINANCIAL_USER,
        "JO",
        person.phone || "+962700000000",
        person.phone || "+962700000000",
        "ذكر",
      ],
    );
    const user = userRows[0];
    await ensureUserRole({ userId: user.id, roleName: ROLES.FINANCIAL_USER });

    await client.query(
      `UPDATE financial_people SET
        user_id = $2,
        account_created_at = NOW(),
        email = COALESCE(email, $3),
        updated_by = $4,
        updated_at = NOW()
      WHERE id = $1`,
      [Number(personId), user.id, email, actorUserId],
    );

    await logFinancialAudit(
      {
        entityType: "financial_person",
        entityId: personId,
        action: "create_login_account",
        oldValue: { userId: null },
        newValue: { userId: String(user.id), loginEmail: email },
        actorId: actorUserId,
      },
      client,
    );

    if (ownsTransaction) await client.query("COMMIT");
    return {
      userId: String(user.id),
      loginEmail: user.email,
      isActive: Boolean(user.is_active),
      accountCreatedAt: new Date().toISOString(),
    };
  } catch (e) {
    if (ownsTransaction) await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    if (ownsTransaction) client.release();
  }
}

async function setPersonAccountActive({ actorUserId, personId, isActive }) {
  const person = await getPersonRowForAccount(personId);
  if (!person) throw createPublicApiError("الموظف غير موجود.", 404, "NOT_FOUND");
  if (!person.user_id) {
    throw createPublicApiError("لا يوجد حساب دخول مرتبط بهذا الموظف.", 400, "NO_LINKED_ACCOUNT");
  }

  const { rows: before } = await pool.query(`SELECT id, email, is_active, role FROM users WHERE id = $1`, [
    person.user_id,
  ]);
  const user = before[0];
  if (!user || user.role !== ROLES.FINANCIAL_USER) {
    throw createPublicApiError("حساب الدخول المرتبط غير صالح.", 400, "INVALID_LINKED_ACCOUNT");
  }

  await pool.query(`UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1`, [
    person.user_id,
    Boolean(isActive),
  ]);

  await logFinancialAudit({
    entityType: "financial_person",
    entityId: personId,
    action: isActive ? "activate_login_account" : "suspend_login_account",
    oldValue: { isActive: Boolean(user.is_active), loginEmail: user.email },
    newValue: { isActive: Boolean(isActive), loginEmail: user.email },
    actorId: actorUserId,
  });

  return {
    userId: String(person.user_id),
    loginEmail: user.email,
    isActive: Boolean(isActive),
  };
}

async function getPersonAccountInfo(personId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.user_id, p.account_created_at, p.full_name,
            u.email AS login_email, u.is_active AS account_is_active, u.created_at AS user_created_at
     FROM financial_people p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`,
    [Number(personId)],
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.user_id) {
    return { hasAccount: false, loginEmail: null, isActive: null, accountCreatedAt: null };
  }
  return {
    hasAccount: true,
    userId: String(row.user_id),
    loginEmail: row.login_email,
    isActive: Boolean(row.account_is_active),
    accountCreatedAt: row.account_created_at || row.user_created_at,
  };
}

module.exports = {
  createLoginAccountForPerson,
  setPersonAccountActive,
  getPersonAccountInfo,
  validatePassword,
  assertEmailAvailable,
};
