/**
 * Canonical ORDERZHOUSE subscription plans — fixed ids 1, 2, 3.
 */

export const ORDERZHOUSE_PLAN_IDS = [1, 2, 3];

/** Canonical free tier — auto-assigned to new freelancers. */
export const ORDERZHOUSE_FREE_PLAN_ID = 1;
export const ORDERZHOUSE_FREE_PLAN_NAME = "orderzhouse_free";

export function isOrderzhouseFreePlan(planOrId) {
  if (planOrId == null) return false;
  if (typeof planOrId === "object") {
    const id = Number(planOrId.id ?? planOrId.planId);
    const name = String(planOrId.name ?? planOrId.plan?.name ?? "").trim();
    if (Number.isInteger(id) && id === ORDERZHOUSE_FREE_PLAN_ID) return true;
    return name === ORDERZHOUSE_FREE_PLAN_NAME;
  }
  const n = Number(planOrId);
  if (Number.isInteger(n) && n === ORDERZHOUSE_FREE_PLAN_ID) return true;
  return String(planOrId).trim() === ORDERZHOUSE_FREE_PLAN_NAME;
}

export const ORDERZHOUSE_PLANS_BY_ID = {
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
    /** Order value band for pool (real + training/fake). */
    minOrderValue: 3,
    maxOrderValue: 7,
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
    minOrderValue: 7,
    maxOrderValue: 20,
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
    minOrderValue: 10,
    maxOrderValue: null,
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

export function getOrderzhousePlansCatalog() {
  return ORDERZHOUSE_PLAN_IDS.map((id) => ({ ...ORDERZHOUSE_PLANS_BY_ID[id] }));
}

/** Overlay API checkout flags when legacy default set (ids 1–3); otherwise return API plans as-is. */
export function mergeApiPlansWithCatalog(apiPlans) {
  const list = apiPlans || [];
  if (!list.length) {
    return getOrderzhousePlansCatalog();
  }
  const ids = new Set(list.map((p) => String(p.id)));
  const isLegacyDefaultSet =
    list.length === ORDERZHOUSE_PLAN_IDS.length &&
    ORDERZHOUSE_PLAN_IDS.every((id) => ids.has(String(id)));
  if (!isLegacyDefaultSet) {
    return list;
  }
  const byId = new Map(list.map((p) => [String(p.id), p]));
  return ORDERZHOUSE_PLAN_IDS.map((id) => {
    const base = { ...ORDERZHOUSE_PLANS_BY_ID[id] };
    const api = byId.get(String(id));
    if (!api) return base;
    return {
      ...base,
      ...api,
      selfCheckoutEligible:
        api.selfCheckoutEligible != null ? Boolean(api.selfCheckoutEligible) : base.selfCheckoutEligible,
    };
  });
}
