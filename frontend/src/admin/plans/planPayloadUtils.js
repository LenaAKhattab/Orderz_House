import { suggestPlanInternalName } from "./planNameAuto";

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
  };
}

export function canSubmitCreate(form) {
  return form.title.trim().length >= 2 && Number(form.durationDays) > 0;
}

export function canSubmitEdit(form) {
  return form.title.trim().length >= 2 && Number(form.durationDays) > 0;
}
