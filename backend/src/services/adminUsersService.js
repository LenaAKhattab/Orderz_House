const { pool } = require("../config/db");

function mapFreelancerRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    accountId: row.account_id,
    firstName: row.first_name,
    fatherName: row.father_name,
    familyName: row.family_name,
    email: row.email,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function searchFreelancers({ q = "", limit = 20 } = {}) {
  const query = String(q || "").trim();
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const values = [];
  const where = ["role = 'freelancer'"];
  let i = 1;

  if (query) {
    values.push(`%${query.toLowerCase()}%`);
    where.push(`(
      lower(email) LIKE $${i}
      OR lower(first_name) LIKE $${i}
      OR lower(father_name) LIKE $${i}
      OR lower(family_name) LIKE $${i}
      OR lower(account_id) LIKE $${i}
    )`);
    i += 1;
  }

  values.push(lim);

  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, is_active, created_at
     FROM users
     WHERE ${where.join(" AND ")}
     ORDER BY is_active DESC, id DESC
     LIMIT $${i}`,
    values,
  );
  return rows.map(mapFreelancerRow);
}

module.exports = {
  searchFreelancers,
};

