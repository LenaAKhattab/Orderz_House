export const MINI_ARTICLE_SUBMISSION_TERMS_VERSION = "mini_article_submission_terms_2026-08-v1";

export const MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR =
  "أوافق على شروط ملكية ونشر هذا المقال، وأفهم أنه عند قبول المقال يمكن نشره باسمي على Bildazo وفق سياسة المنصة.";

export const MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN =
  "I agree to the ownership and publishing terms for this article, and I understand that if it is accepted it may be published under my name on Bildazo according to platform policy.";

export const EARNED_BALANCE_HELPER_AR =
  "يعرض هذا الرصيد قيمة الأعمال المقبولة داخل المنصة. السحب أو المطالبة المالية يتم حسب سياسة الشركة ولا يتأثر بالاشتراك.";

export const EARNED_BALANCE_HELPER_EN =
  "This balance shows the value of accepted work on the platform. Withdrawal or financial claims follow company policy and are not affected by the subscription.";

export function earnedBalanceStatusLabel(status, { isEn = false } = {}) {
  const key = String(status || "");
  if (key === "pending") return isEn ? "Pending" : "قيد المعالجة";
  if (key === "settled_externally") return isEn ? "Recorded" : "مسجّل";
  if (key === "voided") return isEn ? "Voided" : "ملغى";
  return key;
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
