/** Default super-admin create form (internal `name` is auto-generated). */
export function getInitialPlanFormState() {
  return {
    title: "",
    description: "",
    durationDays: "30",
    priceJod: "",
    requiresCompanyVisit: false,
    selfSubscribeAllowed: false,
    isActive: true,
    isVisible: true,
    sortOrder: "0",
  };
}

export function planToEditForm(plan) {
  return {
    title: plan.title ?? "",
    description: plan.description ?? "",
    durationDays: String(plan.durationDays ?? 30),
    priceJod: plan.priceJod == null ? "" : String(plan.priceJod),
    requiresCompanyVisit: Boolean(plan.requiresCompanyVisit),
    selfSubscribeAllowed: Boolean(plan.selfSubscribeAllowed),
    isActive: Boolean(plan.isActive),
    isVisible: Boolean(plan.isVisible),
    sortOrder: String(plan.sortOrder ?? 0),
  };
}
