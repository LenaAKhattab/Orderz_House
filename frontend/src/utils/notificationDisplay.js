import { FEEDBACK_TYPES, feedbackTypeLabel } from "../constants/feedback.js";
import { pt } from "../i18n/activeLocale.js";
import { resources } from "../i18n/resources.js";
import { isNewLocale, translateSystemContent } from "../i18n/systemContent.js";

/** System-content label (category / topic snapshot) in a new locale; original text when no translation exists. */
function systemLabel(text, locale) {
  const value = String(text || "").trim();
  if (!value || !isNewLocale(locale)) return value;
  return translateSystemContent(value, locale) || value;
}

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
  if (snapshot) return systemLabel(snapshot, locale);

  const legacyKey = String(meta.categoryKey || meta.feedbackType || meta.type || "").trim();
  if (!legacyKey) return "";
  if (!FEEDBACK_TYPES.some((row) => row.value === legacyKey)) return "";
  return feedbackTypeLabel(legacyKey, isNewLocale(locale) ? locale : locale === "en" ? "en" : "ar");
}

function feedbackDetailLabels(options = {}) {
  if (isNewLocale(options.locale)) {
    const loc = options.locale;
    return {
      locale: loc,
      categoryPrefix:
        options.categoryPrefix != null && String(options.categoryPrefix).trim()
          ? String(options.categoryPrefix).trim()
          : pt("notificationTypes.details.category", undefined, loc),
      topicPrefix:
        options.topicPrefix != null && String(options.topicPrefix).trim()
          ? String(options.topicPrefix).trim()
          : pt("notificationTypes.details.topic", undefined, loc),
    };
  }
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
    const topicLabel = systemLabel(n?.metadata?.topicLabel, locale);
    const parts = [];
    if (categoryLabel) parts.push(`${categoryPrefix}: ${categoryLabel}`);
    if (topicLabel) parts.push(`${topicPrefix}: ${topicLabel}`);
    if (subject) parts.push(`«${subject}»`);
    return parts.join(" · ");
  }

  if (type === "order.created") {
    const categoryName = systemLabel(n?.metadata?.categoryName, options.locale);
    const subcategoryName = systemLabel(n?.metadata?.subcategoryName, options.locale);
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

/**
 * Title/message for the viewer's locale. Rows store Arabic; producers that also have English copy send it in
 * metadata.titleEn / metadata.messageEn (e.g. order.pool.summary). Falls back to the stored text.
 */
function typeCatalogEntry(key) {
  const types = resources.en && resources.en.notificationTypes && resources.en.notificationTypes.types;
  return types && Object.prototype.hasOwnProperty.call(types, key) ? types[key] : null;
}

/**
 * German / Dutch / Romanian: rows store Arabic text, so the title / message come from the type catalog
 * (notificationTypes.types.<type with "_">), interpolating only reliable numeric metadata. Unknown types get a
 * localized category title. User content referenced by the row (project names …) is shown by the details line.
 */
function newLocaleNotificationText(n, locale) {
  const type = String(n?.type || "").trim();
  const meta = n?.metadata && typeof n.metadata === "object" ? n.metadata : {};
  let key = type.replace(/\./g, "_");
  if (key === "order_pool_summary" && /training/i.test(String(meta.titleEn || ""))) key = "order_pool_summary_training";
  const entry = typeCatalogEntry(key);
  if (!entry) {
    return { title: pt(`notificationTypes.fallback.${getNotificationTypeIconKind(type)}`, undefined, locale), message: "" };
  }
  const vars = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === "number" && Number.isFinite(v)) vars[k] = v;
    else if (typeof v === "string" && /^\d{1,9}$/.test(v.trim())) vars[k] = Number(v.trim());
  }
  const needed = [...String(entry.message || "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const message = needed.every((name) => vars[name] !== undefined)
    ? pt(`notificationTypes.types.${key}.message`, vars, locale)
    : "";
  return { title: pt(`notificationTypes.types.${key}.title`, vars, locale), message };
}

export function getNotificationText(n, locale = "ar") {
  const title = String(n?.title || "").trim();
  const message = String(n?.message || "").trim();
  if (isNewLocale(locale)) return newLocaleNotificationText(n, locale);
  if (locale !== "en") return { title, message };
  const meta = n?.metadata && typeof n.metadata === "object" ? n.metadata : {};
  return {
    title: String(meta.titleEn || "").trim() || title,
    message: String(meta.messageEn || "").trim() || message,
  };
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
