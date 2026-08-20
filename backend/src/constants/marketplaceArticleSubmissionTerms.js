/**
 * Phase A5 — Mini Article manuscript terms/IP snapshot (product placeholder).
 * Not lawyer-approved. Final legal copy requires legal review.
 */

const MINI_ARTICLE_SUBMISSION_TERMS_VERSION = "mini_article_submission_terms_2026-08-v1";
const MINI_ARTICLE_SUBMISSION_TERMS_SNAPSHOT_KEY = MINI_ARTICLE_SUBMISSION_TERMS_VERSION;

const MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR =
  "أوافق على شروط ملكية ونشر هذا المقال، وأفهم أنه عند قبول المقال يمكن نشره باسمي على Bildazo وفق سياسة المنصة.";

const MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN =
  "I agree to the ownership and publishing terms for this article, and I understand that if it is accepted it may be published under my name on Bildazo according to platform policy.";

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
    userId: freelancerUserId != null ? String(freelancerUserId) : null,
    articleId: articleId != null ? String(articleId) : null,
    applicationId: applicationId != null ? String(applicationId) : null,
    acceptedAt: acceptedAt instanceof Date ? acceptedAt.toISOString() : acceptedAt,
  };
}

module.exports = {
  MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
  MINI_ARTICLE_SUBMISSION_TERMS_SNAPSHOT_KEY,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN,
  MINI_ARTICLE_SUBMISSION_TERMS_LEGAL_REVIEW,
  isTruthyTermsAcceptance,
  buildManuscriptTermsSnapshot,
};
