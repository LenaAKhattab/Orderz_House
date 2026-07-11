import { suggestPlanInternalName } from "./planNameAuto";
import { computeNextPlanSortOrder } from "./planOrderUtils";
import { isPlanFormLinkingValid } from "./planFormLinkingUtils";

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
    featuresEn: linesToArray(form.featuresTextEn),
    trainings: linesToArray(form.trainingsText),
    trainingsEn: linesToArray(form.trainingsTextEn),
    paymentNotes: form.paymentNotes.trim() || null,
    installmentPlan: buildInstallmentPlan(form),
    offerExpiresAt: form.offerExpiresAt.trim() || null,
    offerLabel: form.offerLabel.trim() || null,
    offerLabelEn: form.offerLabelEn.trim() || null,
    orderValueMinJod: optionalNum(form.orderValueMinJod),
    orderValueMaxJod: optionalNum(form.orderValueMaxJod),
    activationRequirements: form.activationRequirements.trim() || null,
    refundPolicy: form.refundPolicy.trim() || null,
    adminNotes: form.adminNotes.trim() || null,
    isPopular: Boolean(form.isPopular),
    isFeatured: Boolean(form.isFeatured),
    stripeCheckoutAmountJod: optionalNum(form.stripeCheckoutAmountJod),
    planPageId: optionalNum(form.planPageId),
    subscriptionPlanId: optionalNum(form.subscriptionPlanId),
    label: form.label.trim() || null,
    labelEn: form.labelEn.trim() || null,
    billingText: form.billingText.trim() || null,
    billingTextEn: form.billingTextEn.trim() || null,
    priceIntroText: form.priceIntroText.trim() || null,
    priceIntroTextEn: form.priceIntroTextEn.trim() || null,
    buttonText: form.buttonText.trim() || null,
    buttonTextEn: form.buttonTextEn.trim() || null,
    buttonUrl: form.buttonUrl.trim() || null,
    currency: form.currency?.trim() || "JOD",
    titleEn: form.titleEn.trim() || null,
    descriptionEn: form.descriptionEn.trim() || null,
  };
}

export function normalizeCreatePayload(form, existingNames = [], plansForOrder = [], options = {}) {
  const name = suggestPlanInternalName(form.title, existingNames);
  const sortOrder =
    plansForOrder.length > 0
      ? computeNextPlanSortOrder(plansForOrder)
      : Number(form.sortOrder) || 0;
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
    sortOrder,
    ...extendedFieldsFromForm(form),
    planPageId:
      options.planPageId != null
        ? Number(options.planPageId)
        : optionalNum(form.planPageId),
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

export function canSubmitCreate(form, options = {}) {
  return (
    form.title.trim().length >= 2 &&
    Number(form.durationDays) > 0 &&
    isPlanFormLinkingValid(form, options.planPagesById)
  );
}

export function canSubmitEdit(form, options = {}) {
  return (
    form.title.trim().length >= 2 &&
    Number(form.durationDays) > 0 &&
    isPlanFormLinkingValid(form, options.planPagesById)
  );
}
