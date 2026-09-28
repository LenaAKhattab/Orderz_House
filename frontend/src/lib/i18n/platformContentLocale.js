import { resources } from "../../i18n/resources.js";
import { getPlanLocaleKey } from "./getLocalizedPlanDisplay.js";

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/** Canonical platform taxonomy. Machine identity is the slug, never the Arabic label. */
const CATEGORY_EN_BY_SLUG = Object.freeze({
  "content-writing": "Content writing",
  design: "Design",
  programming: "Programming",
});

const CATEGORY_EN_BY_ARABIC = Object.freeze({
  "كتابة محتوى": "Content writing",
  "كتابة المحتوى": "Content writing",
  "خدمات كتابة المحتوى": "Content writing",
  تصميم: "Design",
  "خدمات التصميم": "Design",
  برمجة: "Programming",
  "خدمات البرمجة": "Programming",
});

/** Known platform training-course titles. Admin-authored titles are not listed here. */
const COURSE_TITLE_EN = Object.freeze({
  "تدريب مجاني على كتابة المحتوى – المستوى الأول": "Free content writing training – Level 1",
  "تدريب مجاني كتابة المحتوى – المستوى الأول": "Free content writing training – Level 1",
  "تدريب كتابة المحتوى – المستوى الأول": "Content writing training – Level 1",
  "تدريب كتابة المحتوى – المستوى الثاني": "Content writing training – Level 2",
  "تدريب مجاني كتابة المحتوى – المستوى الثاني": "Free content writing training – Level 2",
  "تدريبات مجانية في التصميم": "Free design training",
  "دبلوم تشغيل العمل الحر الرقمي": "Digital freelance operations diploma",
});

const ANALYTICS_METRIC_KEYS = Object.freeze({
  totalUsers: "analysis.metrics.totalUsers",
  totalOrders: "analysis.metrics.totalOrders",
  ordersThisMonth: "analysis.metrics.ordersThisMonth",
  monthlyRevenue: "analysis.metrics.monthlyRevenue",
  revenueThisMonth: "analysis.metrics.monthlyRevenue",
  activeSubscriptions: "analysis.metrics.activeSubscriptions",
  totalClients: "analysis.metrics.totalClients",
  activeFreelancers: "analysis.metrics.activeFreelancers",
  pendingClaims: "analysis.metrics.pendingClaims",
  claimsSubmitted: "analysis.metrics.claimsSubmitted",
});

const ANALYTICS_HINT_KEYS = Object.freeze({
  totalUsers: "analysis.labels.comparedToMonthStart",
  totalOrders: "analysis.labels.comparedToMonthStart",
  pendingClaims: "analysis.labels.currentOnly",
  claimsSubmitted: "analysis.labels.monthVsPrevious",
});

const ANALYTICS_ALERT_KEYS = Object.freeze({
  pending_activations: "analysis.product.alerts.pending_activations",
  pending_or_failed_payments: "analysis.product.alerts.pending_or_failed_payments",
  pending_claims_review: "analysis.product.alerts.pending_claims_review",
  orders_waiting_too_long: "analysis.product.alerts.orders_waiting_too_long",
  inactive_subscribed_freelancers: "analysis.product.alerts.inactive_subscribed_freelancers",
  low_performing_courses: "analysis.product.alerts.low_performing_courses",
});

const PLAN_GROUP_KEYS = Object.freeze({
  core: "analysis.planGroup.core",
  pages: "analysis.planGroup.pages",
  unassigned: "analysis.planGroup.unassigned",
});

export function containsArabicScript(value) {
  return ARABIC_SCRIPT.test(String(value || ""));
}

function translated(t, key) {
  if (!key || typeof t !== "function") return "";
  const value = t(key);
  if (!value || value === key) return "";
  return String(value);
}

/**
 * English uses the English field only.
 * Arabic uses the Arabic field, then the existing base value.
 */
export function pickLocalizedPlatformCopy(arabic, english, locale) {
  const ar = String(arabic || "").trim();
  const en = String(english || "").trim();
  if (locale === "en") return en;
  return ar;
}

export function localizeCategoryName(category, locale) {
  if (!category) return "";
  const arabic = String(category.name || category.nameAr || "").trim();
  if (locale !== "en") return arabic;
  const explicit = String(category.nameEn || category.name_en || "").trim();
  if (explicit && !containsArabicScript(explicit)) return explicit;
  const slug = String(category.slug || "").trim();
  if (slug && CATEGORY_EN_BY_SLUG[slug]) return CATEGORY_EN_BY_SLUG[slug];
  if (arabic && CATEGORY_EN_BY_ARABIC[arabic]) return CATEGORY_EN_BY_ARABIC[arabic];
  if (explicit) return explicit;
  return arabic;
}

export function localizeCanonicalPlanTitle(row, locale) {
  if (!row) return "";
  const arabicTitle = String(row.planTitle || row.title || "").trim();
  if (locale !== "en") return arabicTitle || String(row.planName || row.name || "").trim();
  const explicit = String(row.planTitleEn || row.titleEn || row.title_en || "").trim();
  if (explicit && !containsArabicScript(explicit)) return explicit;
  const key = getPlanLocaleKey({
    id: row.planId ?? row.id,
    name: row.planName || row.name,
  });
  const bundled = key ? resources.en?.plans?.cards?.[key]?.title : "";
  if (bundled && (!arabicTitle || containsArabicScript(arabicTitle))) return String(bundled);
  if (arabicTitle && !containsArabicScript(arabicTitle)) return arabicTitle;
  if (bundled) return String(bundled);
  const machine = String(row.planName || row.name || "").trim();
  if (machine && !containsArabicScript(machine)) return machine;
  return "";
}

export function localizeCourseTitle(row, locale) {
  if (!row) return "";
  const title = String(row.title || "").trim();
  if (locale !== "en") return title;
  const explicit = String(row.titleEn || row.title_en || "").trim();
  if (explicit && !containsArabicScript(explicit)) return explicit;
  if (title && COURSE_TITLE_EN[title]) return COURSE_TITLE_EN[title];
  if (title && !containsArabicScript(title)) return title;
  return title;
}

export function localizeCountryName(row, locale) {
  if (!row) return "";
  if (locale === "en") {
    return String(row.nameEn || row.countryCode || "").trim() || String(row.name || "").trim();
  }
  return String(row.name || row.countryCode || "").trim();
}

export function localizeAnalyticsMetricLabel(metric, t) {
  const key = ANALYTICS_METRIC_KEYS[metric?.key];
  return translated(t, key) || String(metric?.label || "");
}

export function localizeAnalyticsMetricHint(metric, t) {
  const key = ANALYTICS_HINT_KEYS[metric?.key];
  return translated(t, key) || "";
}

export function localizeAnalyticsAlertTitle(alert, t) {
  const key = ANALYTICS_ALERT_KEYS[alert?.key];
  return translated(t, key) || String(alert?.title || "");
}

export function analyticsAlertTextKey(alertKey) {
  return ANALYTICS_ALERT_KEYS[alertKey] || "";
}

export function localizePlanGroupLabel(group, t) {
  const key = PLAN_GROUP_KEYS[group?.groupKey];
  return translated(t, key) || String(group?.groupLabel || "");
}

export function localizePlanPageTitle(page, locale) {
  if (!page) return "";
  const arabic = String(page.title || "").trim();
  if (locale !== "en") return arabic;
  const explicit = String(page.titleEn || page.title_en || "").trim();
  if (explicit && !containsArabicScript(explicit)) return explicit;
  if (arabic && !containsArabicScript(arabic)) return arabic;
  return explicit || "";
}

export { ANALYTICS_ALERT_KEYS, ANALYTICS_METRIC_KEYS, CATEGORY_EN_BY_SLUG };
