const { pool } = require("../config/db");

function mapRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    subcategoryId: String(row.subcategory_id),
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listActiveBySubcategory(subcategoryId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM sub_subcategories
     WHERE subcategory_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
    [Number(subcategoryId)],
  );
  return rows.map(mapRow);
}

async function listActiveByCategory(categoryId) {
  const { rows } = await pool.query(
    `SELECT ss.*, s.name AS subcategory_name, s.slug AS subcategory_slug
     FROM sub_subcategories ss
     JOIN subcategories s ON s.id = ss.subcategory_id
     WHERE s.category_id = $1
       AND ss.is_active = TRUE
       AND s.is_active = TRUE
     ORDER BY s.sort_order ASC, ss.sort_order ASC, ss.id ASC`,
    [Number(categoryId)],
  );
  return rows.map((r) => ({
    ...mapRow(r),
    subcategoryName: r.subcategory_name,
    subcategorySlug: r.subcategory_slug,
  }));
}

module.exports = {
  listActiveBySubcategory,
  listActiveByCategory,
};

