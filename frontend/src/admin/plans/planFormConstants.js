/** Default super-admin create form (internal `name` is auto-generated). */
export function getInitialPlanFormState() {
  return {
    title: "",
    titleEn: "",
    description: "",
    descriptionEn: "",
    durationDays: "365",
    priceJod: "",
    stripeCheckoutAmountJod: "",
    requiresCompanyVisit: false,
    selfSubscribeAllowed: false,
    isActive: true,
    isVisible: true,
    sortOrder: "0",
    featuresText: "",
    featuresTextEn: "",
    trainingsText: "",
    trainingsTextEn: "",
    paymentNotes: "",
    installmentUpfrontJod: "",
    installmentMonthlyJod: "",
    installmentMonths: "",
    installmentNotes: "",
    offerExpiresAt: "",
    offerLabel: "",
    offerLabelEn: "",
    orderValueMinJod: "",
    orderValueMaxJod: "",
    activationRequirements: "",
    refundPolicy: "",
    adminNotes: "",
    isPopular: false,
    isFeatured: false,
    planPageId: "",
    subscriptionPlanId: "",
    label: "",
    labelEn: "",
    billingText: "",
    billingTextEn: "",
    priceIntroText: "",
    priceIntroTextEn: "",
    buttonText: "",
    buttonTextEn: "",
    buttonUrl: "",
    currency: "JOD",
    saleEnabled: false,
    salePercentage: "",
    saleReason: "",
    saleReasonEn: "",
  };
}

function linesFromArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr.map(String).join("\n");
}

function sortedIncludedFeatures(plan) {
  if (!Array.isArray(plan?.planFeatures) || plan.planFeatures.length === 0) return null;
  return [...plan.planFeatures]
    .filter((f) => f?.isIncluded !== false)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
}

function featuresTextFromPlan(plan) {
  const rows = sortedIncludedFeatures(plan);
  if (rows) return rows.map((f) => String(f.featureText || "")).join("\n");
  return linesFromArray(plan.features);
}

function featuresTextEnFromPlan(plan) {
  const rows = sortedIncludedFeatures(plan);
  if (rows) return rows.map((f) => String(f.featureTextEn || "")).join("\n");
  return "";
}

function dateInputFromIso(iso) {
  if (!iso) return "";
  const d = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

export function planToEditForm(plan) {
  const inst = plan?.installmentPlan && typeof plan.installmentPlan === "object" ? plan.installmentPlan : null;
  return {
    internalName: plan.name ?? "",
    title: plan.title ?? "",
    titleEn: plan.titleEn ?? "",
    description: plan.description ?? "",
    descriptionEn: plan.descriptionEn ?? "",
    durationDays: String(plan.durationDays ?? 365),
    priceJod: plan.priceJod == null ? "" : String(plan.priceJod),
    stripeCheckoutAmountJod:
      plan.stripeCheckoutAmountJod == null ? "" : String(plan.stripeCheckoutAmountJod),
    requiresCompanyVisit: Boolean(plan.requiresCompanyVisit),
    selfSubscribeAllowed: Boolean(plan.selfSubscribeAllowed),
    isActive: Boolean(plan.isActive),
    isVisible: Boolean(plan.isVisible),
    sortOrder: String(plan.sortOrder ?? 0),
    featuresText: featuresTextFromPlan(plan),
    featuresTextEn: featuresTextEnFromPlan(plan),
    trainingsText: linesFromArray(plan.trainings),
    trainingsTextEn: linesFromArray(plan.trainingsEn),
    paymentNotes: plan.paymentNotes ?? "",
    installmentUpfrontJod: inst?.upfrontJod != null ? String(inst.upfrontJod) : "",
    installmentMonthlyJod: inst?.monthlyJod != null ? String(inst.monthlyJod) : "",
    installmentMonths: inst?.months != null ? String(inst.months) : "",
    installmentNotes: inst?.notes ?? "",
    offerExpiresAt: dateInputFromIso(plan.offerExpiresAt),
    offerLabel: plan.offerLabel ?? "",
    offerLabelEn: plan.offerLabelEn ?? "",
    orderValueMinJod: plan.orderValueMinJod == null ? "" : String(plan.orderValueMinJod),
    orderValueMaxJod: plan.orderValueMaxJod == null ? "" : String(plan.orderValueMaxJod),
    activationRequirements: plan.activationRequirements ?? "",
    refundPolicy: plan.refundPolicy ?? "",
    adminNotes: plan.adminNotes ?? "",
    isPopular: Boolean(plan.isPopular),
    isFeatured: Boolean(plan.isFeatured),
    planPageId: plan.planPageId != null ? String(plan.planPageId) : "",
    subscriptionPlanId: plan.subscriptionPlanId != null ? String(plan.subscriptionPlanId) : "",
    label: plan.label ?? "",
    labelEn: plan.labelEn ?? "",
    billingText: plan.billingText ?? "",
    billingTextEn: plan.billingTextEn ?? "",
    priceIntroText: plan.priceIntroText ?? "",
    priceIntroTextEn: plan.priceIntroTextEn ?? "",
    buttonText: plan.buttonText ?? "",
    buttonTextEn: plan.buttonTextEn ?? "",
    buttonUrl: plan.buttonUrl ?? "",
    currency: plan.currency ?? "JOD",
    saleEnabled: Boolean(plan.saleEnabled),
    salePercentage: plan.salePercentage == null ? "" : String(plan.salePercentage),
    saleReason: plan.saleReason ?? "",
    saleReasonEn: plan.saleReasonEn ?? "",
  };
}
