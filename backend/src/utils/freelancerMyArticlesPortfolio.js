const { BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES } = require("../constants/bildazoArticlePublish");

const PORTFOLIO_STATUS_KEYS = Object.freeze([
  "awaiting_selection",
  "awaiting_execution",
  "under_review",
  "revision_requested",
  "accepted",
  "published_on_bildazo",
  "rejected",
]);

const PORTFOLIO_STATUS_LABELS_AR = Object.freeze({
  awaiting_selection: "بانتظار الاختيار",
  awaiting_execution: "بانتظار التنفيذ",
  under_review: "تحت التدقيق",
  revision_requested: "مطلوب تعديل",
  accepted: "مقبولة",
  published_on_bildazo: "منشورة على Bildazo",
  rejected: "مرفوضة",
});

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function resolvePortfolioStatus({ applicationStatus, submissionStatus, bildazoPublishStatus } = {}) {
  const publish = normalize(bildazoPublishStatus);
  if (BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES.includes(publish)) {
    return "published_on_bildazo";
  }

  const app = normalize(applicationStatus);
  const sub = normalize(submissionStatus);

  if (["rejected", "cancelled", "withdrawn"].includes(app) || sub === "rejected") {
    return "rejected";
  }
  if (app === "revision_requested" || sub === "revision_requested") {
    return "revision_requested";
  }
  if (app === "approved" || sub === "approved") {
    return "accepted";
  }
  if (sub === "submitted" || app === "under_review" || app === "submitted") {
    return "under_review";
  }
  if (["selected", "assigned", "writing"].includes(app)) {
    return "awaiting_execution";
  }
  if (app === "pending") {
    return "awaiting_selection";
  }
  return "awaiting_execution";
}

function portfolioStatusLabelAr(statusKey) {
  return PORTFOLIO_STATUS_LABELS_AR[statusKey] || statusKey || "—";
}

module.exports = {
  PORTFOLIO_STATUS_KEYS,
  PORTFOLIO_STATUS_LABELS_AR,
  resolvePortfolioStatus,
  portfolioStatusLabelAr,
};
