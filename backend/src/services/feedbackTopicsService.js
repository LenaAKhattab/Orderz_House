const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const feedbackCategoriesService = require("./feedbackCategoriesService");

/** Pre-133: topics exist without category_id. Cache only positive probes. */
let topicCategoryColumnsReady = false;

async function hasTopicCategoryColumns(client = pool) {
  if (topicCategoryColumnsReady) return true;
  try {
    const { rows } = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'user_feedback_topics'
         AND column_name = 'category_id'
       LIMIT 1`,
    );
    topicCategoryColumnsReady = rows.length > 0;
  } catch {
    topicCategoryColumnsReady = false;
  }
  return topicCategoryColumnsReady;
}

function topicSelectSql(withCategory) {
  if (withCategory) {
    return `
  SELECT t.id, t.feedback_type, t.category_id, t.label, t.is_active, t.sort_order,
         t.created_at, t.updated_at,
         c.key AS category_key, c.label AS category_label
  FROM user_feedback_topics t
  LEFT JOIN user_feedback_categories c ON c.id = t.category_id
`;
  }
  return `
  SELECT t.id, t.feedback_type, NULL::bigint AS category_id, t.label, t.is_active, t.sort_order,
         t.created_at, t.updated_at,
         t.feedback_type AS category_key, NULL::text AS category_label
  FROM user_feedback_topics t
`;
}

function mapTopicRow(row) {
  if (!row) return null;
  const categoryId = row.category_id != null ? Number(row.category_id) : null;
  return {
    id: Number(row.id),
    categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null,
    categoryKey: row.category_key || row.feedback_type || null,
    // Compatibility: type mirrors category key / legacy feedback_type
    type: row.category_key || row.feedback_type || null,
    label: row.label,
    isActive: row.is_active === true,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeLabel(label) {
  let text = String(label ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/<[^>]*>/g, "");
  if (text.length > 200) text = text.slice(0, 200);
  if (text.length < 1) {
    throw createAppError("نص الموضوع مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "TOPIC_LABEL_REQUIRED",
    });
  }
  return text;
}

function isSchemaMissingError(err) {
  return Boolean(err && (err.code === "42P01" || err.code === "42703"));
}

async function resolveCategoryRef({ categoryId, type }, client = pool) {
  const hasId = categoryId != null && categoryId !== "";
  const typeKey = type != null && String(type).trim() ? String(type).trim() : null;

  if (hasId && typeKey) {
    return feedbackCategoriesService.assertCategoryIdMatchesType(
      { categoryId, type: typeKey },
      client,
    );
  }

  if (hasId) {
    const id = Number(categoryId);
    if (!Number.isInteger(id) || id <= 0) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
    const category = await feedbackCategoriesService.getCategoryById(id, client);
    if (!category) {
      throw createAppError("التصنيف غير موجود.", 404, {
        exposeToClient: true,
        publicCode: "CATEGORY_NOT_FOUND",
      });
    }
    return category;
  }

  if (typeKey) {
    const category = await feedbackCategoriesService.getCategoryByKey(typeKey, client);
    if (category) return category;
    // Pre-migration 133: fall back to treating type as feedback_type string.
    return { id: null, key: typeKey, label: null, isActive: true };
  }

  throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
    exposeToClient: true,
    publicCode: "INVALID_CATEGORY",
  });
}

async function listActiveTopicsByCategory({ categoryId = null, type = null } = {}) {
  try {
    const withCategory = await hasTopicCategoryColumns();
    const select = topicSelectSql(withCategory);

    // Dual identity: both params allowed only when they resolve to the same category.
    if (
      categoryId != null &&
      categoryId !== "" &&
      type != null &&
      String(type).trim()
    ) {
      await feedbackCategoriesService.assertCategoryIdMatchesType({ categoryId, type });
    }

    if (categoryId != null && categoryId !== "") {
      const id = Number(categoryId);
      if (!Number.isInteger(id) || id <= 0) {
        throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
          exposeToClient: true,
          publicCode: "INVALID_CATEGORY",
        });
      }
      if (!withCategory) return [];
      const { rows } = await pool.query(
        `${select}
         WHERE t.category_id = $1 AND t.is_active = TRUE
         ORDER BY t.sort_order ASC, t.id ASC`,
        [id],
      );
      return rows.map(mapTopicRow);
    }

    if (type) {
      if (withCategory) {
        const category = await feedbackCategoriesService.getCategoryByKey(String(type).trim());
        if (category) {
          const { rows } = await pool.query(
            `${select}
             WHERE t.category_id = $1 AND t.is_active = TRUE
             ORDER BY t.sort_order ASC, t.id ASC`,
            [category.id],
          );
          return rows.map(mapTopicRow);
        }
      }
      // Legacy path before categories exist / unmapped topics
      const { rows } = await pool.query(
        `${select}
         WHERE t.feedback_type = $1 AND t.is_active = TRUE
         ORDER BY t.sort_order ASC, t.id ASC`,
        [String(type).trim()],
      );
      return rows.map(mapTopicRow);
    }

    throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CATEGORY",
    });
  } catch (err) {
    if (err && err.publicCode) throw err;
    if (isSchemaMissingError(err)) return [];
    throw err;
  }
}

/** @deprecated prefer listActiveTopicsByCategory — kept for older callers/tests */
async function listActiveTopicsByType(feedbackType) {
  return listActiveTopicsByCategory({ type: feedbackType });
}

async function listAllTopics({ categoryId = null, type = null } = {}) {
  const params = [];
  const where = ["1=1"];
  const withCategory = await hasTopicCategoryColumns();

  if (categoryId != null && categoryId !== "") {
    const id = Number(categoryId);
    if (!Number.isInteger(id) || id <= 0) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
    if (!withCategory) return [];
    params.push(id);
    where.push(`t.category_id = $${params.length}`);
  } else if (type) {
    if (withCategory) {
      const category = await feedbackCategoriesService.getCategoryByKey(String(type).trim());
      if (category) {
        params.push(category.id);
        where.push(`t.category_id = $${params.length}`);
      } else {
        params.push(String(type).trim());
        where.push(`t.feedback_type = $${params.length}`);
      }
    } else {
      params.push(String(type).trim());
      where.push(`t.feedback_type = $${params.length}`);
    }
  }

  try {
    const orderBy = withCategory
      ? `COALESCE(t.category_id, 0) ASC, t.sort_order ASC, t.id ASC`
      : `t.sort_order ASC, t.id ASC`;
    const { rows } = await pool.query(
      `${topicSelectSql(withCategory)}
       WHERE ${where.join(" AND ")}
       ORDER BY ${orderBy}`,
      params,
    );
    return rows.map(mapTopicRow);
  } catch (err) {
    if (isSchemaMissingError(err)) {
      throw createAppError(
        "جدول المواضيع غير جاهز بعد. طبّق ترحيل قاعدة البيانات 132_user_feedback_topics.",
        503,
        {
          exposeToClient: true,
          publicCode: "TOPICS_SCHEMA_MISSING",
        },
      );
    }
    throw err;
  }
}

async function getTopicById(topicId, client = pool) {
  const id = Number(topicId);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const withCategory = await hasTopicCategoryColumns(client);
    const { rows } = await client.query(
      `${topicSelectSql(withCategory)} WHERE t.id = $1 LIMIT 1`,
      [id],
    );
    return rows.length ? mapTopicRow(rows[0]) : null;
  } catch (err) {
    if (isSchemaMissingError(err)) return null;
    throw err;
  }
}

/**
 * Resolves an optional topic for feedback create.
 * Validates topic belongs to the resolved category (by id or legacy type key).
 */
async function resolveOptionalTopicForCreate({ categoryId, type, topicId }, client = pool) {
  if (topicId == null || topicId === "") {
    return { topicId: null, topicLabelSnapshot: null };
  }

  const id = Number(topicId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createAppError("موضوع الملاحظة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_TOPIC",
    });
  }

  let rows;
  try {
    const withCategory = await hasTopicCategoryColumns(client);
    const result = await client.query(
      `${topicSelectSql(withCategory)} WHERE t.id = $1 LIMIT 1`,
      [id],
    );
    rows = result.rows;
  } catch (err) {
    if (isSchemaMissingError(err)) {
      throw createAppError(
        "المواضيع الجاهزة غير متاحة حالياً. يمكنك الإرسال بدون موضوع جاهز.",
        503,
        {
          exposeToClient: true,
          publicCode: "TOPICS_SCHEMA_MISSING",
        },
      );
    }
    throw err;
  }

  const row = rows[0];
  if (!row || row.is_active !== true) {
    throw createAppError("الموضوع المحدد غير متاح.", 400, {
      exposeToClient: true,
      publicCode: "TOPIC_UNAVAILABLE",
    });
  }

  const topicCategoryId = row.category_id != null ? Number(row.category_id) : null;
  const topicKey = row.category_key || row.feedback_type;

  if (categoryId != null && categoryId !== "") {
    const cid = Number(categoryId);
    if (topicCategoryId !== cid) {
      throw createAppError("الموضوع لا يطابق التصنيف المحدد.", 400, {
        exposeToClient: true,
        publicCode: "TOPIC_CATEGORY_MISMATCH",
      });
    }
  } else if (type) {
    const typeKey = String(type).trim();
    if (topicKey !== typeKey && String(row.feedback_type) !== typeKey) {
      throw createAppError("الموضوع لا يطابق نوع الملاحظة المحدد.", 400, {
        exposeToClient: true,
        publicCode: "TOPIC_TYPE_MISMATCH",
      });
    }
  }

  return {
    topicId: Number(row.id),
    topicLabelSnapshot: String(row.label || "").trim() || null,
  };
}

async function createTopic({ categoryId, type, label, isActive = true }) {
  const topicLabel = normalizeLabel(label);
  const active = isActive !== false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const withCategory = await hasTopicCategoryColumns(client);
    const category = await resolveCategoryRef({ categoryId, type }, client);
    const categoryKey = category.key;
    const resolvedCategoryId = withCategory ? category.id : null;

    let nextOrder = 1;
    if (resolvedCategoryId) {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order
         FROM user_feedback_topics
         WHERE category_id = $1`,
        [resolvedCategoryId],
      );
      nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;
    } else {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order
         FROM user_feedback_topics
         WHERE feedback_type = $1`,
        [categoryKey],
      );
      nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;
    }

    let createdId;
    if (withCategory) {
      const { rows } = await client.query(
        `INSERT INTO user_feedback_topics (
           feedback_type, category_id, label, is_active, sort_order, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id`,
        [categoryKey, resolvedCategoryId, topicLabel, active, nextOrder],
      );
      createdId = Number(rows[0].id);
    } else {
      const { rows } = await client.query(
        `INSERT INTO user_feedback_topics (
           feedback_type, label, is_active, sort_order, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id`,
        [categoryKey, topicLabel, active, nextOrder],
      );
      createdId = Number(rows[0].id);
    }
    await client.query("COMMIT");
    return getTopicById(createdId);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (isSchemaMissingError(err)) {
      throw createAppError(
        "جدول المواضيع غير جاهز بعد. طبّق ترحيل قاعدة البيانات 132_user_feedback_topics.",
        503,
        {
          exposeToClient: true,
          publicCode: "TOPICS_SCHEMA_MISSING",
        },
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updateTopic(topicId, { label, isActive } = {}) {
  const existing = await getTopicById(topicId);
  if (!existing) {
    throw createAppError("الموضوع غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "TOPIC_NOT_FOUND",
    });
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (label !== undefined) {
    fields.push(`label = $${idx++}`);
    values.push(normalizeLabel(label));
  }
  if (isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(Boolean(isActive));
  }

  if (!fields.length) return existing;

  fields.push("updated_at = NOW()");
  values.push(existing.id);

  await pool.query(
    `UPDATE user_feedback_topics
     SET ${fields.join(", ")}
     WHERE id = $${idx}`,
    values,
  );
  return getTopicById(existing.id);
}

async function deleteTopic(topicId) {
  const id = Number(topicId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createAppError("معرّف الموضوع غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_TOPIC",
    });
  }

  const existing = await getTopicById(id);
  if (!existing) {
    throw createAppError("الموضوع غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "TOPIC_NOT_FOUND",
    });
  }

  try {
    const { rowCount } = await pool.query(`DELETE FROM user_feedback_topics WHERE id = $1`, [id]);
    if (!rowCount) {
      throw createAppError("الموضوع غير موجود.", 404, {
        exposeToClient: true,
        publicCode: "TOPIC_NOT_FOUND",
      });
    }
    return { id: existing.id, deleted: true };
  } catch (err) {
    if (err && err.publicCode) throw err;
    if (isSchemaMissingError(err)) {
      throw createAppError(
        "جدول المواضيع غير جاهز بعد. طبّق ترحيل قاعدة البيانات 132_user_feedback_topics.",
        503,
        {
          exposeToClient: true,
          publicCode: "TOPICS_SCHEMA_MISSING",
        },
      );
    }
    throw err;
  }
}

async function reorderTopics({ categoryId, type, orderedIds }) {
  const requested = (Array.isArray(orderedIds) ? orderedIds : []).map((id) => Number(id));
  if (!requested.length || requested.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createAppError("ترتيب المواضيع غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_TOPIC_REORDER",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const withCategory = await hasTopicCategoryColumns(client);
    const category = await resolveCategoryRef({ categoryId, type }, client);

    let existing;
    if (withCategory && category.id) {
      existing = await client.query(
        `SELECT id FROM user_feedback_topics
         WHERE category_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [category.id],
      );
    } else {
      existing = await client.query(
        `SELECT id FROM user_feedback_topics
         WHERE feedback_type = $1
         ORDER BY sort_order ASC, id ASC`,
        [category.key],
      );
    }

    const existingIds = existing.rows.map((r) => Number(r.id));
    if (requested.length !== existingIds.length) {
      throw createAppError("ترتيب المواضيع غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_TOPIC_REORDER",
      });
    }

    const existingSet = new Set(existingIds);
    const requestedSet = new Set(requested);
    if (requestedSet.size !== requested.length) {
      throw createAppError("ترتيب المواضيع غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_TOPIC_REORDER",
      });
    }
    for (const id of requested) {
      if (!existingSet.has(id)) {
        throw createAppError("ترتيب المواضيع غير صالح.", 400, {
          exposeToClient: true,
          publicCode: "INVALID_TOPIC_REORDER",
        });
      }
    }

    for (let i = 0; i < requested.length; i += 1) {
      await client.query(
        `UPDATE user_feedback_topics
         SET sort_order = $1, updated_at = NOW()
         WHERE id = $2`,
        [i + 1, requested[i]],
      );
    }

    await client.query("COMMIT");
    return listAllTopics({
      categoryId: category.id || null,
      type: category.id ? null : category.key,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  mapTopicRow,
  listActiveTopicsByCategory,
  listActiveTopicsByType,
  listAllTopics,
  getTopicById,
  resolveOptionalTopicForCreate,
  createTopic,
  updateTopic,
  deleteTopic,
  reorderTopics,
};
