import { suggestPlanInternalName } from "./planNameAuto";

function linesToArray(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function optionalNum(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildInstallmentPlan(form) {
  const upfrontJod = optionalNum(form.installmentUpfrontJod);
  const monthlyJod = optionalNum(form.installmentMonthlyJod);
  const monthsRaw = form.installmentMonths === "" ? null : Number(form.installmentMonths);
  const months = Number.isInteger(monthsRaw) && monthsRaw > 0 ? monthsRaw : null;
  const notes = String(form.installmentNotes || "").trim();

  if (upfrontJod == null && monthlyJod == null && months == null && !notes) return null;

  const out = {};
  if (upfrontJod != null) out.upfrontJod = upfrontJod;
  if (monthlyJod != null) out.monthlyJod = monthlyJod;
  if (months != null) out.months = months;
  if (notes) out.notes = notes;
  return Object.keys(out).length > 0 ? out : null;
}

function extendedFieldsFromForm(form) {
  return {
    features: linesToArray(form.featuresText),
    trainings: linesToArray(form.trainingsText),
    paymentNotes: form.paymentNotes.trim() || null,
    installmentPlan: buildInstallmentPlan(form),
    offerExpiresAt: form.offerExpiresAt.trim() || null,
    offerLabel: form.offerLabel.trim() || null,
    orderValueMinJod: optionalNum(form.orderValueMinJod),
    orderValueMaxJod: optionalNum(form.orderValueMaxJod),
    activationRequirements: form.activationRequirements.trim() || null,
    refundPolicy: form.refundPolicy.trim() || null,
    adminNotes: form.adminNotes.trim() || null,
    isPopular: Boolean(form.isPopular),
    isFeatured: Boolean(form.isFeatured),
    stripeCheckoutAmountJod: optionalNum(form.stripeCheckoutAmountJod),
  };
}

export function normalizeCreatePayload(form, existingNames = []) {
  const name = suggestPlanInternalName(form.title, existingNames);
  return {
    name,
    title: form.title.trim(),
    description: form.description.trim() || null,
    durationDays: Number(form.durationDays),
    priceJod: form.priceJod === "" ? null : Number(form.priceJod),
    requiresCompanyVisit: Boolean(form.requiresCompanyVisit),
    selfSubscribeAllowed: Boolean(form.selfSubscribeAllowed),
    isActive: Boolean(form.isActive),
    isVisible: Boolean(form.isVisible),
    sortOrder: Number(form.sortOrder),
    ...extendedFieldsFromForm(form),
  };
}

/** PATCH body for edit (all fields backend supports except name). */
export function normalizeEditPayload(form) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    durationDays: Number(form.durationDays),
    priceJod: form.priceJod === "" ? null : Number(form.priceJod),
    requiresCompanyVisit: Boolean(form.requiresCompanyVisit),
    selfSubscribeAllowed: Boolean(form.selfSubscribeAllowed),
    isActive: Boolean(form.isActive),
    isVisible: Boolean(form.isVisible),
    sortOrder: Number(form.sortOrder),
    ...extendedFieldsFromForm(form),
  };
}

export function canSubmitCreate(form) {
  return form.title.trim().length >= 2 && Number(form.durationDays) > 0;
}

export function canSubmitEdit(form) {
  return form.title.trim().length >= 2 && Number(form.durationDays) > 0;
}
