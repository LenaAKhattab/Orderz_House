/**
 * Canonical Article Level → Article value (JOD) derivation — Phase A2.
 * Backend is source of truth. Do not duplicate mapping in controllers/frontend.
 */

const { createAppError } = require("./AppError");
const {
  ARTICLE_VALUE_JOD_BY_LEVEL,
  MARKETPLACE_ARTICLE_LEVELS,
} = require("../constants/marketplaceArticles");

function assertArticleLevel(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || !MARKETPLACE_ARTICLE_LEVELS.includes(n)) {
    throw createAppError("article_level must be an integer between 1 and 5.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_ARTICLE_LEVEL",
    });
  }
  return n;
}

/**
 * @param {number|string} articleLevel
 * @returns {number} exact JOD value (1..5)
 */
function deriveArticleValueJodFromLevel(articleLevel) {
  const level = assertArticleLevel(articleLevel);
  return ARTICLE_VALUE_JOD_BY_LEVEL[level];
}

/**
 * Format for DB NUMERIC(12,3) binding without float drift.
 * @returns {string} e.g. "3.000"
 */
function formatArticleValueJodForDb(articleLevel) {
  const value = deriveArticleValueJodFromLevel(articleLevel);
  return Number(value).toFixed(3);
}

/**
 * Reject client-supplied value that disagrees with level-derived value.
 */
function assertArticleValueMatchesLevel(articleLevel, suppliedValueJod) {
  if (suppliedValueJod === undefined || suppliedValueJod === null || suppliedValueJod === "") {
    return deriveArticleValueJodFromLevel(articleLevel);
  }
  const expected = deriveArticleValueJodFromLevel(articleLevel);
  const supplied = Number(suppliedValueJod);
  if (!Number.isFinite(supplied) || Math.abs(supplied - expected) > 0.0005) {
    throw createAppError(
      "article_value_jod must match article_level (1→1 JOD … 5→5 JOD). Do not forge value.",
      400,
      {
        exposeToClient: true,
        publicCode: "ARTICLE_VALUE_LEVEL_MISMATCH",
      },
    );
  }
  return expected;
}

module.exports = {
  assertArticleLevel,
  deriveArticleValueJodFromLevel,
  formatArticleValueJodForDb,
  assertArticleValueMatchesLevel,
};
