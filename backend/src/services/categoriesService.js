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
  getCategoryImageBySlug,
};

