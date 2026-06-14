const { pool } = require("../config/db");
const { mapPageRow, mapPublicListRow, mapPublicDetailRow } = require("../utils/publicSitePageMapper");

const PAGE_SELECT = `
  SELECT
    id, slug, title, menu_label, content,
    meta_title, meta_description,
    is_published, show_in_mobile_menu, show_in_footer,
    sort_order, is_system, updated_by,
    created_at, updated_at
  FROM public_site_pages
`;

async function listPublishedForNav() {
  const { rows } = await pool.query(
    `${PAGE_SELECT}
     WHERE is_published = TRUE
       AND (show_in_mobile_menu = TRUE OR show_in_footer = TRUE)
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapPublicListRow);
}

async function getPublishedBySlug(slug) {
  const { rows } = await pool.query(
    `${PAGE_SELECT}
     WHERE slug = $1 AND is_published = TRUE
     LIMIT 1`,
    [String(slug || "").trim()],
  );
  return rows.length ? mapPublicDetailRow(rows[0]) : null;
}

async function listAllPages() {
  const { rows } = await pool.query(
    `${PAGE_SELECT}
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapPageRow);
}

async function getPageById(id) {
  const { rows } = await pool.query(`${PAGE_SELECT} WHERE id = $1 LIMIT 1`, [Number(id)]);
  return rows.length ? mapPageRow(rows[0]) : null;
}

async function updatePage(id, payload, updatedByUserId) {
  const allowed = {
    title: "title",
    menuLabel: "menu_label",
    content: "content",
    metaTitle: "meta_title",
    metaDescription: "meta_description",
    isPublished: "is_published",
    showInMobileMenu: "show_in_mobile_menu",
    showInFooter: "show_in_footer",
    sortOrder: "sort_order",
  };

  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, column] of Object.entries(allowed)) {
    if (payload[key] !== undefined) {
      fields.push(`${column} = $${idx++}`);
      values.push(payload[key]);
    }
  }

  if (!fields.length) {
    return getPageById(id);
  }

  fields.push(`updated_by = $${idx++}`);
  values.push(updatedByUserId ?? null);
  fields.push("updated_at = NOW()");
  values.push(Number(id));

  const updateSql = `
    UPDATE public_site_pages
    SET ${fields.join(", ")}
    WHERE id = $${idx}
    RETURNING
      id, slug, title, menu_label, content,
      meta_title, meta_description,
      is_published, show_in_mobile_menu, show_in_footer,
      sort_order, is_system, updated_by,
      created_at, updated_at
  `;

  const result = await pool.query(updateSql, values);
  return result.rows.length ? mapPageRow(result.rows[0]) : null;
}

module.exports = {
  listPublishedForNav,
  getPublishedBySlug,
  listAllPages,
  getPageById,
  updatePage,
};
