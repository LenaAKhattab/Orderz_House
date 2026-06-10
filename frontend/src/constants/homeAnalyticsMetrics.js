/**
 * Public homepage hero metrics — copy only (both stats from local DB).
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
    sub: "إجمالي الزيارات المسجّلة",
    tooltip:
      "يُزاد العداد مرة واحدة لكل جلسة نشطة (30 دقيقة). التحديث أو العودة خلال نفس الجلسة لا يزيد العدد.",
    tone: "visitors",
    stripLabel: "مشاهدات الموقع",
  },
  active: {
    key: "active",
    label: "المستخدمون النشطون",
    sub: "نشاط داخل المنصة · آخر 7 أيام",
    tooltip:
      "عدد الزوار الفريدين (جلسات المتصفح أو حسابات مسجّلة) الذين زاروا الموقع خلال آخر 7 أيام. التحديث المتكرر من نفس المتصفح يُعد زائراً واحداً.",
    tone: "active",
    stripLabel: "مستخدمون نشطون",
  },
});

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
