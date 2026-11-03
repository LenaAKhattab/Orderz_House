/** Shared labels/helpers for Problems & Suggestions (user + Super Admin). */
import { pickIntlTag } from "../i18n/intlLocale.js";
import { ct, withCatalogLabels } from "./constantsI18n.js";

/**
 * Option rows: `value` is the stored code; `labelKey` is the catalog key (`t(labelKey)`).
 * Legacy `ar` / `en` getters: `en` is English, `ar` is the non-English UI label (Arabic, or de / nl / ro).
 */
const optionRow = (group, row) => withCatalogLabels(row, `feedback.${group}.${row.value}`, { ar: "local", en: "en" });

/** Legacy fallback labels for pre-category rows (type = problem|suggestion|other). */
export const FEEDBACK_TYPES = [
  optionRow("types", { value: "problem" }),
  optionRow("types", { value: "suggestion" }),
  optionRow("types", { value: "other" }),
];

export const FEEDBACK_STATUSES = [
  optionRow("statuses", { value: "new", tone: "pending" }),
  optionRow("statuses", { value: "in_review", tone: "admin_assigned" }),
  optionRow("statuses", { value: "resolved", tone: "success" }),
  optionRow("statuses", { value: "closed", tone: "inactive" }),
];

export const FEEDBACK_PRIORITIES = [
  optionRow("priorities", { value: "low" }),
  optionRow("priorities", { value: "normal" }),
  optionRow("priorities", { value: "high" }),
  optionRow("priorities", { value: "urgent" }),
];

export function feedbackTypeLabel(type, locale = "ar") {
  const row = FEEDBACK_TYPES.find((t) => t.value === type);
  if (!row) return type || "—";
  return ct(`feedback.types.${row.value}`, undefined, locale);
}

/**
 * Display category for a feedback row.
 * Prefer frozen categoryLabel snapshot; fall back to legacy type translation.
 * Never renders null/undefined.
 */
export function feedbackCategoryDisplayLabel(item, locale = "ar") {
  if (!item || typeof item !== "object") return "—";
  const snapshot =
    item.categoryLabel != null && String(item.categoryLabel).trim()
      ? String(item.categoryLabel).trim()
      : "";
  if (snapshot) return snapshot;
  const type = item.type != null ? String(item.type).trim() : "";
  if (!type) return "—";
  return feedbackTypeLabel(type, locale);
}

export function feedbackStatusLabel(status, locale = "ar") {
  const row = FEEDBACK_STATUSES.find((t) => t.value === status);
  if (!row) return status || "—";
  return ct(`feedback.statuses.${row.value}`, undefined, locale);
}

export function feedbackStatusTone(status) {
  return FEEDBACK_STATUSES.find((t) => t.value === status)?.tone || "neutral";
}

export function feedbackPriorityLabel(priority, locale = "ar") {
  const row = FEEDBACK_PRIORITIES.find((t) => t.value === priority);
  if (!row) return priority || "—";
  return ct(`feedback.priorities.${row.value}`, undefined, locale);
}

export function feedbackRoleLabel(role, locale = "ar") {
  if (role === "client" || role === "freelancer") return ct(`feedback.roles.${role}`, undefined, locale);
  return role || "—";
}

export function formatFeedbackDate(value, locale = "ar") {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat(pickIntlTag(locale, { ar: "ar-JO-u-nu-latn", en: "en-GB" }), {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
