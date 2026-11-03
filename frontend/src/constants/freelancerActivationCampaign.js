import { ctFromEnFlag } from "./constantsI18n.js";

export function sharesSumToTotal(article, freelancer, company, reviewer) {
  const n = (v) => Math.round(Number(v) * 1000);
  if (![article, freelancer, company, reviewer].every((v) => Number.isFinite(Number(v)))) return false;
  return n(freelancer) + n(company) + n(reviewer) === n(article);
}

export const ACTIVATION_BUDGET_ERROR_CODES = Object.freeze({
  CAMPAIGN_INSUFFICIENT: "ACTIVATION_CAMPAIGN_BUDGET_INSUFFICIENT",
  WAVE_INSUFFICIENT: "ACTIVATION_WAVE_BUDGET_INSUFFICIENT",
});

/** Catalog: platformConstants.freelancerActivationCampaign.budgetErrors.<code>. */
const BUDGET_ERROR_CODES = new Set(Object.values(ACTIVATION_BUDGET_ERROR_CODES));

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function activationAssignmentErrorMessage(err, { isEn = false, locale } = {}) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  if (!BUDGET_ERROR_CODES.has(code)) return null;
  return ctFromEnFlag(`freelancerActivationCampaign.budgetErrors.${code}`, isEn, undefined, locale);
}

const BUDGET_STATES = new Set(["reserved", "used", "released", "not_reserved"]);

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function formatActivationBudgetState(state, { isEn = false, locale } = {}) {
  const key = String(state || "");
  if (!BUDGET_STATES.has(key)) return "";
  return ctFromEnFlag(`freelancerActivationCampaign.budgetStates.${key}`, isEn, undefined, locale);
}
