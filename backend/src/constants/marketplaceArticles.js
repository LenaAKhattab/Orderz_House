/**
 * Marketplace Article Level model — Phase A2 constants.
 * No applications, Token charges, capacity, or rounds.
 */

const MARKETPLACE_ARTICLE_STATUSES = Object.freeze([
  "draft",
  "published",
  "closed",
  "cancelled",
]);

const MARKETPLACE_ARTICLE_STATUS_SET = new Set(MARKETPLACE_ARTICLE_STATUSES);

const MARKETPLACE_ARTICLE_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

/** Canonical JOD values by article_level — single source of truth. */
const ARTICLE_VALUE_JOD_BY_LEVEL = Object.freeze({
  1: 1.0,
  2: 2.0,
  3: 3.0,
  4: 4.0,
  5: 5.0,
});

const ARTICLE_LEVEL_WORD_REFERENCE_GLOBAL_MATRIX = "NOT_DEFINED";
/** Phase B5: membership article_access_level >= article.article_level enforced on apply. */
const ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT = "ENFORCED";
const ARTICLE_WORK_TOKEN_MOVEMENT = "NONE";
const ARTICLE_WORK_TOKEN_ENTRY = "CANCELLED";
const ARTICLE_HISTORICAL_BACKFILL = "NONE";
const FREE_SIGNUP_WORK_TOKEN_GRANT = "NONE";
const ARTICLE_APPLICATIONS_ENGINE_FLAG = "article_applications_enabled";

function isValidMarketplaceArticleStatus(value) {
  return MARKETPLACE_ARTICLE_STATUS_SET.has(String(value || "").trim());
}

module.exports = {
  MARKETPLACE_ARTICLE_STATUSES,
  MARKETPLACE_ARTICLE_STATUS_SET,
  MARKETPLACE_ARTICLE_LEVELS,
  ARTICLE_VALUE_JOD_BY_LEVEL,
  ARTICLE_LEVEL_WORD_REFERENCE_GLOBAL_MATRIX,
  ARTICLE_MEMBERSHIP_ACCESS_ENFORCEMENT,
  ARTICLE_WORK_TOKEN_MOVEMENT,
  ARTICLE_WORK_TOKEN_ENTRY,
  ARTICLE_HISTORICAL_BACKFILL,
  FREE_SIGNUP_WORK_TOKEN_GRANT,
  ARTICLE_APPLICATIONS_ENGINE_FLAG,
  isValidMarketplaceArticleStatus,
};
