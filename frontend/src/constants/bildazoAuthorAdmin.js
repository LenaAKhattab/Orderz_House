import { ct, withCatalogLabels } from "./constantsI18n.js";

/**
 * Super Admin review filters for OrderzHouse-side Bildazo author link requests.
 * `labelKey` is the catalog key; the legacy `labelAr` getter follows the non-English UI branch (Arabic, or the
 * active de / nl / ro locale).
 */
export const BILDAZO_ADMIN_STATUS_FILTERS = Object.freeze(
  [
    "all",
    "pending_new_account",
    "pending_existing_account",
    "pending_external_verification",
    "needs_manual_review",
    "linked",
    "failed",
    "blocked",
  ].map((value) =>
    Object.freeze(withCatalogLabels({ value }, `bildazoAuthorAdmin.statusFilters.${value}`, { labelAr: "local" })),
  ),
);

export const BILDAZO_ADMIN_REVIEW_STATUSES = Object.freeze([
  "needs_manual_review",
  "failed",
  "blocked",
]);

/** @param {string} [locale] default: Arabic, or the active de / nl / ro locale */
export function bildazoAdminStatusLabel(status, locale) {
  const hit = BILDAZO_ADMIN_STATUS_FILTERS.find((item) => item.value === status);
  if (hit) return ct(`bildazoAuthorAdmin.statusFilters.${hit.value}`, undefined, locale);
  return status || "—";
}

export function bildazoAdminStatusTone(status) {
  if (status === "linked") return "success";
  if (status === "failed" || status === "blocked") return "danger";
  if (String(status || "").startsWith("pending") || status === "needs_manual_review") return "pending";
  return "neutral";
}

export function canSubmitManualLink({ bildazoPublicId, bildazoProfileUrl, confirmVerified }) {
  const hasId = Boolean(String(bildazoPublicId || "").trim());
  const hasUrl = Boolean(String(bildazoProfileUrl || "").trim());
  return Boolean(confirmVerified) && (hasId || hasUrl);
}
