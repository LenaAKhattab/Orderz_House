export const MY_ARTICLES_PORTFOLIO_STATUSES = Object.freeze([
  { key: "all", labelAr: "الكل" },
  { key: "awaiting_selection", labelAr: "بانتظار الاختيار" },
  { key: "awaiting_execution", labelAr: "بانتظار التنفيذ" },
  { key: "under_review", labelAr: "تحت التدقيق" },
  { key: "revision_requested", labelAr: "مطلوب تعديل" },
  { key: "accepted", labelAr: "مقبولة" },
  { key: "published_on_bildazo", labelAr: "منشورة على Bildazo" },
  { key: "rejected", labelAr: "مرفوضة" },
]);

export const MY_ARTICLES_EMPTY_TITLE_AR = "لم تبدأ بعد في تنفيذ أي مقالات.";

export const MY_ARTICLES_EMPTY_DESC_AR =
  "عند الفوز بمقال، سيظهر هنا مع حالة التدقيق والنشر.";

export function portfolioStatusLabel(statusKey, itemLabel) {
  return itemLabel || MY_ARTICLES_PORTFOLIO_STATUSES.find((s) => s.key === statusKey)?.labelAr || statusKey;
}
