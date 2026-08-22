/**
 * Trial pending earnings lock + 40-day post-expiry forfeiture policy.
 */

const TRIAL_PENDING_EARNINGS_GRACE_DAYS_DEFAULT = 40;

/** Manuscript terms version that includes trial earnings lock + forfeiture acceptance. */
const TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION = "mini_article_submission_terms_2026-08-v2";

const MINI_ARTICLE_SUBMISSION_TERMS_VERSION_V2 = TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION;

const MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR_V2 =
  "أوافق على شروط ملكية ونشر هذا المقال، وأفهم أنه عند قبول المقال يمكن نشره باسمي على Bildazo وفق سياسة المنصة. "
  + "أفهم أن أرباح التجربة/الستارتر تظهر كرصيد معلّق وغير قابل للسحب حتى تفعيل باقة مدفوعة مؤهلة (مثل Silver)، "
  + "ولدي مهلة محددة بعد انتهاء التجربة لتفعيل السحب؛ وإذا لم أفعل خلال المهلة يُغلق الرصيد المعلّق وفق الشروط المقبولة.";

const MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN_V2 =
  "I agree to the ownership and publishing terms for this article, and I understand that if accepted it may be published on Bildazo. "
  + "I understand trial/Starter earnings appear as locked pending balance until a paid eligible plan (e.g. Silver) is activated, "
  + "with a limited grace period after trial expiry; if I do not activate within that period, pending trial earnings are closed per the accepted terms.";

const TRIAL_PENDING_EARNINGS_COMPANY_ENTRY_TYPE = "company_trial_forfeiture";

const TRIAL_PENDING_EARNINGS_LOCK_STATES = Object.freeze({
  NONE: "none",
  TRIAL_ACTIVE_LOCKED: "trial_active_locked",
  GRACE_PERIOD: "grace_period",
  FORFEITED_CLOSED: "forfeited_closed",
  RELEASED: "released",
});

const TRIAL_PENDING_EARNINGS_EVENT_TYPE = "trial_pending_earnings_forfeited";

function normalizeTermsVersion(value) {
  return String(value || "").trim();
}

function termsVersionAcceptsForfeiturePolicy(version) {
  const v = normalizeTermsVersion(version);
  if (!v) return false;
  if (v === TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION) return true;
  // Future v3+ when version string sorts after v2 base.
  return v > TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION;
}

function resolvePolicyFromEntryMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata.trialEarningsPolicyVersion || metadata.trial_earnings_policy_version;
  return normalizeTermsVersion(raw) || null;
}

function entryEligibleForForfeiturePolicy({ entryMetadata, submissionTermsVersion }) {
  const fromMeta = resolvePolicyFromEntryMetadata(entryMetadata);
  if (fromMeta && termsVersionAcceptsForfeiturePolicy(fromMeta)) return true;
  return termsVersionAcceptsForfeiturePolicy(submissionTermsVersion);
}

module.exports = {
  TRIAL_PENDING_EARNINGS_GRACE_DAYS_DEFAULT,
  TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION,
  MINI_ARTICLE_SUBMISSION_TERMS_VERSION_V2,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR_V2,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN_V2,
  TRIAL_PENDING_EARNINGS_COMPANY_ENTRY_TYPE,
  TRIAL_PENDING_EARNINGS_LOCK_STATES,
  TRIAL_PENDING_EARNINGS_EVENT_TYPE,
  normalizeTermsVersion,
  termsVersionAcceptsForfeiturePolicy,
  resolvePolicyFromEntryMetadata,
  entryEligibleForForfeiturePolicy,
};
