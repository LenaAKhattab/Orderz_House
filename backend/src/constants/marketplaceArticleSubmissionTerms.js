/**
 * Phase A5 — Mini Article manuscript terms/IP snapshot (product placeholder).
 * v2 adds trial pending earnings lock + post-expiry forfeiture acceptance.
 */

const {
  TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR_V2,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN_V2,
  termsVersionAcceptsForfeiturePolicy,
} = require("./trialPendingEarningsPolicy");

const MINI_ARTICLE_SUBMISSION_TERMS_VERSION_V1 = "mini_article_submission_terms_2026-08-v1";
const MINI_ARTICLE_SUBMISSION_TERMS_VERSION = TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION;
const MINI_ARTICLE_SUBMISSION_TERMS_SNAPSHOT_KEY = MINI_ARTICLE_SUBMISSION_TERMS_VERSION;

const MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR = MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR_V2;
const MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN = MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN_V2;

const MINI_ARTICLE_SUBMISSION_TERMS_LEGAL_REVIEW = "provisional_product_copy";

function isTruthyTermsAcceptance(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function buildManuscriptTermsSnapshot({
  freelancerUserId,
  articleId,
  applicationId,
  acceptedAt = new Date(),
} = {}) {
  return {
    version: MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
    key: MINI_ARTICLE_SUBMISSION_TERMS_SNAPSHOT_KEY,
    copyAr: MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
    legalReview: MINI_ARTICLE_SUBMISSION_TERMS_LEGAL_REVIEW,
    trialEarningsPolicyVersion: MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
    userId: freelancerUserId != null ? String(freelancerUserId) : null,
    articleId: articleId != null ? String(articleId) : null,
    applicationId: applicationId != null ? String(applicationId) : null,
    acceptedAt: acceptedAt instanceof Date ? acceptedAt.toISOString() : acceptedAt,
  };
}

module.exports = {
  MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
  MINI_ARTICLE_SUBMISSION_TERMS_VERSION_V1,
  MINI_ARTICLE_SUBMISSION_TERMS_SNAPSHOT_KEY,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN,
  MINI_ARTICLE_SUBMISSION_TERMS_LEGAL_REVIEW,
  isTruthyTermsAcceptance,
  buildManuscriptTermsSnapshot,
  termsVersionAcceptsForfeiturePolicy,
};
