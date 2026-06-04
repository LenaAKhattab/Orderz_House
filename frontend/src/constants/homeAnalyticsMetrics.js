/**
 * Public homepage hero metrics — copy only (views: all-time $pageview count; active: 7-day window).
 * @type {Record<'views'|'active', {
 *   key: 'views'|'active',
 *   label: string,
 *   sub: string,
 *   tooltip: string,
 *   tone: 'visitors'|'active',
 *   stripLabel: string,
 * }>}
 */
export const HOME_PUBLIC_METRICS = Object.freeze({
  views: {
    key: "views",
    label: "مشاهدات الموقع",
    sub: "إجمالي مشاهدات الموقع",
    tooltip:
      "إجمالي أحداث مشاهدة الصفحات ($pageview) على الموقع منذ بدء التتبع في PostHog. يشمل كل الزيارات وليس عدد الزوار الفريدين.",
    tone: "visitors",
    stripLabel: "مشاهدات الموقع",
  },
  active: {
    key: "active",
    label: "المستخدمون النشطون",
    sub: "نشاط في المنصة · آخر 7 أيام",
    tooltip:
      "عدد المستخدمين الذين نفّذوا نشاطاً في المنصة خلال آخر 7 أيام، مثل تسجيل الدخول أو إنشاء طلب. قد يكون أعلى من الزوار.",
    tone: "active",
    stripLabel: "مستخدمون نشطون",
  },
});

/** Super Admin — collapsible help (platform settings) */
export const HOME_METRICS_ADMIN_HELP = Object.freeze({
  title: "ما الفرق بين المؤشرين؟",
  visitors: "مشاهدات الموقع: إجمالي أحداث $pageview منذ بدء التتبع.",
  active: "المستخدمون النشطون: المستخدمون الذين قاموا بنشاط داخل المنصة خلال آخر 7 أيام.",
});

/** @deprecated Use HOME_METRICS_ADMIN_HELP — kept for legacy imports */
export const HOME_METRICS_ADMIN_EXPLAINER = Object.freeze({
  title: HOME_METRICS_ADMIN_HELP.title,
  note: "",
  visitors: { term: "مشاهدات الموقع", body: HOME_METRICS_ADMIN_HELP.visitors.replace(/^مشاهدات الموقع:\s*/, "") },
  active: {
    term: "المستخدمون النشطون",
    body: HOME_METRICS_ADMIN_HELP.active.replace(/^المستخدمون النشطون:\s*/, ""),
  },
  whyDiffer: "",
});
