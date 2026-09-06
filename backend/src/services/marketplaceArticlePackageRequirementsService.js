/**
 * OZ-Articles-Bildazo-02 — package word/reference requirements by plan.
 */

const { pool } = require("../config/db");
const {
  ARTICLE_PACKAGE_PLAN_CODES,
  ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS,
} = require("../constants/marketplaceArticleBildazoOz02");

function createAppError(message, statusCode = 400, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = extra.code || "ARTICLE_PACKAGE_REQUIREMENTS_ERROR";
  Object.assign(err, extra);
  return err;
}

function mapRow(row) {
  if (!row) return null;
  return {
    planCode: row.plan_code,
    minWords: Number(row.min_words),
    minReferences: Number(row.min_references),
    updatedByUserId: row.updated_by_user_id != null ? String(row.updated_by_user_id) : null,
    updatedAt: row.updated_at || null,
  };
}

async function ensureDefaults(db = pool) {
  for (const planCode of ARTICLE_PACKAGE_PLAN_CODES) {
    const def = ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[planCode];
    // eslint-disable-next-line no-await-in-loop
    await db.query(
      `INSERT INTO marketplace_article_package_requirements (plan_code, min_words, min_references)
       VALUES ($1, $2, $3)
       ON CONFLICT (plan_code) DO NOTHING`,
      [planCode, def.minWords, def.minReferences],
    );
  }
}

async function listPackageRequirements(db = pool) {
  try {
    await ensureDefaults(db);
    const { rows } = await db.query(
      `SELECT * FROM marketplace_article_package_requirements
        ORDER BY CASE plan_code
          WHEN 'STARTER' THEN 1
          WHEN 'SILVER' THEN 2
          WHEN 'PRO' THEN 3
          WHEN 'ELITE' THEN 4
          ELSE 9
        END`,
    );
    return rows.map(mapRow);
  } catch (err) {
    if (err && err.code === "42P01") {
      // table missing — return in-memory defaults
      return ARTICLE_PACKAGE_PLAN_CODES.map((planCode) => ({
        planCode,
        minWords: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[planCode].minWords,
        minReferences: ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[planCode].minReferences,
        updatedByUserId: null,
        updatedAt: null,
        schemaReady: false,
      }));
    }
    throw err;
  }
}

async function updatePackageRequirements(items, actorUserId, db = pool) {
  if (!Array.isArray(items) || !items.length) {
    throw createAppError("متطلبات الباقات مطلوبة.", 400, { code: "PACKAGE_REQUIREMENTS_REQUIRED" });
  }
  await ensureDefaults(db);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const planCode = String(item.planCode || item.plan_code || "")
        .trim()
        .toUpperCase();
      if (!ARTICLE_PACKAGE_PLAN_CODES.includes(planCode)) {
        throw createAppError(`باقة غير معروفة: ${planCode}`, 400, { code: "INVALID_PLAN_CODE" });
      }
      const minWords = Number(item.minWords ?? item.min_words);
      const minReferences = Number(item.minReferences ?? item.min_references);
      if (!Number.isFinite(minWords) || minWords <= 0) {
        throw createAppError("عدد الكلمات يجب أن يكون أكبر من صفر.", 400, {
          code: "INVALID_MIN_WORDS",
        });
      }
      if (!Number.isFinite(minReferences) || minReferences < 0) {
        throw createAppError("عدد المراجع غير صالح.", 400, { code: "INVALID_MIN_REFERENCES" });
      }
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO marketplace_article_package_requirements
           (plan_code, min_words, min_references, updated_by_user_id, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (plan_code) DO UPDATE SET
           min_words = EXCLUDED.min_words,
           min_references = EXCLUDED.min_references,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = NOW()`,
        [planCode, Math.floor(minWords), Math.floor(minReferences), actorUserId || null],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listPackageRequirements(db);
}

async function getRequirementForPlan(planCode, db = pool) {
  const {
    normalizePackagePlanCode,
    ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS,
  } = require("../constants/marketplaceArticleBildazoOz02");
  const code = normalizePackagePlanCode(planCode);
  if (!code) {
    throw createAppError("خطة الباقة غير صالحة.", 400, { code: "INVALID_PLAN_CODE" });
  }
  const all = await listPackageRequirements(db);
  const found = all.find((r) => String(r.planCode).toUpperCase() === code);
  if (found) {
    return {
      planCode: code,
      minWords: Number(found.minWords),
      minReferences: Number(found.minReferences),
    };
  }
  const def = ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS[code];
  return {
    planCode: code,
    minWords: def.minWords,
    minReferences: def.minReferences,
  };
}

module.exports = {
  listPackageRequirements,
  updatePackageRequirements,
  getRequirementForPlan,
  ensureDefaults,
  mapRow,
};
