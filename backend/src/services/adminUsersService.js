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

async function searchFreelancers({ q = "", limit = 20, onlyActiveSubscription = false } = {}) {
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
  if (Boolean(onlyActiveSubscription)) {
    where.push(`EXISTS (
      SELECT 1
      FROM freelancer_subscriptions fs
      WHERE fs.freelancer_user_id = users.id
        AND fs.is_current = TRUE
        AND fs.status = 'active'
        AND fs.activation_status = 'company_approved'
    )`);
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

/** Full registration-style profile for admin review (no secrets). */
function mapFreelancerRegistrationProfile(row) {
  if (!row) return null;
  const cats = Array.isArray(row.freelancer_categories) ? row.freelancer_categories : [];
  return {
    id: String(row.id),
    accountId: row.account_id,
    firstName: row.first_name,
    fatherName: row.father_name,
    familyName: row.family_name,
    email: row.email,
    country: row.country,
    phone: row.phone,
    whatsapp: row.whatsapp,
    gender: row.gender,
    termsAccepted: Boolean(row.terms_accepted),
    freelancerCategories: cats,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getFreelancerRegistrationProfileForAdmin(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, role, country, phone, whatsapp, gender,
            terms_accepted, freelancer_categories, is_active, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.role !== "freelancer") {
    const err = new Error("Profile is only available for freelancer accounts.");
    err.statusCode = 400;
    throw err;
  }
  return mapFreelancerRegistrationProfile(row);
}

module.exports = {
  searchFreelancers,
  getFreelancerRegistrationProfileForAdmin,
};

