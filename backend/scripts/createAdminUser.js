/**
 * Create an admin user (legacy users.role + user_roles for RBAC).
 *
 * Usage (from backend/):
 *   node scripts/createAdminUser.js
 *   node scripts/createAdminUser.js you@mail.com "YourPassword123"
 *
 * Default (no args): ahmed2001@gmail.com — password must be passed as second arg in production.
 */
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcrypt");
const { pool } = require("../src/config/db");
const { ensureUserRole } = require("../src/services/rbacService");

const BCRYPT_ROUNDS = 12;
const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE account_id = $1", [id]);
    if (rowCount === 0) return id;
  }
  throw new Error("Could not allocate account_id.");
}

async function main() {
  const email = String(process.argv[2] || "ahmed2001@gmail.com")
    .trim()
    .toLowerCase();
  const password = process.argv[3] || "Ahmed2000";

  if (!email || !password) {
    console.error("Usage: node scripts/createAdminUser.js <email> <password>");
    process.exit(1);
  }

  const { rows: existing } = await pool.query(`SELECT id, email, role FROM users WHERE lower(email) = lower($1) LIMIT 1`, [
    email,
  ]);
  if (existing[0]) {
    console.error(`User already exists: id=${existing[0].id} email=${existing[0].email} role=${existing[0].role}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const accountId = await generateUniqueAccountId();

  const { rows } = await pool.query(
    `INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, freelancer_categories
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, account_id, email, role`,
    [
      accountId,
      "أحمد",
      "-",
      "مدير",
      email,
      passwordHash,
      "admin",
      "JO",
      "+962791111111",
      "+962791111111",
      "ذكر",
      true,
      null,
    ],
  );

  const row = rows[0];
  await ensureUserRole({ userId: row.id, roleName: "admin" });

  console.log("Created admin user:");
  console.log(`  id:         ${row.id}`);
  console.log(`  account_id: ${row.account_id}`);
  console.log(`  email:      ${row.email}`);
  console.log(`  role:       ${row.role}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
