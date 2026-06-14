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

function mapPublicRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    subcategoryId: String(row.subcategory_id),
    slug: row.slug,
    name: row.name,
    nameEn: row.name_en || null,
    sortOrder: row.sort_order,
    subcategorySlug: row.subcategory_slug,
    subcategoryName: row.subcategory_name,
    categoryId: String(row.category_id),
    categorySlug: row.category_slug,
    categoryName: row.category_name,
  };
}

async function listActivePaginated({ page = 1, limit = 16 } = {}) {
  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(64, Math.max(1, Number(limit) || 16));
  const offset = (pg - 1) * lim;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM sub_subcategories ss
     JOIN subcategories s ON s.id = ss.subcategory_id
     JOIN categories c ON c.id = s.category_id
     WHERE ss.is_active = TRUE
       AND s.is_active = TRUE
       AND c.is_active = TRUE`,
  );
  const total = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / lim));

  const { rows } = await pool.query(
    `SELECT ss.id, ss.subcategory_id, ss.slug, ss.name, ss.name_en, ss.sort_order,
            s.slug AS subcategory_slug, s.name AS subcategory_name,
            c.id AS category_id, c.slug AS category_slug, c.name AS category_name
     FROM sub_subcategories ss
     JOIN subcategories s ON s.id = ss.subcategory_id
     JOIN categories c ON c.id = s.category_id
     WHERE ss.is_active = TRUE
       AND s.is_active = TRUE
       AND c.is_active = TRUE
     ORDER BY c.sort_order ASC, s.sort_order ASC, ss.sort_order ASC, ss.id ASC
     LIMIT $1 OFFSET $2`,
    [lim, offset],
  );

  return {
    items: rows.map(mapPublicRow),
    page: pg,
    limit: lim,
    total,
    totalPages,
    hasNextPage: pg < totalPages,
    hasPrevPage: pg > 1,
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
  listActivePaginated,
  listActiveBySubcategory,
  listActiveByCategory,
};

