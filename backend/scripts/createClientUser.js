/**
 * Create a verified client user.
 *
 * Usage (from backend/):
 *   node scripts/createClientUser.js <email> <password>
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
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const password = String(process.argv[3] || "");
  if (!email || !password) {
    console.error("Usage: node scripts/createClientUser.js <email> <password>");
    process.exit(1);
  }

  const { rows: existing } = await pool.query(
    `SELECT id, email, role FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  if (existing[0]) {
    console.error(`User already exists: id=${existing[0].id} email=${existing[0].email} role=${existing[0].role}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const accountId = await generateUniqueAccountId();

  const { rows } = await pool.query(
    `INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, email_verified
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, account_id, email, role`,
    [
      accountId,
      "عاصم",
      "-",
      "عميل",
      email,
      passwordHash,
      "client",
      "JO",
      "+962790000002",
      "+962790000002",
      "ذكر",
      true,
      true,
    ],
  );

  const row = rows[0];
  await ensureUserRole({ userId: row.id, roleName: "client" });

  console.log(
    JSON.stringify(
      {
        ok: true,
        user: {
          id: String(row.id),
          accountId: row.account_id,
          email: row.email,
          role: row.role,
        },
        password,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
