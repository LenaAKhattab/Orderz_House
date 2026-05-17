/** Default super-admin create form (internal `name` is auto-generated). */
export function getInitialPlanFormState() {
  return {
    title: "",
    description: "",
    durationDays: "365",
    priceJod: "",
    stripeCheckoutAmountJod: "",
    requiresCompanyVisit: false,
    selfSubscribeAllowed: false,
    isActive: true,
    isVisible: true,
    sortOrder: "0",
    featuresText: "",
    trainingsText: "",
    paymentNotes: "",
    installmentUpfrontJod: "",
    installmentMonthlyJod: "",
    installmentMonths: "",
    installmentNotes: "",
    offerExpiresAt: "",
    offerLabel: "",
    orderValueMinJod: "",
    orderValueMaxJod: "",
    activationRequirements: "",
    refundPolicy: "",
    adminNotes: "",
    isPopular: false,
    isFeatured: false,
  };
}

function linesFromArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr.map(String).join("\n");
}

function dateInputFromIso(iso) {
  if (!iso) return "";
  const d = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

export function planToEditForm(plan) {
  const inst = plan?.installmentPlan && typeof plan.installmentPlan === "object" ? plan.installmentPlan : null;
  return {
    title: plan.title ?? "",
    description: plan.description ?? "",
    durationDays: String(plan.durationDays ?? 365),
    priceJod: plan.priceJod == null ? "" : String(plan.priceJod),
    stripeCheckoutAmountJod:
      plan.stripeCheckoutAmountJod == null ? "" : String(plan.stripeCheckoutAmountJod),
    requiresCompanyVisit: Boolean(plan.requiresCompanyVisit),
    selfSubscribeAllowed: Boolean(plan.selfSubscribeAllowed),
    isActive: Boolean(plan.isActive),
    isVisible: Boolean(plan.isVisible),
    sortOrder: String(plan.sortOrder ?? 0),
    featuresText: linesFromArray(plan.features),
    trainingsText: linesFromArray(plan.trainings),
    paymentNotes: plan.paymentNotes ?? "",
    installmentUpfrontJod: inst?.upfrontJod != null ? String(inst.upfrontJod) : "",
    installmentMonthlyJod: inst?.monthlyJod != null ? String(inst.monthlyJod) : "",
    installmentMonths: inst?.months != null ? String(inst.months) : "",
    installmentNotes: inst?.notes ?? "",
    offerExpiresAt: dateInputFromIso(plan.offerExpiresAt),
    offerLabel: plan.offerLabel ?? "",
    orderValueMinJod: plan.orderValueMinJod == null ? "" : String(plan.orderValueMinJod),
    orderValueMaxJod: plan.orderValueMaxJod == null ? "" : String(plan.orderValueMaxJod),
    activationRequirements: plan.activationRequirements ?? "",
    refundPolicy: plan.refundPolicy ?? "",
    adminNotes: plan.adminNotes ?? "",
    isPopular: Boolean(plan.isPopular),
    isFeatured: Boolean(plan.isFeatured),
  };
}
