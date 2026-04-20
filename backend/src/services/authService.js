const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { pool } = require("../config/db");
const { ROLES, PUBLIC_SIGNUP_ROLES } = require("../constants/roles");

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
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE account_id = $1", [id]);
    if (rowCount === 0) {
      return id;
    }
  }
  const err = new Error("Could not allocate a unique account ID. Please try again.");
  err.statusCode = 503;
  throw err;
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
  return {
    id: String(row.id),
    accountId: row.account_id,
    firstName: row.first_name,
    fatherName: row.father_name,
    familyName: row.family_name,
    email: row.email,
    role: row.role,
    country: row.country,
    phone: row.phone,
    whatsApp: row.whatsapp,
    gender: row.gender,
    freelancerCategories: row.freelancer_categories || null,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function findUserByEmail(emailNormalized) {
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, password_hash, role,
            country, phone, whatsapp, gender, freelancer_categories, is_active, created_at
     FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [emailNormalized],
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, role,
            country, phone, whatsapp, gender, freelancer_categories, is_active, created_at
     FROM users WHERE id = $1 LIMIT 1`,
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
    const err = new Error("This email is already registered.");
    err.statusCode = 409;
    return err;
  }
  if (detail.includes("(account_id)")) {
    const err = new Error("Registration could not be completed.");
    err.statusCode = 409;
    return err;
  }
  const err = new Error("Registration could not be completed.");
  err.statusCode = 409;
  return err;
}

function mapDbSchemaError(error) {
  if (!error || !error.code) return null;
  if (error.code === "42P01") {
    const err = new Error(
      "Database schema is missing the users table. Run backend/sql/init.sql against your database, then try again.",
    );
    err.statusCode = 503;
    return err;
  }
  if (error.code === "42703") {
    const err = new Error(
      "Database schema does not match the application. Re-run backend/sql/init.sql or migrate your database.",
    );
    err.statusCode = 503;
    return err;
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
    const err = new Error(
      fieldName === "phone"
        ? "Phone must include country code in international format (e.g. +9665xxxxxxxx)."
        : "WhatsApp must include country code in international format (e.g. +9665xxxxxxxx).",
    );
    err.statusCode = 400;
    throw err;
  }
  return e164;
}

async function registerUser(payload) {
  const email = String(payload.email).trim().toLowerCase();
  const role = resolveSignupRole(payload.accountType);

  if (!role || !PUBLIC_SIGNUP_ROLES.includes(role)) {
    const err = new Error("Invalid account type.");
    err.statusCode = 400;
    throw err;
  }

  ensureJwtSecret();

  const passwordHash = await bcrypt.hash(payload.password, BCRYPT_ROUNDS);
  const accountId = await generateUniqueAccountId();

  let freelancerCategories = null;
  if (role === ROLES.FREELANCER) {
    const raw = payload.categories;
    if (!Array.isArray(raw) || raw.length === 0) {
      const err = new Error("Select at least one category.");
      err.statusCode = 400;
      throw err;
    }
    freelancerCategories = [...new Set(raw)].sort();
  }

  const phone = composeE164("phone", payload.phone);
  const whatsApp = composeE164("whatsApp", payload.whatsApp);

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (
        account_id, first_name, father_name, family_name, email, password_hash, role,
        country, phone, whatsapp, gender, terms_accepted, freelancer_categories
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, account_id, first_name, father_name, family_name, email, role,
                country, phone, whatsapp, gender, freelancer_categories, is_active, created_at`,
      [
        accountId,
        String(payload.firstName).trim(),
        String(payload.fatherName).trim(),
        String(payload.familyName).trim(),
        email,
        passwordHash,
        role,
        String(payload.country).trim().toUpperCase(),
        phone,
        whatsApp,
        String(payload.gender).trim(),
        Boolean(payload.termsAccepted),
        freelancerCategories,
      ],
    );
    const row = rows[0];
    const token = signToken(row);
    return { user: mapUserPublic(row), token };
  } catch (error) {
    const mapped = handleUniqueViolation(error);
    if (mapped) throw mapped;

    const schemaErr = mapDbSchemaError(error);
    if (schemaErr) throw schemaErr;

    throw error;
  }
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

  const generic = () => {
    const err = new Error("Invalid email or password.");
    err.statusCode = 401;
    return err;
  };

  if (!user) {
    throw generic();
  }
  if (!user.is_active) {
    const err = new Error("This account has been disabled.");
    err.statusCode = 403;
    throw err;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw generic();
  }

  const token = signToken(user);
  const { password_hash: _, ...rest } = user;
  return { user: mapUserPublic(rest), token };
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
    const err = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }
  return mapUserPublic(row);
}

module.exports = {
  registerUser,
  loginUser,
  getPublicUserById,
};
