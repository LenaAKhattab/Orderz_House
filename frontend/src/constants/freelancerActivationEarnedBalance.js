export const MINI_ARTICLE_SUBMISSION_TERMS_VERSION = "mini_article_submission_terms_2026-08-v2";
export const MINI_ARTICLE_SUBMISSION_TERMS_VERSION_V1 = "mini_article_submission_terms_2026-08-v1";

export const MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR =
  "أوافق على شروط ملكية ونشر هذا المقال، وأفهم أنه عند قبول المقال يمكن نشره باسمي على Bildazo وفق سياسة المنصة. "
  + "أفهم أن أرباح التجربة/الستارتر تظهر كرصيد معلّق وغير قابل للسحب حتى تفعيل باقة مدفوعة مؤهلة (مثل Silver)، "
  + "ولدي مهلة محددة بعد انتهاء التجربة لتفعيل السحب؛ وإذا لم أفعل خلال المهلة يُغلق الرصيد المعلّق وفق الشروط المقبولة.";

export const MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN =
  "I agree to the ownership and publishing terms for this article, and I understand that if accepted it may be published on Bildazo. "
  + "I understand trial/Starter earnings appear as locked pending balance until a paid eligible plan (e.g. Silver) is activated, "
  + "with a limited grace period after trial expiry; if I do not activate within that period, pending trial earnings are closed per the accepted terms.";

export const EARNED_BALANCE_HELPER_AR =
  "يعرض هذا الرصيد صافي أجر الكاتب من المقالات المقبولة فقط. الأرباح المعلّقة غير قابلة للسحب حتى تفعيل Silver.";

export const EARNED_BALANCE_HELPER_EN =
  "This balance shows writer net from accepted articles only. Pending earnings are not withdrawable until Silver activation.";

export const EARNED_BALANCE_LOCKED_HEADLINE_AR = "أرباحك محفوظة لكنها غير قابلة للسحب حاليًا.";
export const EARNED_BALANCE_LOCKED_CTA_AR = "اشترك لتفعيل السحب";
export const EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_AR =
  "الرصيد متاح بعد الاشتراك، لكن السحب يتطلب اعتماد الحساب.";
export const EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_EN =
  "Earnings are available after subscription, but withdrawal requires account approval.";

export function earnedBalanceStatusLabel(status, { isEn = false } = {}) {
  const key = String(status || "");
  if (key === "pending_locked") return isEn ? "Locked · pending" : "معلّق · غير قابل للسحب";
  if (key === "pending") return isEn ? "Pending" : "معلّق";
  if (key === "forfeited") return isEn ? "Closed" : "مغلق";
  if (key === "awaiting_account_approval") {
    return isEn ? "Released · approval required" : "مُفعّل · بانتظار اعتماد الحساب";
  }
  if (key === "settled_externally") return isEn ? "Withdrawable" : "قابل للسحب";
  if (key === "voided") return isEn ? "Voided" : "ملغى";
  return key;
}

export function resolveEarnedBalanceLockCopy(lockPolicy, { isEn = false } = {}) {
  if (!lockPolicy?.messages) return null;
  const lang = isEn ? lockPolicy.messages.en : lockPolicy.messages.ar;
  return lang?.headline || lang?.detail || null;
}

export function formatManuscriptTermsAdmin(submission, { isEn = false } = {}) {
  if (!submission) return isEn ? "Terms: not recorded" : "الشروط: غير مسجّلة";
  if (!submission.termsAccepted) return isEn ? "Terms: not accepted" : "الشروط: غير مقبولة";
  const version = submission.termsVersion || "—";
  const at = submission.termsAcceptedAt
    ? new Date(submission.termsAcceptedAt).toLocaleString()
    : "—";
  return isEn
    ? `Terms accepted · ${version} · ${at}`
    : `تم قبول الشروط · ${version} · ${at}`;
}
