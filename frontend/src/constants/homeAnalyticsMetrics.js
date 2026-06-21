/**
 * Public homepage hero metrics — copy only (local DB).
 * @type {Record<'active'|'views'|'availableOrders'|'completedOrders', {
 *   key: 'active'|'views'|'availableOrders'|'completedOrders',
 *   label: string,
 *   sub: string,
 *   tooltip: string,
 *   tone: 'active'|'visitors'|'available'|'completed',
 *   stripLabel: string,
 * }>}
 */
export const HOME_PUBLIC_METRICS = Object.freeze({
  active: {
    key: "active",
    label: "المستخدمون النشطون",
    sub: "نشاط داخل المنصة · آخر 7 أيام",
    tooltip:
      "عدد الزوار الفريدين (جلسات المتصفح أو حسابات مسجّلة) الذين زاروا الموقع خلال آخر 7 أيام. التحديث المتكرر من نفس المتصفح يُعد زائراً واحداً.",
    tone: "active",
    stripLabel: "مستخدمون نشطون",
  },
  views: {
    key: "views",
    label: "مشاهدات الموقع",
    sub: "إجمالي الزيارات المسجّلة",
    tooltip:
      "يُزاد العداد مرة واحدة لكل جلسة نشطة (30 دقيقة). التحديث أو العودة خلال نفس الجلسة لا يزيد العدد.",
    tone: "visitors",
    stripLabel: "مشاهدات الموقع",
  },
  availableOrders: {
    key: "availableOrders",
    label: "الطلبات المتاحة الآن",
    sub: "طلبات متاحة للتقديم الآن",
    tooltip: "طلبات حقيقية مفتوحة في السوق والطلبات التجريبية الظاهرة للمستقلين حالياً.",
    tone: "available",
    stripLabel: "طلبات متاحة الآن",
  },
  completedOrders: {
    key: "completedOrders",
    label: "الطلبات المنجزة",
    sub: "طلبات العملاء المنجزة و المكتملة",
    tooltip:
      "طلبات حقيقية مكتملة، بالإضافة إلى طلبات تدريبية ظهرت في السوق وانتهت دورتها.",
    tone: "completed",
    stripLabel: "طلبات منجزة",
  },
});

/** Hero strip display order (RTL). */
export const HOME_HERO_METRICS_ORDER = Object.freeze([
  HOME_PUBLIC_METRICS.views,
  HOME_PUBLIC_METRICS.active,
  HOME_PUBLIC_METRICS.completedOrders,
  HOME_PUBLIC_METRICS.availableOrders,
]);

/** Super Admin — collapsible help (platform settings) */
export const HOME_METRICS_ADMIN_HELP = Object.freeze({
  title: "ما الفرق بين المؤشرين؟",
  visitors: "عداد الصفحة الرئيسية: زيارة واحدة لكل جلسة (30 دقيقة) — التحديث أو التنقل داخل الجلسة لا يُكرّر العد.",
  active: "المستخدمون النشطون: زوار فريدون (جلسة أو حساب) زاروا الموقع خلال آخر 7 أيام — من قاعدة البيانات المحلية.",
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
