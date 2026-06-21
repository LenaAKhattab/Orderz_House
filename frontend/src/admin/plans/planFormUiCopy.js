/** UI copy for plan create/edit modal (no API / payload keys). */

export const PLAN_FORM_SECTIONS = [
  { id: "basic", labelAr: "المعلومات الأساسية", labelEn: "Basic information" },
  { id: "pricing", labelAr: "التسعير والدفع", labelEn: "Pricing & payment" },
  { id: "limits", labelAr: "الحدود والتفعيل", labelEn: "Limits & activation" },
  { id: "availability", labelAr: "التوفر والنشر", labelEn: "Availability" },
  { id: "marketing", labelAr: "المزايا والتسويق", labelEn: "Benefits & marketing" },
];

export function getPlanFormCopy(isEn) {
  return {
    stripeAmountHelper: isEn
      ? "If left empty, the total price will be used for Stripe checkout."
      : "إذا تُرك هذا الحقل فارغاً، سيتم استخدام السعر الإجمالي عند الدفع عبر Stripe.",
    activationHelper: isEn
      ? "This is display text for the user, not a technical activation switch."
      : "هذا نص توضيحي يظهر للمستخدم، وليس إعداداً تقنياً للتفعيل.",
    warningSelfPurchase: isEn
      ? "Self-purchase is enabled but no payable amount is set (total price and Stripe amount are zero or empty). Checkout will not work until a price greater than zero is set."
      : "الشراء الذاتي مفعّل لكن لا يوجد مبلغ دفع (السعر الإجمالي ومبلغ Stripe فارغان أو صفر). لن يعمل الدفع حتى تعيين سعر أكبر من صفر.",
    warningOrderRange: isEn
      ? "Minimum order value is greater than maximum order value."
      : "حد أدنى قيمة الطلب أكبر من الحد الأقصى.",
    installmentsHint: isEn
      ? "Display-only installment breakdown for marketing — not connected to Stripe."
      : "عرض تسويقي للأقساط فقط — غير مرتبط بـ Stripe.",
  };
}
