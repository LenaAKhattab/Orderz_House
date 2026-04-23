const { pool } = require("../config/db");

function mapSubcategory(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    slug: row.slug,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listActiveSubcategoriesByCategory(categoryId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM subcategories
     WHERE category_id = $1 AND is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
    [Number(categoryId)],
  );
  return rows.map(mapSubcategory);
}

module.exports = {
  listActiveSubcategoriesByCategory,
};

