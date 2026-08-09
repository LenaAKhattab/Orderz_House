/** Shared labels/helpers for Problems & Suggestions (user + Super Admin). */

/** Legacy fallback labels for pre-category rows (type = problem|suggestion|other). */
export const FEEDBACK_TYPES = [
  { value: "problem", ar: "مشكلة", en: "Problem" },
  { value: "suggestion", ar: "اقتراح", en: "Suggestion" },
  { value: "other", ar: "ملاحظة أخرى", en: "Other feedback" },
];

export const FEEDBACK_STATUSES = [
  { value: "new", ar: "جديد", en: "New", tone: "pending" },
  { value: "in_review", ar: "قيد المراجعة", en: "In review", tone: "admin_assigned" },
  { value: "resolved", ar: "تم الحل", en: "Resolved", tone: "success" },
  { value: "closed", ar: "مغلق", en: "Closed", tone: "inactive" },
];

export const FEEDBACK_PRIORITIES = [
  { value: "low", ar: "منخفضة", en: "Low" },
  { value: "normal", ar: "عادية", en: "Normal" },
  { value: "high", ar: "مرتفعة", en: "High" },
  { value: "urgent", ar: "عاجلة", en: "Urgent" },
];

export function feedbackTypeLabel(type, locale = "ar") {
  const row = FEEDBACK_TYPES.find((t) => t.value === type);
  if (!row) return type || "—";
  return locale === "en" ? row.en : row.ar;
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
  return locale === "en" ? row.en : row.ar;
}

export function feedbackStatusTone(status) {
  return FEEDBACK_STATUSES.find((t) => t.value === status)?.tone || "neutral";
}

export function feedbackPriorityLabel(priority, locale = "ar") {
  const row = FEEDBACK_PRIORITIES.find((t) => t.value === priority);
  if (!row) return priority || "—";
  return locale === "en" ? row.en : row.ar;
}

export function feedbackRoleLabel(role, locale = "ar") {
  if (role === "client") return locale === "en" ? "Client" : "عميل";
  if (role === "freelancer") return locale === "en" ? "Freelancer" : "مستقل";
  return role || "—";
}

export function formatFeedbackDate(value, locale = "ar") {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-JO-u-nu-latn", {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
