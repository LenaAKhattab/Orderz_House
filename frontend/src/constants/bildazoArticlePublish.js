export const BILDAZO_ARTICLE_PUBLISH_SUCCESS = ["published", "already_imported"];

export const BILDAZO_PUBLISH_SUCCESS_AR = "تم نشر مقالك بنجاح على Bildazo.";

export const BILDAZO_PUBLISH_SUCCESS_EN = "Your article was published on Bildazo successfully.";

export const BILDAZO_VIEW_ARTICLE_AR = "مشاهدة المقال";

export const BILDAZO_VIEW_WRITER_PROFILE_AR = "مشاهدة ملفي ككاتب";

export function freelancerBildazoPublishCopy(publish, isEn) {
  const status = String(publish?.status || "").trim();
  if (!status) return null;
  if (BILDAZO_ARTICLE_PUBLISH_SUCCESS.includes(status)) {
    return {
      tone: "success",
      text: isEn ? BILDAZO_PUBLISH_SUCCESS_EN : BILDAZO_PUBLISH_SUCCESS_AR,
      url: publish.articleUrl || null,
    };
  }
  if (status === "needs_manual_review") {
    return {
      tone: "review",
      text: isEn
        ? "Your article was accepted in OrderzHouse. Bildazo publishing needs admin review."
        : "يحتاج النشر على Bildazo إلى مراجعة من الإدارة.",
      url: null,
    };
  }
  return {
    tone: "pending",
    text: isEn
      ? "Your article was accepted in OrderzHouse. Bildazo publishing is being linked."
      : "تم قبول المقال داخل OrderzHouse، وجارٍ ربط النشر على Bildazo.",
    url: null,
  };
}

export function adminBildazoPublishCopy(publish, isEn) {
  const status = String(publish?.status || "").trim();
  if (!status) return isEn ? "Bildazo publish: not started" : "نشر Bildazo: لم يبدأ";
  const labels = {
    published: isEn ? "Published on Bildazo" : "منشور على Bildazo",
    already_imported: isEn ? "Already imported to Bildazo" : "مستورد مسبقاً إلى Bildazo",
    needs_manual_review: isEn ? "Needs Bildazo review" : "يحتاج مراجعة Bildazo",
    failed: isEn ? "Bildazo publish failed" : "فشل نشر Bildazo",
    pending: isEn ? "Bildazo publish pending" : "نشر Bildazo قيد الانتظار",
    skipped: isEn ? "Bildazo publish skipped (disabled)" : "تم تخطي نشر Bildazo (غير مفعّل)",
  };
  return labels[status] || status;
}
