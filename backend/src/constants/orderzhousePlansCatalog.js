/**
 * Canonical ORDERZHOUSE subscription plans (fixed ids 1, 2, 3).
 * Used for public catalog fallback and migration pinning.
 */

const ORDERZHOUSE_PLAN_IDS = [1, 2, 3];

const ORDERZHOUSE_PLANS_BY_ID = {
  1: {
    id: "1",
    name: "orderzhouse_free",
    title: "الاشتراك المجاني",
    description: "مدة الاشتراك: سنة كاملة بمنصة العمل الحر",
    durationDays: 365,
    priceJod: 0,
    stripeCheckoutAmountJod: null,
    requiresCompanyVisit: false,
    selfSubscribeAllowed: false,
    isActive: true,
    isVisible: true,
    sortOrder: 10,
    features: [
      "تدريب مجاني على كتابة المحتوى – المستوى الأول",
      "دون توقيع عقد",
      "دون زيارة مقر الشركة",
      "دون متابعة مباشرة",
    ],
    trainings: ["تدريب مجاني على كتابة المحتوى – المستوى الأول"],
    paymentNotes: null,
    installmentPlan: null,
    offerExpiresAt: null,
    offerLabel: null,
    orderValueMinJod: 3,
    orderValueMaxJod: 7,
    activationRequirements:
      "بعد الانتهاء من التدريبات والاختبارات، يتم إرسال النتائج عبر منصة STUDYZHOUSE، وعند ظهور النتيجة «ناجح» يتم تفعيل الحساب على المنصة.",
    refundPolicy: null,
    isPopular: false,
    isFeatured: false,
    selfCheckoutEligible: false,
  },
  2: {
    id: "2",
    name: "orderzhouse_50_jod",
    title: "اشتراك 50 دينار",
    description: "مدة الاشتراك: سنة كاملة بمنصة العمل الحر",
    durationDays: 365,
    priceJod: 50,
    stripeCheckoutAmountJod: null,
    requiresCompanyVisit: true,
    selfSubscribeAllowed: true,
    isActive: true,
    isVisible: true,
    sortOrder: 20,
    features: [
      "تدريب مجاني كتابة المحتوى – المستوى الأول",
      "تدريب مجاني كتابة المحتوى – المستوى الثاني",
      "تدريبات مجانية في التصميم",
      "توقيع العقد داخل مقر الشركة",
      "متابعة بعد إنهاء المستوى الأول والبدء بالمستوى الثاني",
    ],
    trainings: [
      "تدريب كتابة المحتوى – المستوى الأول",
      "تدريب كتابة المحتوى – المستوى الثاني",
      "تدريبات مجانية في التصميم",
    ],
    paymentNotes: "دفعة واحدة 50 دينار أردني عند الاشتراك.",
    installmentPlan: null,
    offerExpiresAt: "2026-09-30",
    offerLabel: "يتم استرداد قيمة الاشتراك عند استلام أول طلب (العرض ساري حتى 30-09-2026)",
    orderValueMinJod: 7,
    orderValueMaxJod: 20,
    activationRequirements:
      "يتم التفعيل بعد إتمام الدفع وتفعيل الشركة، ثم يبدأ العدّ عند أول طلب مقبول.",
    refundPolicy: "يتم استرداد قيمة الاشتراك عند استلام أول طلب (ضمن فترة العرض).",
    isPopular: true,
    isFeatured: false,
    selfCheckoutEligible: true,
  },
  3: {
    id: "3",
    name: "orderzhouse_platinum",
    title: "الاشتراك البلاتيني",
    description: "دبلوم التشغيل الرقمي بالعمل الحر — سنة كاملة على المنصة",
    durationDays: 365,
    priceJod: 900,
    stripeCheckoutAmountJod: 300,
    requiresCompanyVisit: true,
    selfSubscribeAllowed: true,
    isActive: true,
    isVisible: true,
    sortOrder: 30,
    features: [
      "دبلوم التشغيل الرقمي بالعمل الحر",
      "تدريب كتابة المحتوى – المستوى الأول والثاني",
      "تدريب الجرافيك ديزاين",
      "تدريب البرمجة باستخدام الذكاء الاصطناعي",
      "توقيع العقد داخل مقر الشركة",
    ],
    trainings: [
      "كتابة المحتوى – المستوى الأول والثاني",
      "الجرافيك ديزاين",
      "البرمجة باستخدام الذكاء الاصطناعي",
    ],
    paymentNotes:
      "300 دينار عند الاشتراك + 50 دينار شهرياً لمدة 12 شهر (إجمالي 600 دينار إضافية). المبلغ الإجمالي للبرنامج 900 دينار.",
    installmentPlan: {
      upfrontJod: 300,
      monthlyJod: 50,
      months: 12,
      notes: "الأقساط الشهرية بعد التسجيل — خارج دفع Stripe الأولي.",
    },
    offerExpiresAt: null,
    offerLabel: null,
    orderValueMinJod: 10,
    orderValueMaxJod: null,
    activationRequirements:
      "يتم التفعيل بعد دفع مبلغ التسجيل (300 د.أ) وتفعيل الشركة؛ الأقساط الشهرية تُتابع خارج المنصة حالياً.",
    refundPolicy:
      "أي مبالغ مالية مدفوعة لا تُسترد إلا بعد بدء العمل في الاشتراك الثاني (50 دينار).",
    isPopular: false,
    isFeatured: true,
    selfCheckoutEligible: true,
  },
};

function getOrderzhousePlansCatalog() {
  return ORDERZHOUSE_PLAN_IDS.map((id) => ({ ...ORDERZHOUSE_PLANS_BY_ID[id] }));
}

function mergeApiPlansWithCatalog(apiPlans) {
  const byId = new Map((apiPlans || []).map((p) => [String(p.id), p]));
  return ORDERZHOUSE_PLAN_IDS.map((id) => {
    const base = { ...ORDERZHOUSE_PLANS_BY_ID[id] };
    const api = byId.get(String(id));
    if (!api) return base;
    return {
      ...base,
      selfCheckoutEligible:
        api.selfCheckoutEligible != null ? Boolean(api.selfCheckoutEligible) : base.selfCheckoutEligible,
    };
  });
}

module.exports = {
  ORDERZHOUSE_PLAN_IDS,
  ORDERZHOUSE_PLANS_BY_ID,
  getOrderzhousePlansCatalog,
  mergeApiPlansWithCatalog,
};
