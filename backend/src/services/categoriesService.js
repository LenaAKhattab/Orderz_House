const { pool } = require("../config/db");

async function listCategories() {
  const { rows } = await pool.query(
    `SELECT id, slug, name, description, image_url, sort_order, is_active, created_at, updated_at
     FROM categories
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows;
}

module.exports = {
  listCategories,
};

