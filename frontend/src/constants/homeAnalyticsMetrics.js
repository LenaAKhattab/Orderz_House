/**
 * Public homepage hero metrics — copy only (logic unchanged: 7-day PostHog window).
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
    label: "زوار الموقع",
    sub: "زيارات الصفحات · آخر 7 أيام",
    tooltip:
      "عدد الأشخاص الذين زاروا صفحات الموقع خلال آخر 7 أيام (حدث $pageview في PostHog). ليس عدّاً لحظياً للمتصلين الآن.",
    tone: "visitors",
    stripLabel: "زوار الموقع",
  },
  active: {
    key: "active",
    label: "المستخدمون المتفاعلون",
    sub: "نشاط داخل المنصة · آخر 7 أيام",
    tooltip:
      "عدد المستخدمين الذين نفّذوا أي نشاط يُتتبَّع خلال آخر 7 أيام (مثل تسجيل الدخول أو أحداث المنصة). قد يكون أعلى من الزوار إذا حدث نشاط دون زيارة صفحة.",
    tone: "active",
    stripLabel: "مستخدمون متفاعلون",
  },
});

/** Super Admin / docs — why numbers differ */
export const HOME_METRICS_ADMIN_EXPLAINER = Object.freeze({
  title: "ما الفرق بين المؤشرين على الصفحة الرئيسية؟",
  note: "كلا الرقمين يعكسان آخر 7 أيام — وليس «متصل الآن» أو «نشط هذه اللحظة».",
  visitors: {
    term: "زوار الموقع",
    body: "يعتمد على زيارات الصفحات فقط (حدث $pageview) — أي شخص فتح صفحة في الموقع.",
  },
  active: {
    term: "المستخدمون المتفاعلون",
    body: "يعتمد على أي نشاط يُرسل إلى PostHog (تسجيل دخول، طلبات، أحداث المنصة، إلخ) — حتى دون زيارة صفحة جديدة.",
  },
  whyDiffer:
    "قد يظهر المتفاعلون أعلى من الزوار عندما يعود مستخدم مسجّل وينفّذ إجراءات دون تصفح صفحات عامة جديدة.",
});
