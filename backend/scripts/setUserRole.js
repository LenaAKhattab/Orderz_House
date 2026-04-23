/**
 * Usage (from backend/):
 *   node scripts/setUserRole.js lena@gmail.com client
 *
 * Keeps both legacy users.role and RBAC user_roles in sync.
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");

async function main() {
  const email = String(process.argv[2] || "").trim();
  const roleName = String(process.argv[3] || "").trim();

  if (!email || !roleName) {
    // eslint-disable-next-line no-console
    console.error("Usage: node scripts/setUserRole.js <email> <roleName>");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: uRows } = await client.query(
      "SELECT id, email, role FROM users WHERE lower(email)=lower($1) LIMIT 1",
      [email],
    );
    const user = uRows[0];
    if (!user) {
      // eslint-disable-next-line no-console
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    const { rows: rRows } = await client.query("SELECT id FROM roles WHERE name=$1 LIMIT 1", [roleName]);
    const role = rRows[0];
    if (!role) {
      // eslint-disable-next-line no-console
      console.error(`RBAC role not found in roles table: ${roleName}`);
      process.exit(1);
    }

    await client.query("UPDATE users SET role=$2, updated_at=NOW() WHERE id=$1", [user.id, roleName]);
    await client.query("DELETE FROM user_roles WHERE user_id=$1", [user.id]);
    await client.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
      user.id,
      role.id,
    ]);

    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ok: true,
        userId: String(user.id),
        email: user.email,
        previousRole: user.role,
        newRole: roleName,
      }),
    );
  } catch (e) {
    await client.query("ROLLBACK");
    // eslint-disable-next-line no-console
    console.error(e.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

