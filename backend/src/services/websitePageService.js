const { pool } = require("../config/db");

const BLOCK_TYPES = new Set(["title", "text", "image", "text_image"]);

function mapPageRow(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    pageType: row.page_type,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBlockRow(row) {
  return {
    id: row.id,
    pageId: row.page_id,
    blockType: row.block_type,
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PAGE_SELECT =
  `SELECT id, slug, title, page_type, is_active, created_at, updated_at FROM website_pages`;

const BLOCK_SELECT =
  `SELECT id, page_id, block_type, title, body, image_url, sort_order, is_active, created_at, updated_at
   FROM website_page_blocks`;

async function listAllPages() {
  const { rows } = await pool.query(`${PAGE_SELECT} ORDER BY slug ASC`);
  return rows.map(mapPageRow);
}

async function getPageBySlug(slug, { includeInactiveBlocks = false } = {}) {
  const { rows } = await pool.query(`${PAGE_SELECT} WHERE slug = $1 LIMIT 1`, [slug]);
  if (!rows.length) return null;

  const page = mapPageRow(rows[0]);
  const blockQuery = includeInactiveBlocks
    ? `${BLOCK_SELECT} WHERE page_id = $1 ORDER BY sort_order ASC, id ASC`
    : `${BLOCK_SELECT} WHERE page_id = $1 AND is_active = TRUE ORDER BY sort_order ASC, id ASC`;

  const blockRes = await pool.query(blockQuery, [page.id]);
  return {
    page,
    blocks: blockRes.rows.map(mapBlockRow),
  };
}

async function updatePageBySlug(slug, { title, isActive }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(title);
  }
  if (isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(Boolean(isActive));
  }

  if (!fields.length) {
    const existing = await getPageBySlug(slug, { includeInactiveBlocks: true });
    return existing?.page || null;
  }

  fields.push("updated_at = NOW()");
  values.push(slug);

  const { rows } = await pool.query(
    `UPDATE website_pages SET ${fields.join(", ")} WHERE slug = $${idx}
     RETURNING id, slug, title, page_type, is_active, created_at, updated_at`,
    values,
  );
  return rows.length ? mapPageRow(rows[0]) : null;
}

async function getBlockById(blockId) {
  const { rows } = await pool.query(`${BLOCK_SELECT} WHERE id = $1 LIMIT 1`, [blockId]);
  return rows.length ? mapBlockRow(rows[0]) : null;
}

async function createPageBlock(slug, payload) {
  const pageData = await getPageBySlug(slug, { includeInactiveBlocks: true });
  if (!pageData) return null;

  const blockType = String(payload.blockType || "").trim();
  if (!BLOCK_TYPES.has(blockType)) {
    const err = new Error("INVALID_BLOCK_TYPE");
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const maxRes = await client.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM website_page_blocks WHERE page_id = $1`,
      [pageData.page.id],
    );
    const nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;
    const { rows } = await client.query(
      `INSERT INTO website_page_blocks
         (page_id, block_type, title, body, image_url, sort_order, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW())
       RETURNING id, page_id, block_type, title, body, image_url, sort_order, is_active, created_at, updated_at`,
      [
        pageData.page.id,
        blockType,
        payload.title ?? null,
        payload.body ?? null,
        payload.imageUrl ?? null,
        nextOrder,
      ],
    );
    await client.query("COMMIT");
    return mapBlockRow(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updatePageBlock(slug, blockId, payload) {
  const pageData = await getPageBySlug(slug, { includeInactiveBlocks: true });
  if (!pageData) return null;

  const block = pageData.blocks.find((b) => Number(b.id) === Number(blockId));
  if (!block) return null;

  if (payload.blockType !== undefined) {
    const blockType = String(payload.blockType || "").trim();
    if (!BLOCK_TYPES.has(blockType)) {
      const err = new Error("INVALID_BLOCK_TYPE");
      err.status = 400;
      throw err;
    }
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (payload.blockType !== undefined) {
    fields.push(`block_type = $${idx++}`);
    values.push(payload.blockType);
  }
  if (payload.title !== undefined) {
    fields.push(`title = $${idx++}`);
    values.push(payload.title);
  }
  if (payload.body !== undefined) {
    fields.push(`body = $${idx++}`);
    values.push(payload.body);
  }
  if (payload.imageUrl !== undefined) {
    fields.push(`image_url = $${idx++}`);
    values.push(payload.imageUrl);
  }
  if (payload.isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(Boolean(payload.isActive));
  }

  if (!fields.length) return block;

  fields.push("updated_at = NOW()");
  values.push(blockId, pageData.page.id);

  const { rows } = await pool.query(
    `UPDATE website_page_blocks SET ${fields.join(", ")}
     WHERE id = $${idx} AND page_id = $${idx + 1}
     RETURNING id, page_id, block_type, title, body, image_url, sort_order, is_active, created_at, updated_at`,
    values,
  );
  return rows.length ? mapBlockRow(rows[0]) : null;
}

async function deletePageBlock(slug, blockId) {
  const pageData = await getPageBySlug(slug, { includeInactiveBlocks: true });
  if (!pageData) return false;

  const { rowCount } = await pool.query(
    `DELETE FROM website_page_blocks WHERE id = $1 AND page_id = $2`,
    [blockId, pageData.page.id],
  );
  return rowCount > 0;
}

async function reorderPageBlocks(slug, orderedIds) {
  const pageData = await getPageBySlug(slug, { includeInactiveBlocks: true });
  if (!pageData) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id FROM website_page_blocks WHERE page_id = $1 ORDER BY sort_order ASC, id ASC`,
      [pageData.page.id],
    );
    const existingIds = existing.rows.map((r) => Number(r.id));
    const requested = orderedIds.map((id) => Number(id));

    if (requested.length !== existingIds.length) {
      const err = new Error("INVALID_BLOCK_REORDER");
      err.status = 400;
      throw err;
    }

    const existingSet = new Set(existingIds);
    for (const id of requested) {
      if (!existingSet.has(id)) {
        const err = new Error("INVALID_BLOCK_REORDER");
        err.status = 400;
        throw err;
      }
    }

    for (let i = 0; i < requested.length; i += 1) {
      await client.query(
        `UPDATE website_page_blocks SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        [i + 1, requested[i]],
      );
    }

    await client.query("COMMIT");
    const refreshed = await getPageBySlug(slug, { includeInactiveBlocks: true });
    return refreshed?.blocks || [];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listAllPages,
  getPageBySlug,
  updatePageBySlug,
  createPageBlock,
  updatePageBlock,
  deletePageBlock,
  reorderPageBlocks,
  getBlockById,
};
