const { pool } = require("../config/db");

function mapFaqRow(row) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FAQ_SELECT =
  `SELECT id, question, answer, sort_order, is_active, created_at, updated_at
   FROM website_faq_items`;

async function listActiveFaqItems() {
  const { rows } = await pool.query(
    `${FAQ_SELECT}
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapFaqRow);
}

async function listAllFaqItems() {
  const { rows } = await pool.query(
    `${FAQ_SELECT}
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapFaqRow);
}

async function getFaqItemById(id) {
  const { rows } = await pool.query(`${FAQ_SELECT} WHERE id = $1 LIMIT 1`, [id]);
  return rows.length ? mapFaqRow(rows[0]) : null;
}

async function createFaqItem({ question, answer }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const maxRes = await client.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM website_faq_items`,
    );
    const nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;
    const { rows } = await client.query(
      `INSERT INTO website_faq_items (question, answer, sort_order, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW(), NOW())
       RETURNING id, question, answer, sort_order, is_active, created_at, updated_at`,
      [question, answer, nextOrder],
    );
    await client.query("COMMIT");
    return mapFaqRow(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateFaqItem(id, { question, answer }) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (question !== undefined) {
    fields.push(`question = $${idx++}`);
    values.push(question);
  }
  if (answer !== undefined) {
    fields.push(`answer = $${idx++}`);
    values.push(answer);
  }

  if (!fields.length) {
    return getFaqItemById(id);
  }

  fields.push("updated_at = NOW()");
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE website_faq_items
     SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, question, answer, sort_order, is_active, created_at, updated_at`,
    values,
  );
  return rows.length ? mapFaqRow(rows[0]) : null;
}

async function deleteFaqItem(id) {
  const { rowCount } = await pool.query(`DELETE FROM website_faq_items WHERE id = $1`, [id]);
  return rowCount > 0;
}

async function reorderFaqItems(orderedIds) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`SELECT id FROM website_faq_items ORDER BY sort_order ASC, id ASC`);
    const existingIds = existing.rows.map((r) => Number(r.id));
    const requested = orderedIds.map((id) => Number(id));

    if (requested.length !== existingIds.length) {
      const err = new Error("INVALID_FAQ_REORDER");
      err.status = 400;
      throw err;
    }

    const existingSet = new Set(existingIds);
    for (const id of requested) {
      if (!existingSet.has(id)) {
        const err = new Error("INVALID_FAQ_REORDER");
        err.status = 400;
        throw err;
      }
    }

    for (let i = 0; i < requested.length; i += 1) {
      await client.query(
        `UPDATE website_faq_items SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        [i + 1, requested[i]],
      );
    }

    await client.query("COMMIT");
    return listAllFaqItems();
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listActiveFaqItems,
  listAllFaqItems,
  getFaqItemById,
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  reorderFaqItems,
};
