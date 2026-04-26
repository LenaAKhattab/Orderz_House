/**
 * Promote a user from admin to super_admin (users.role + user_roles).
 *
 * Usage (from backend/):
 *   node scripts/promoteUserToSuperAdminByEmail.js user@example.com
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: node scripts/promoteUserToSuperAdminByEmail.js <email>");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT id, role, email FROM users WHERE lower(trim(email)) = $1 LIMIT 1`, [email]);
    let u = rows[0];
    if (!u) {
      const local = email.includes("@") ? email.split("@")[0] : email;
      const hint = local.length > 4 ? `${local.slice(0, 5)}%` : `${local}%`;
      const { rows: near } = await client.query(
        `SELECT id, role, email FROM users WHERE lower(email) LIKE $1 OR split_part(lower(email), '@', 1) LIKE $2 ORDER BY id LIMIT 12`,
        [`%${local}%`, hint],
      );
      console.error(`No user found with email: ${email}`);
      if (near.length) {
        console.error("Possible matches in this database:");
        near.forEach((r) => console.error(`  - ${r.email} (id=${r.id}, role=${r.role})`));
      }
      process.exit(1);
    }
    if (u.role === "super_admin") {
      console.log(`User ${u.email} (id=${u.id}) is already super_admin.`);
      await client.query("COMMIT");
      return;
    }
    if (u.role !== "admin") {
      console.error(`User role is "${u.role}" (expected "admin"). Refusing to promote without admin role.`);
      process.exit(1);
    }

    await client.query(`UPDATE users SET role = 'super_admin', updated_at = NOW() WHERE id = $1`, [u.id]);

    await client.query(
      `DELETE FROM user_roles ur
       USING roles r
       WHERE ur.user_id = $1 AND ur.role_id = r.id AND r.name = 'admin'`,
      [u.id],
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.name = 'super_admin'
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [u.id],
    );

    await client.query("COMMIT");
    console.log(`OK: ${u.email} (id=${u.id}) promoted to super_admin. Sign out and sign in again so JWT picks up the new role.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(e.message || e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
