import { resources } from "../../i18n/resources.js";
import { pt } from "../../i18n/activeLocale.js";
import { pickIntlTag } from "../../i18n/intlLocale.js";
import { isNewLocale, localizeSystemText } from "../../i18n/systemContent.js";
import { getPlanLocaleKey } from "./getLocalizedPlanDisplay.js";
import { containsArabicScript, localizeSystemCopyForNewLocale } from "./newLocaleSystemCopy.js";

/** Canonical platform taxonomy (catalog keys). Machine identity is the slug, never the Arabic label. */
const CATEGORY_KEY_BY_SLUG = Object.freeze({
  "content-writing": "platformCore.taxonomy.contentWriting",
  design: "platformCore.taxonomy.design",
  programming: "platformCore.taxonomy.programming",
});

const CATEGORY_KEY_BY_ARABIC = Object.freeze({
  "كتابة محتوى": CATEGORY_KEY_BY_SLUG["content-writing"],
  "كتابة المحتوى": CATEGORY_KEY_BY_SLUG["content-writing"],
  "خدمات كتابة المحتوى": CATEGORY_KEY_BY_SLUG["content-writing"],
  تصميم: CATEGORY_KEY_BY_SLUG.design,
  "خدمات التصميم": CATEGORY_KEY_BY_SLUG.design,
  برمجة: CATEGORY_KEY_BY_SLUG.programming,
  "خدمات البرمجة": CATEGORY_KEY_BY_SLUG.programming,
});

/** English names of the canonical taxonomy slugs (kept for existing importers). */
const CATEGORY_EN_BY_SLUG = Object.freeze(
  Object.fromEntries(Object.entries(CATEGORY_KEY_BY_SLUG).map(([slug, key]) => [slug, pt(key, undefined, "en")])),
);

/** Known platform training-course titles (Arabic source → catalog key). Admin-authored titles are not listed here. */
const COURSE_TITLE_KEY_BY_ARABIC = Object.freeze({
  "تدريب مجاني على كتابة المحتوى – المستوى الأول": "platformCore.courseTitles.freeContentWritingLevel1",
  "تدريب مجاني كتابة المحتوى – المستوى الأول": "platformCore.courseTitles.freeContentWritingLevel1",
  "تدريب كتابة المحتوى – المستوى الأول": "platformCore.courseTitles.contentWritingLevel1",
  "تدريب كتابة المحتوى – المستوى الثاني": "platformCore.courseTitles.contentWritingLevel2",
  "تدريب مجاني كتابة المحتوى – المستوى الثاني": "platformCore.courseTitles.freeContentWritingLevel2",
  "تدريبات مجانية في التصميم": "platformCore.courseTitles.freeDesign",
  "دبلوم تشغيل العمل الحر الرقمي": "platformCore.courseTitles.freelanceOperationsDiploma",
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

export { containsArabicScript };

function translated(t, key) {
  if (!key || typeof t !== "function") return "";
  const value = t(key);
  if (!value || value === key) return "";
  return String(value);
}

/**
 * English uses the English field only.
 * Arabic uses the Arabic field, then the existing base value.
 * German / Dutch / Romanian use the system-content translation (source: English, else Arabic).
 */
export function pickLocalizedPlatformCopy(arabic, english, locale) {
  const ar = String(arabic || "").trim();
  const en = String(english || "").trim();
  if (locale === "en") return en;
  if (isNewLocale(locale)) return localizeSystemText(locale, { ar, en });
  return ar;
}

function categoryKeyFor(slug, arabic) {
  if (slug && CATEGORY_KEY_BY_SLUG[slug]) return CATEGORY_KEY_BY_SLUG[slug];
  if (arabic && CATEGORY_KEY_BY_ARABIC[arabic]) return CATEGORY_KEY_BY_ARABIC[arabic];
  return null;
}

export function localizeCategoryName(category, locale) {
  if (!category) return "";
  const arabic = String(category.name || category.nameAr || "").trim();
  const explicit = String(category.nameEn || category.name_en || "").trim();
  const slug = String(category.slug || "").trim();
  if (isNewLocale(locale)) {
    return localizeSystemCopyForNewLocale(locale, { ar: arabic, en: explicit, key: categoryKeyFor(slug, arabic) });
  }
  if (locale !== "en") return arabic;
  if (explicit && !containsArabicScript(explicit)) return explicit;
  const canonicalKey = categoryKeyFor(slug, arabic);
  if (canonicalKey) return pt(canonicalKey, undefined, "en");
  if (explicit) return explicit;
  return arabic;
}

export function localizeCanonicalPlanTitle(row, locale) {
  if (!row) return "";
  const arabicTitle = String(row.planTitle || row.title || "").trim();
  if (isNewLocale(locale)) {
    const explicitTitle = String(row.planTitleEn || row.titleEn || row.title_en || "").trim();
    const cardKey = getPlanLocaleKey({ id: row.planId ?? row.id, name: row.planName || row.name });
    const localized = localizeSystemCopyForNewLocale(locale, {
      ar: arabicTitle,
      en: explicitTitle,
      key: cardKey ? `plans.cards.${cardKey}.title` : null,
    });
    if (localized && !containsArabicScript(localized)) return localized;
    const machineName = String(row.planName || row.name || "").trim();
    if (machineName && !containsArabicScript(machineName)) return machineName;
    return "";
  }
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
  const explicit = String(row.titleEn || row.title_en || "").trim();
  const courseKey = title ? COURSE_TITLE_KEY_BY_ARABIC[title] || null : null;
  if (isNewLocale(locale)) {
    return localizeSystemCopyForNewLocale(locale, { ar: title, en: explicit, key: courseKey });
  }
  if (locale !== "en") return title;
  if (explicit && !containsArabicScript(explicit)) return explicit;
  if (courseKey) return pt(courseKey, undefined, "en");
  if (title && !containsArabicScript(title)) return title;
  return title;
}

const regionNamesCache = new Map();

function regionDisplayName(code, locale) {
  if (!/^[A-Z]{2}$/.test(code) || typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return "";
  const tag = pickIntlTag(locale);
  try {
    if (!regionNamesCache.has(tag)) regionNamesCache.set(tag, new Intl.DisplayNames([tag], { type: "region" }));
    const name = regionNamesCache.get(tag).of(code);
    return name && name !== code ? String(name) : "";
  } catch {
    return "";
  }
}

export function localizeCountryName(row, locale) {
  if (!row) return "";
  if (isNewLocale(locale)) {
    const code = String(row.countryCode || "").trim().toUpperCase();
    const fromIntl = regionDisplayName(code, locale);
    if (fromIntl) return fromIntl;
    const localized = localizeSystemCopyForNewLocale(locale, { ar: row.name, en: row.nameEn });
    if (localized && !containsArabicScript(localized)) return localized;
    return code || localized;
  }
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
  if (isNewLocale(locale)) {
    const localized = localizeSystemCopyForNewLocale(locale, { ar: arabic, en: page.titleEn || page.title_en });
    return localized && !containsArabicScript(localized) ? localized : "";
  }
  if (locale !== "en") return arabic;
  const explicit = String(page.titleEn || page.title_en || "").trim();
  if (explicit && !containsArabicScript(explicit)) return explicit;
  if (arabic && !containsArabicScript(arabic)) return arabic;
  return explicit || "";
}

export { ANALYTICS_ALERT_KEYS, ANALYTICS_METRIC_KEYS, CATEGORY_EN_BY_SLUG };
