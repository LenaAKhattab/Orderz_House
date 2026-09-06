/**
 * OZ-Articles-Bildazo-02 helpers for inventory Bildazo category + writing mode.
 */

const { createAppError } = require("../utils/AppError");
const { isBildazoLeafCategoryId } = require("../config/bildazoArticlePublish");
const { normalizeWritingMode } = require("../constants/marketplaceArticleBildazoOz02");

function assertBildazoInventoryFields(payload = {}, { required = true } = {}) {
  const bildazoCategoryId = String(
    payload.bildazoCategoryId ?? payload.bildazo_category_id ?? "",
  ).trim();
  const writingMode = normalizeWritingMode(payload.writingMode ?? payload.writing_mode);

  if (required && !isBildazoLeafCategoryId(bildazoCategoryId)) {
    throw createAppError("يجب اختيار صنف بلدازو صالح (ورقة نهائية).", 400, {
      exposeToClient: true,
      publicCode: "INVALID_BILDAZO_CATEGORY",
    });
  }
  if (required && !writingMode) {
    throw createAppError("يجب اختيار نمط الكتابة.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_WRITING_MODE",
    });
  }
  if (bildazoCategoryId && !isBildazoLeafCategoryId(bildazoCategoryId)) {
    throw createAppError("يجب اختيار صنف بلدازو صالح (ورقة نهائية).", 400, {
      exposeToClient: true,
      publicCode: "INVALID_BILDAZO_CATEGORY",
    });
  }

  return {
    bildazoCategoryId: bildazoCategoryId || null,
    bildazoCategoryName: String(
      payload.bildazoCategoryName ?? payload.bildazo_category_name ?? "",
    )
      .trim()
      .slice(0, 240) || null,
    bildazoCategorySlug: String(
      payload.bildazoCategorySlug ?? payload.bildazo_category_slug ?? "",
    )
      .trim()
      .slice(0, 240) || null,
    bildazoCategoryPath: String(
      payload.bildazoCategoryPath ?? payload.bildazo_category_path ?? "",
    )
      .trim()
      .slice(0, 2000) || null,
    writingMode: writingMode || null,
  };
}

async function applyBildazoInventoryColumns(client, articleId, fields) {
  if (!fields) return false;
  try {
    await client.query(
      `UPDATE marketplace_articles SET
         bildazo_category_id = $2,
         bildazo_category_name = $3,
         bildazo_category_slug = $4,
         bildazo_category_path = $5,
         writing_mode = $6,
         updated_at = NOW()
       WHERE id = $1`,
      [
        Number(articleId),
        fields.bildazoCategoryId,
        fields.bildazoCategoryName,
        fields.bildazoCategorySlug,
        fields.bildazoCategoryPath,
        fields.writingMode,
      ],
    );
    return true;
  } catch (err) {
    if (err && err.code === "42703") return false;
    throw err;
  }
}

function mapBildazoInventoryFromRow(row) {
  if (!row) return {};
  return {
    bildazoCategoryId: row.bildazo_category_id || null,
    bildazoCategoryName: row.bildazo_category_name || null,
    bildazoCategorySlug: row.bildazo_category_slug || null,
    bildazoCategoryPath: row.bildazo_category_path || null,
    writingMode: row.writing_mode || null,
  };
}

module.exports = {
  assertBildazoInventoryFields,
  applyBildazoInventoryColumns,
  mapBildazoInventoryFromRow,
};
