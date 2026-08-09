import { FEEDBACK_TYPES, feedbackTypeLabel } from "../constants/feedback.js";

function actorLabel(actor) {
  if (!actor) return "";
  const name = String(actor.fullName || "").trim();
  const acc = String(actor.accountId || "").trim();
  if (name && acc) return `${name} (${acc})`;
  return name || acc || "";
}

function truncateLabel(value, maxLen = 72) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`;
}

/**
 * Resolve feedback category for notification cards.
 * Prefer submission-time snapshot (metadata.categoryLabel); legacy type fallback only.
 * Returns "" when nothing usable (caller must omit the row — never "null").
 */
export function resolveFeedbackNotificationCategoryLabel(metadata, locale = "ar") {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const snapshot = String(meta.categoryLabel || "").trim();
  if (snapshot) return snapshot;

  const legacyKey = String(meta.categoryKey || meta.feedbackType || meta.type || "").trim();
  if (!legacyKey) return "";
  if (!FEEDBACK_TYPES.some((row) => row.value === legacyKey)) return "";
  return feedbackTypeLabel(legacyKey, locale === "en" ? "en" : "ar");
}

function feedbackDetailLabels(options = {}) {
  const locale = options.locale === "en" ? "en" : "ar";
  const categoryPrefix =
    options.categoryPrefix != null && String(options.categoryPrefix).trim()
      ? String(options.categoryPrefix).trim()
      : locale === "en"
        ? "Category"
        : "التصنيف";
  const topicPrefix =
    options.topicPrefix != null && String(options.topicPrefix).trim()
      ? String(options.topicPrefix).trim()
      : locale === "en"
        ? "Ready-made topic"
        : "الموضوع الجاهز";
  return { locale, categoryPrefix, topicPrefix };
}

/**
 * Secondary line for bell dropdown / notifications page cards.
 * Feedback: "التصنيف: …" first, optional topic/title — compact, no null placeholders.
 */
export function getNotificationDetails(n, canShowOrderReference = false, options = {}) {
  const type = String(n?.type || "").trim();
  const actor = actorLabel(n?.actor);
  const actorFallbackName = String(n?.metadata?.actorName || "").trim();
  const actorFallbackAcc = String(n?.metadata?.actorAccountId || "").trim();
  const actorFallback =
    actorFallbackName && actorFallbackAcc
      ? `${actorFallbackName} (${actorFallbackAcc})`
      : actorFallbackName || actorFallbackAcc || "";
  const actorPart = actor || actorFallback;
  const projectName = String(n?.metadata?.projectName || "").trim();
  const orderCode = String(n?.metadata?.orderCode || "").trim();
  const orderId = String(n?.metadata?.orderId || n?.entityId || "").trim();

  if (type === "feedback.created" || type.startsWith("feedback.")) {
    const { locale, categoryPrefix, topicPrefix } = feedbackDetailLabels(options);
    const categoryLabel = resolveFeedbackNotificationCategoryLabel(n?.metadata, locale);
    const subject = truncateLabel(n?.metadata?.subject || "");
    const topicLabel = String(n?.metadata?.topicLabel || "").trim();
    const parts = [];
    if (categoryLabel) parts.push(`${categoryPrefix}: ${categoryLabel}`);
    if (topicLabel) parts.push(`${topicPrefix}: ${topicLabel}`);
    if (subject) parts.push(`«${subject}»`);
    return parts.join(" · ");
  }

  if (type === "order.created") {
    const categoryName = String(n?.metadata?.categoryName || "").trim();
    const subcategoryName = String(n?.metadata?.subcategoryName || "").trim();
    if (categoryName && subcategoryName && projectName) {
      return `«${categoryName}» — «${subcategoryName}»: ${projectName}`;
    }
    if (categoryName && projectName) {
      return `«${categoryName}»: ${projectName}`;
    }
    return projectName;
  }

  const orderPart =
    canShowOrderReference && (orderCode || orderId) ? (orderCode ? `${orderCode}` : `#${orderId}`) : "";
  const projectPart = projectName ? projectName : "";
  const parts = [actorPart, projectPart, orderPart].filter(Boolean);
  return parts.join(" - ");
}

export function getNotificationTypeIconKind(type) {
  const raw = String(type || "").toLowerCase();
  if (raw.includes("feedback") || raw.includes("message") || raw.includes("chat")) return "message";
  if (
    raw.includes("claim") ||
    raw.includes("financial") ||
    raw.includes("payment") ||
    raw.includes("pay") ||
    raw.includes("stripe") ||
    raw.includes("invoice")
  ) {
    return "wallet";
  }
  if (raw.includes("course") || raw.includes("lesson")) return "course";
  if (raw.includes("order")) return "order";
  return "bell";
}
