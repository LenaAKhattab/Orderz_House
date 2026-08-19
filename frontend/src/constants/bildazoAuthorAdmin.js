/** Super Admin review filters for OrderzHouse-side Bildazo author link requests. */
export const BILDAZO_ADMIN_STATUS_FILTERS = Object.freeze([
  { value: "all", labelAr: "الكل" },
  { value: "pending_new_account", labelAr: "طلب حساب جديد" },
  { value: "pending_existing_account", labelAr: "طلب حساب موجود" },
  { value: "pending_external_verification", labelAr: "تحقق خارجي" },
  { value: "needs_manual_review", labelAr: "مراجعة يدوية" },
  { value: "linked", labelAr: "مرتبط" },
  { value: "failed", labelAr: "فشل" },
  { value: "blocked", labelAr: "موقوف" },
]);

export const BILDAZO_ADMIN_REVIEW_STATUSES = Object.freeze([
  "needs_manual_review",
  "failed",
  "blocked",
]);

export function bildazoAdminStatusLabel(status) {
  const hit = BILDAZO_ADMIN_STATUS_FILTERS.find((item) => item.value === status);
  return hit?.labelAr || status || "—";
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
