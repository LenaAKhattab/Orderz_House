/**
 * Business-facing labels and tooltips — must match actual SQL semantics (no logic).
 * Snapshot KPIs: freelancer_subscriptions WHERE is_current = TRUE.
 * Revenue: SUM(plans.price_jod) WHERE payment_status = 'paid' (catalog price, not Stripe cash).
 * Month trend: COUNT/SUM by COALESCE(paid_at, assigned_at) in calendar month vs previous month.
 */

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
  display: "ترتيب الظهور",
  revenue: "أعلى قيمة مدفوعة",
  subscribers: "أكثر اشتراكات سارية",
  active: "أكثر اشتراكات نشطة",
  attention: "يحتاج انتباهاً",
};

export const PAGE_COPY = {
  title: "محفظة الباقات والاشتراكات",
  summaryAria: "ملخص اشتراكات الباقات",
  portfolioStripAria: "رؤى محفظة الاشتراكات",
  analyticsFailedAr: "تعذر تحميل بيانات الاشتراكات. أرقام المؤشرات قد لا تكون محدّثة.",
  analyticsFailedEn: "Subscription analytics could not be loaded. KPI figures may be outdated.",
  analyticsRetryAr: "إعادة المحاولة",
  analyticsRetryEn: "Retry",
};

export const SECTION_COPY = {
  core: {
    ar: "الباقات الرئيسية",
    en: "Main plans",
    hintAr: "باقات الصفحة الافتراضية في نظام الباقات الرئيسية (جدول plans). الإدارة مستقلة عن القسم الظاهر للمستخدمين.",
    hintEn: "Plans on the default page in the main plans system. Management is independent of the user-facing catalog.",
    emptyTitleAr: "لا توجد باقات على الصفحة الرئيسية",
    emptyTitleEn: "No main plans",
    emptyDescAr: "أنشئ باقة واربطها بصفحة الباقات الافتراضية.",
    emptyDescEn: "Create a plan and attach it to the default plans page.",
  },
  pages: {
    ar: "باقات الصفحات",
    en: "Page plans",
    hintAr: "باقات الروابط المباشرة مثل /plans/FLF (لا تظهر في الشريط الرئيسي).",
    hintEn: "Direct-link plan pages such as /plans/FLF (not in the main navbar).",
    emptyTitleAr: "لا توجد باقات للصفحات",
    emptyTitleEn: "No page plans yet",
    emptyDescAr: "أنشئ باقة واربطها بصفحة من «صفحات الباقات».",
    emptyDescEn: "Create a plan and attach it to a page from Plan pages.",
    pageFilterLabelAr: "صفحة الباقات",
    pageFilterLabelEn: "Plan page",
    pageFilterAllAr: "كل صفحات الباقات",
    pageFilterAllEn: "All plan pages",
  },
  marketplace: {
    ar: "إدارة باقات العمل",
    en: "Work membership plans",
    hintAr: "باقات عضوية العمل في السوق (Pay As You Work و Active و Pro و Elite). تُدار من هذا القسم فقط.",
    hintEn: "Marketplace work memberships (Pay As You Work, Active, Pro, Elite). Managed from this section only.",
    emptyTitleAr: "لا توجد باقات عمل بعد",
    emptyTitleEn: "No marketplace plans yet",
    emptyDescAr: "أنشئ باقة عمل جديدة من هذا القسم.",
    emptyDescEn: "Create a work membership plan from this section.",
  },
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
