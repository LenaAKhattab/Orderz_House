const { pool } = require("../config/db");

async function listCategories() {
  const { rows } = await pool.query(
    `SELECT id, slug, name, name_en, description, image_url, sort_order, is_active,
            show_on_homepage, card_action, external_url, button_label, is_service_category,
            created_at, updated_at
     FROM categories
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows;
}

/** Single-query tree for marketplace category filters (category → sub-subcategories). */
async function listCategoryFilterTree() {
  const { rows } = await pool.query(
    `SELECT c.id AS category_id, c.name AS category_name, c.name_en AS category_name_en,
            ss.id AS sub_sub_id, ss.name AS sub_sub_name, ss.name_en AS sub_sub_name_en
     FROM categories c
     INNER JOIN subcategories s ON s.category_id = c.id AND s.is_active = TRUE
     INNER JOIN sub_subcategories ss ON ss.subcategory_id = s.id AND ss.is_active = TRUE
     WHERE c.is_active = TRUE
     ORDER BY c.sort_order ASC, c.id ASC, ss.sort_order ASC, ss.id ASC`,
  );

  const byCategory = new Map();
  for (const row of rows) {
    const catId = String(row.category_id);
    if (!byCategory.has(catId)) {
      byCategory.set(catId, {
        id: catId,
        name: String(row.category_name || ""),
        name_en: row.category_name_en || null,
        subSubs: [],
      });
    }
    byCategory.get(catId).subSubs.push({
      id: String(row.sub_sub_id),
      name: String(row.sub_sub_name || ""),
      name_en: row.sub_sub_name_en || null,
    });
  }

  return [...byCategory.values()];
}

async function getCategoryImageBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT image_data, image_mime, image_url
     FROM categories
     WHERE slug = $1 AND is_active = TRUE
     LIMIT 1`,
    [slug],
  );
  return rows[0] || null;
}

module.exports = {
  listCategories,
  listCategoryFilterTree,
  getCategoryImageBySlug,
};

