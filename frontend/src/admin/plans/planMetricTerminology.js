/**
 * Business-facing labels and tooltips — must match actual SQL semantics (no logic).
 * Snapshot KPIs: freelancer_subscriptions WHERE is_current = TRUE.
 * Revenue: SUM(plans.price_jod) WHERE payment_status = 'paid' (catalog price, not Stripe cash).
 * Month trend: COUNT/SUM by COALESCE(paid_at, assigned_at) in calendar month vs previous month.
 */

export const METRIC_SCOPE_NOTE =
  "الأرقام من سجلات الاشتراك الحالية (is_current). الإيراد = مجموع سعر الباقة للاشتراكات المسجّلة «مدفوعة» — ليس إيراداً محاسبياً ولا تحويلات Stripe. اتجاه الشهر = نشاط ذلك الشهر مقابل الشهر السابق.";

export const KPI_LABELS = {
  currentSubscriptions: {
    label: "اشتراكات سارية",
    title: "عدد اشتراكات المستقلين الحالية المرتبطة بهذه الباقة (سجل is_current)",
  },
  activeSubscriptions: {
    label: "اشتراكات نشطة",
    title: "من الاشتراكات السارية: الحالة = active في النظام",
  },
  paidSubscriptionValue: {
    label: "قيمة مدفوعة",
    title: "مجموع سعر الباقة (price_jod) للاشتراكات السارية المسجّلة كمدفوعة — ليس مبلغ Stripe الفعلي",
  },
  paidPerCurrentSub: {
    label: "قيمة مدفوعة ÷ اشتراك ساري",
    title: "مجموع القيمة المدفوعة مقسوماً على كل الاشتراكات السارية (يشمل غير المدفوعة)",
  },
  activeShare: {
    label: "نسبة الاشتراكات النشطة",
    title: "اشتراكات نشطة ÷ اشتراكات سارية",
  },
  monthTrendSubs: {
    title:
      "عدد سجلات الاشتراك التي تاريخها (دفع أو إسناد) في هذا الشهر مقابل الشهر السابق — ليس إجمالي الاشتراكات السارية ولا نمو قاعدة المشتركين",
  },
  monthTrendRevenue: {
    title: "مجموع سعر الباقة للاشتراكات المدفوعة في هذا الشهر مقابل الشهر السابق",
  },
};

export const HEALTH_LABELS = {
  unused: { label: "بلا اشتراكات سارية", title: "لا يوجد أي اشتراك حالي على هذه الباقة" },
  catalog_off: { label: "معطّلة في الكتالوج", title: "الباقة غير مفعّلة في النظام (قد تبقى اشتراكات سارية قديمة)" },
  excellent: {
    label: "نشاط قوي",
    title: "اشتراكات نشطة كثيرة ونسبة نشاط عالية مقارنة بباقي الباقات",
  },
  good: { label: "نشاط جيد", title: "نسبة اشتراكات نشطة مقبولة" },
  weak: {
    label: "نشاط ضعيف",
    title: "اشتراكات سارية لكن قلة في الحالة active أو نسبة نشاط منخفضة",
  },
};

export const BADGE_LABELS = {
  popular: "أكثر اشتراكات سارية",
  revenue: "أعلى قيمة مدفوعة",
  premium: "أعلى سعر للباقة",
};

export const RECOMMENDATION_LABELS = {
  promote: "مرشّحة للترويج",
  review: "راجع التفعيل والدفع",
  rethink: "بلا اشتراكات — راجع العرض",
  strategic: "محور المنصة تشغيلياً",
  fix_revenue: "راجع التسعير والتحصيل",
  fix_activation: "راجع التفعيل والدفع",
};

export const ALERT_LABELS = {
  high_subs_low_rev: "اشتراكات سارية كثيرة · قيمة مدفوعة منخفضة",
  high_rev_low_subs: "قيمة مدفوعة مرتفعة · اشتراكات سارية قليلة",
  high_act_low_adopt: "نشاط جيد · اشتراكات سارية قليلة",
  low_act_high_adopt: "اشتراكات سارية كثيرة · نشاط ضعيف",
};

export const SUMMARY_LABELS = {
  totalCurrentSubs: "إجمالي اشتراكات سارية",
  totalPaidValue: "إجمالي قيمة مدفوعة (اشتراكات)",
  topUsage: "أكثر اشتراكات سارية",
  topPaidValue: "أعلى قيمة مدفوعة",
};

export const SORT_LABELS = {
  revenue: "أعلى قيمة مدفوعة",
  subscribers: "أكثر اشتراكات سارية",
  active: "أكثر اشتراكات نشطة",
  attention: "يحتاج انتباهاً",
};

export const PAGE_COPY = {
  title: "محفظة الباقات والاشتراكات",
  description:
    "اشتراكات سارية وقيمة مسجّلة حسب سعر الباقة (ليست تحويلات Stripe). اتجاه الشهر = نشاط ذلك الشهر مقابل السابق.",
  summaryAria: "ملخص اشتراكات الباقات",
  portfolioStripAria: "رؤى محفظة الاشتراكات",
};

export const STRIP_LABELS = {
  growth: "أكثر نشاط اشتراك (هذا الشهر)",
  revenue: "أعلى قيمة مدفوعة",
  usage: "أكثر اشتراكات سارية",
  risk: "تركّز القيمة المدفوعة (اشتراكات)",
};

export function revenueSharePhrase(pctFormatted) {
  return `تمثل ${pctFormatted} من قيمة الاشتراكات المدفوعة (حسب سعر الباقة)`;
}

export function concentrationRiskPhrase(pctFormatted) {
  return `تعتمد قيمة اشتراكات المنصة المدفوعة على هذه الباقة بنسبة ${pctFormatted}`;
}

export function concentrationPlatformPhrase(planTitle, pctFormatted) {
  return `تركّز: ${planTitle} = ${pctFormatted} من قيمة اشتراكات المنصة المدفوعة`;
}
