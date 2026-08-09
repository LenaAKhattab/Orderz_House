const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");

const LEGACY_CATEGORY_KEYS = ["problem", "suggestion", "other"];

const CATEGORY_SELECT = `
  SELECT id, key, label, is_active, sort_order, created_at, updated_at
  FROM user_feedback_categories
`;

function mapCategoryRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    key: row.key,
    label: row.label,
    isActive: row.is_active === true,
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCategoryLabel(label) {
  let text = String(label ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/<[^>]*>/g, "");
  if (text.length > 200) text = text.slice(0, 200);
  if (text.length < 1) {
    throw createAppError("اسم التصنيف مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "CATEGORY_LABEL_REQUIRED",
    });
  }
  return text;
}

function isSchemaMissingError(err) {
  return Boolean(err && (err.code === "42P01" || err.code === "42703"));
}

function schemaMissingError() {
  return createAppError(
    "جدول التصنيفات غير جاهز بعد. طبّق ترحيل قاعدة البيانات 133_user_feedback_categories.",
    503,
    {
      exposeToClient: true,
      publicCode: "CATEGORIES_SCHEMA_MISSING",
    },
  );
}

async function listActiveCategories() {
  try {
    const { rows } = await pool.query(
      `${CATEGORY_SELECT}
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, id ASC`,
    );
    return rows.map(mapCategoryRow);
  } catch (err) {
    if (isSchemaMissingError(err)) return [];
    throw err;
  }
}

async function listAllCategories() {
  try {
    const { rows } = await pool.query(
      `${CATEGORY_SELECT}
       ORDER BY sort_order ASC, id ASC`,
    );
    return rows.map(mapCategoryRow);
  } catch (err) {
    if (isSchemaMissingError(err)) throw schemaMissingError();
    throw err;
  }
}

async function getCategoryById(categoryId, client = pool) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const { rows } = await client.query(`${CATEGORY_SELECT} WHERE id = $1 LIMIT 1`, [id]);
    return rows.length ? mapCategoryRow(rows[0]) : null;
  } catch (err) {
    if (isSchemaMissingError(err)) return null;
    throw err;
  }
}

async function getCategoryByKey(key, client = pool) {
  const normalized = String(key || "").trim();
  if (!normalized) return null;
  try {
    const { rows } = await client.query(`${CATEGORY_SELECT} WHERE key = $1 LIMIT 1`, [normalized]);
    return rows.length ? mapCategoryRow(rows[0]) : null;
  } catch (err) {
    if (isSchemaMissingError(err)) return null;
    throw err;
  }
}

async function assertUniqueLabel(label, { excludeId = null } = {}, client = pool) {
  const params = [label.toLowerCase()];
  let sql = `
    SELECT id FROM user_feedback_categories
    WHERE lower(label) = $1
  `;
  if (excludeId != null) {
    params.push(Number(excludeId));
    sql += ` AND id <> $${params.length}`;
  }
  sql += " LIMIT 1";
  const { rows } = await client.query(sql, params);
  if (rows[0]) {
    throw createAppError("يوجد تصنيف بنفس الاسم بالفعل.", 400, {
      exposeToClient: true,
      publicCode: "CATEGORY_LABEL_DUPLICATE",
    });
  }
}

async function createCategory({ label, isActive = true }) {
  const categoryLabel = normalizeCategoryLabel(label);
  const active = isActive !== false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertUniqueLabel(categoryLabel, {}, client);

    const maxRes = await client.query(
      `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM user_feedback_categories`,
    );
    const nextOrder = Number(maxRes.rows[0]?.max_order || 0) + 1;

    // Temporary unique key, then rewrite to stable cat_<id>.
    const tempKey = `tmp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const insert = await client.query(
      `INSERT INTO user_feedback_categories (key, label, is_active, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [tempKey, categoryLabel, active, nextOrder],
    );
    const id = Number(insert.rows[0].id);
    const stableKey = `cat_${id}`;
    const { rows } = await client.query(
      `UPDATE user_feedback_categories
       SET key = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, key, label, is_active, sort_order, created_at, updated_at`,
      [stableKey, id],
    );
    await client.query("COMMIT");
    return mapCategoryRow(rows[0]);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (isSchemaMissingError(err)) throw schemaMissingError();
    throw err;
  } finally {
    client.release();
  }
}

async function updateCategory(categoryId, { label, isActive } = {}) {
  const existing = await getCategoryById(categoryId);
  if (!existing) {
    throw createAppError("التصنيف غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "CATEGORY_NOT_FOUND",
    });
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (label !== undefined) {
    const categoryLabel = normalizeCategoryLabel(label);
    await assertUniqueLabel(categoryLabel, { excludeId: existing.id });
    fields.push(`label = $${idx++}`);
    values.push(categoryLabel);
  }
  if (isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(Boolean(isActive));
  }

  if (!fields.length) return existing;

  fields.push("updated_at = NOW()");
  values.push(existing.id);

  const { rows } = await pool.query(
    `UPDATE user_feedback_categories
     SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, key, label, is_active, sort_order, created_at, updated_at`,
    values,
  );
  return mapCategoryRow(rows[0]);
}

async function countCategoryTopics(categoryId, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c FROM user_feedback_topics WHERE category_id = $1`,
    [categoryId],
  );
  return rows[0]?.c || 0;
}

async function countCategoryFeedback(categoryId, categoryKey, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM user_feedback
     WHERE category_id = $1
        OR (category_id IS NULL AND type = $2)`,
    [categoryId, categoryKey],
  );
  return rows[0]?.c || 0;
}

async function deleteCategory(categoryId) {
  const existing = await getCategoryById(categoryId);
  if (!existing) {
    throw createAppError("التصنيف غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "CATEGORY_NOT_FOUND",
    });
  }

  const topicCount = await countCategoryTopics(existing.id);
  if (topicCount > 0) {
    throw createAppError(
      "لا يمكن حذف هذا التصنيف لأنه مرتبط بمواضيع. احذف المواضيع أولاً أو أخفِ التصنيف بدلاً من ذلك.",
      409,
      {
        exposeToClient: true,
        publicCode: "CATEGORY_HAS_TOPICS",
      },
    );
  }

  const feedbackCount = await countCategoryFeedback(existing.id, existing.key);
  if (feedbackCount > 0) {
    throw createAppError(
      "لا يمكن حذف هذا التصنيف لأنه مرتبط بملاحظات سابقة. يمكنك إخفاؤه بدلاً من ذلك.",
      409,
      {
        exposeToClient: true,
        publicCode: "CATEGORY_HAS_FEEDBACK",
      },
    );
  }

  const { rowCount } = await pool.query(`DELETE FROM user_feedback_categories WHERE id = $1`, [
    existing.id,
  ]);
  if (!rowCount) {
    throw createAppError("التصنيف غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "CATEGORY_NOT_FOUND",
    });
  }
  return { id: existing.id, deleted: true };
}

async function reorderCategories({ orderedIds }) {
  const requested = (Array.isArray(orderedIds) ? orderedIds : []).map((id) => Number(id));
  if (!requested.length || requested.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw createAppError("ترتيب التصنيفات غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CATEGORY_REORDER",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT id FROM user_feedback_categories ORDER BY sort_order ASC, id ASC`,
    );
    const existingIds = existing.rows.map((r) => Number(r.id));
    if (requested.length !== existingIds.length) {
      throw createAppError("ترتيب التصنيفات غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY_REORDER",
      });
    }
    const existingSet = new Set(existingIds);
    const requestedSet = new Set(requested);
    if (requestedSet.size !== requested.length) {
      throw createAppError("ترتيب التصنيفات غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY_REORDER",
      });
    }
    for (const id of requested) {
      if (!existingSet.has(id)) {
        throw createAppError("ترتيب التصنيفات غير صالح.", 400, {
          exposeToClient: true,
          publicCode: "INVALID_CATEGORY_REORDER",
        });
      }
    }

    for (let i = 0; i < requested.length; i += 1) {
      await client.query(
        `UPDATE user_feedback_categories
         SET sort_order = $1, updated_at = NOW()
         WHERE id = $2`,
        [i + 1, requested[i]],
      );
    }
    await client.query("COMMIT");
    return listAllCategories();
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (isSchemaMissingError(err)) throw schemaMissingError();
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolve category for createFeedback.
 * Prefer categoryId; fall back to legacy/custom type key.
 * If both are supplied they must refer to the same category.
 */
async function resolveCategoryForCreate({ categoryId, type }, client = pool) {
  const hasId = categoryId != null && categoryId !== "";
  const typeKey = type != null && String(type).trim() ? String(type).trim() : null;

  let category = null;

  if (hasId) {
    const id = Number(categoryId);
    if (!Number.isInteger(id) || id <= 0) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
    category = await getCategoryById(id, client);
    if (!category) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
    if (typeKey && category.key !== typeKey) {
      throw createAppError("التصنيف والنوع غير متوافقين.", 400, {
        exposeToClient: true,
        publicCode: "CATEGORY_TYPE_MISMATCH",
      });
    }
  } else if (typeKey) {
    // Legacy client compatibility: type=problem|suggestion|other (or custom key).
    category = await getCategoryByKey(typeKey, client);
  }

  if (!category) {
    throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CATEGORY",
    });
  }
  if (!category.isActive) {
    throw createAppError("التصنيف المحدد غير متاح.", 400, {
      exposeToClient: true,
      publicCode: "CATEGORY_INACTIVE",
    });
  }

  return {
    categoryId: category.id,
    categoryKey: category.key,
    categoryLabelSnapshot: category.label,
    // Compatibility mirror for user_feedback.type
    type: category.key,
  };
}

/**
 * Resolve category for Super Admin list filters (active + inactive allowed).
 * Supports categoryId and/or type=stable key. Rejects contradictions and unknown keys.
 */
async function resolveCategoryForAdminFilter({ categoryId = null, type = null } = {}, client = pool) {
  const hasId = categoryId != null && categoryId !== "";
  const typeKey = type != null && String(type).trim() ? String(type).trim() : null;

  if (!hasId && !typeKey) return null;

  let category = null;

  if (hasId) {
    const id = Number(categoryId);
    if (!Number.isInteger(id) || id <= 0) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
    category = await getCategoryById(id, client);
    if (!category) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
    if (typeKey && category.key !== typeKey) {
      throw createAppError("التصنيف والنوع غير متوافقين.", 400, {
        exposeToClient: true,
        publicCode: "CATEGORY_TYPE_MISMATCH",
      });
    }
  } else if (typeKey) {
    category = await getCategoryByKey(typeKey, client);
    if (!category) {
      throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CATEGORY",
      });
    }
  }

  return {
    categoryId: category.id,
    key: category.key,
    label: category.label,
    isActive: category.isActive,
  };
}

/**
 * When both categoryId and type are present, require they resolve to the same category.
 * Used by topics listing and other dual-param endpoints.
 */
async function assertCategoryIdMatchesType({ categoryId, type }, client = pool) {
  const hasId = categoryId != null && categoryId !== "";
  const typeKey = type != null && String(type).trim() ? String(type).trim() : null;
  if (!hasId || !typeKey) return null;

  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CATEGORY",
    });
  }
  const category = await getCategoryById(id, client);
  if (!category) {
    throw createAppError("تصنيف الملاحظة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CATEGORY",
    });
  }
  if (category.key !== typeKey) {
    throw createAppError("التصنيف والنوع غير متوافقين.", 400, {
      exposeToClient: true,
      publicCode: "CATEGORY_TYPE_MISMATCH",
    });
  }
  return category;
}

module.exports = {
  LEGACY_CATEGORY_KEYS,
  mapCategoryRow,
  listActiveCategories,
  listAllCategories,
  getCategoryById,
  getCategoryByKey,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  resolveCategoryForCreate,
  resolveCategoryForAdminFilter,
  assertCategoryIdMatchesType,
  countCategoryTopics,
  countCategoryFeedback,
};
