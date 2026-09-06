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

function optionalText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function extendedFieldsFromForm(form) {
  return {
    features: linesToArray(form.featuresText),
    featuresEn: linesToArray(form.featuresTextEn),
    trainings: linesToArray(form.trainingsText),
    trainingsEn: linesToArray(form.trainingsTextEn),
    paymentNotes: optionalText(form.paymentNotes),
    installmentPlan: buildInstallmentPlan(form),
    offerExpiresAt: optionalText(form.offerExpiresAt),
    offerLabel: optionalText(form.offerLabel),
    offerLabelEn: optionalText(form.offerLabelEn),
    orderValueMinJod: optionalNum(form.orderValueMinJod),
    orderValueMaxJod: optionalNum(form.orderValueMaxJod),
    activationRequirements: optionalText(form.activationRequirements),
    refundPolicy: optionalText(form.refundPolicy),
    adminNotes: optionalText(form.adminNotes),
    isPopular: Boolean(form.isPopular),
    isFeatured: Boolean(form.isFeatured),
    stripeCheckoutAmountJod: optionalNum(form.stripeCheckoutAmountJod),
    planPageId: optionalNum(form.planPageId),
    subscriptionPlanId: optionalNum(form.subscriptionPlanId),
    label: optionalText(form.label),
    labelEn: optionalText(form.labelEn),
    billingText: optionalText(form.billingText),
    billingTextEn: optionalText(form.billingTextEn),
    priceIntroText: optionalText(form.priceIntroText),
    priceIntroTextEn: optionalText(form.priceIntroTextEn),
    buttonText: optionalText(form.buttonText),
    buttonTextEn: optionalText(form.buttonTextEn),
    buttonUrl: optionalText(form.buttonUrl),
    currency: String(form.currency || "JOD").trim() || "JOD",
    titleEn: optionalText(form.titleEn),
    descriptionEn: optionalText(form.descriptionEn),
    saleEnabled: Boolean(form.saleEnabled),
    salePercentage: optionalNum(form.salePercentage),
    saleReason: optionalText(form.saleReason),
    saleReasonEn: optionalText(form.saleReasonEn),
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
    title: String(form.title || "").trim(),
    description: optionalText(form.description),
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
    title: String(form.title || "").trim(),
    description: optionalText(form.description),
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
  if (
    !(
      form.title.trim().length >= 2 &&
      Number(form.durationDays) > 0 &&
      isPlanFormLinkingValid(form, options.planPagesById)
    )
  ) {
    return false;
  }
  if (!form.saleEnabled) return true;
  const pct = Number(form.salePercentage);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return false;
  if (!String(form.saleReason || "").trim()) return false;
  const base =
    form.stripeCheckoutAmountJod !== "" && Number(form.stripeCheckoutAmountJod) > 0
      ? Number(form.stripeCheckoutAmountJod)
      : form.priceJod === ""
        ? 0
        : Number(form.priceJod);
  if (!Number.isFinite(base) || base <= 0) return false;
  return true;
}
