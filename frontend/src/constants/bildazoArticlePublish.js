import { ctFromEnFlag } from "./constantsI18n.js";

export const BILDAZO_ARTICLE_PUBLISH_SUCCESS = ["published", "already_imported"];

const ADMIN_PUBLISH_STATUSES = new Set([
  "published",
  "already_imported",
  "needs_manual_review",
  "failed",
  "pending",
  "skipped",
]);

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function freelancerBildazoPublishCopy(publish, isEn, locale) {
  const status = String(publish?.status || "").trim();
  if (!status) return null;
  const tr = (key) => ctFromEnFlag(`bildazoArticlePublish.freelancer.${key}`, isEn, undefined, locale);
  if (BILDAZO_ARTICLE_PUBLISH_SUCCESS.includes(status)) {
    return {
      tone: "success",
      text: tr("published"),
      url: publish.articleUrl || null,
    };
  }
  if (status === "needs_manual_review") {
    return {
      tone: "review",
      text: tr("needsManualReview"),
      url: null,
    };
  }
  return {
    tone: "pending",
    text: tr("pending"),
    url: null,
  };
}

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function adminBildazoPublishCopy(publish, isEn, locale) {
  const status = String(publish?.status || "").trim();
  const tr = (key) => ctFromEnFlag(`bildazoArticlePublish.admin.${key}`, isEn, undefined, locale);
  if (!status) return tr("notStarted");
  return ADMIN_PUBLISH_STATUSES.has(status) ? tr(status) : status;
}
