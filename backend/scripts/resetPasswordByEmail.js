/**
 * Reset a user's password by email (bcrypt hash in users.password_hash).
 *
 * Usage (from backend/):
 *   node scripts/resetPasswordByEmail.js you@mail.com "NewPassword123"
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { assertOperationalScriptAllowed } = require("../src/utils/databaseEnvironmentSafety");
try {
  assertOperationalScriptAllowed("resetPasswordByEmail.js");
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

const bcrypt = require("bcrypt");
const { pool } = require("../src/config/db");

const BCRYPT_ROUNDS = 12;

async function main() {
  const email = String(process.argv[2] || "").trim();
  const password = process.argv[3] || "";

  if (!email || !password) {
    console.error("Usage: node scripts/resetPasswordByEmail.js <email> <password>");
    process.exit(1);
  }

  const { rows } = await pool.query(
    `SELECT id, email, role FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  const user = rows[0];
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pool.query(`UPDATE users SET password_hash = $1::text, updated_at = NOW() WHERE id = $2::bigint`, [
    passwordHash,
    Number(user.id),
  ]);

  console.log(
    JSON.stringify({
      ok: true,
      userId: String(user.id),
      email: user.email,
      role: user.role,
    }),
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
