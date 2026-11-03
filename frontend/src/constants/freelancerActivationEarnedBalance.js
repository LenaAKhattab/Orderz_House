import { intlTagOrDefault } from "../i18n/intlLocale.js";
import { localeFromEnFlag } from "../i18n/activeLocale.js";
import { ct, ctAr, ctEnglish, ctFromEnFlag } from "./constantsI18n.js";

const NS = "freelancerActivationEarnedBalance";

export const MINI_ARTICLE_SUBMISSION_TERMS_VERSION = "mini_article_submission_terms_2026-08-v1";

/** Arabic / English copies (catalog: platformConstants.freelancerActivationEarnedBalance.miniArticleTerms). */
export const MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR = ctAr(`${NS}.miniArticleTerms`);
export const MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN = ctEnglish(`${NS}.miniArticleTerms`);

/** Arabic / English copies (catalog: platformConstants.freelancerActivationEarnedBalance.earnedBalanceHelper). */
export const EARNED_BALANCE_HELPER_AR = ctAr(`${NS}.earnedBalanceHelper`);
export const EARNED_BALANCE_HELPER_EN = ctEnglish(`${NS}.earnedBalanceHelper`);

/** Mini Article submission terms for any UI locale (`isEn ? …_EN : …_AR` replacement). */
export function miniArticleSubmissionTermsCopy(locale) {
  return ct(`${NS}.miniArticleTerms`, undefined, locale);
}

/** Earned-balance helper text for any UI locale (`isEn ? …_EN : …_AR` replacement). */
export function earnedBalanceHelperText(locale) {
  return ct(`${NS}.earnedBalanceHelper`, undefined, locale);
}

const EARNED_BALANCE_STATUSES = new Set(["pending", "settled_externally", "voided"]);

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function earnedBalanceStatusLabel(status, { isEn = false, locale } = {}) {
  const key = String(status || "");
  if (EARNED_BALANCE_STATUSES.has(key)) return ctFromEnFlag(`${NS}.statuses.${key}`, isEn, undefined, locale);
  return key;
}

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function formatManuscriptTermsAdmin(submission, { isEn = false, locale } = {}) {
  const loc = locale || localeFromEnFlag(isEn);
  if (!submission) return ct(`${NS}.terms.notRecorded`, undefined, loc);
  if (!submission.termsAccepted) return ct(`${NS}.terms.notAccepted`, undefined, loc);
  const version = submission.termsVersion || "—";
  const at = submission.termsAcceptedAt
    ? new Date(submission.termsAcceptedAt).toLocaleString(intlTagOrDefault(loc))
    : "—";
  return ct(`${NS}.terms.accepted`, { version, at }, loc);
}
