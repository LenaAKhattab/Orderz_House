import { ctFromEnFlag } from "./constantsI18n.js";

/** Codes with a message in the catalog: platformConstants.freelancerActivationTrial.applyErrors.<code>. */
export const FREELANCER_TRIAL_APPLY_ERROR_CODES = Object.freeze([
  "FREELANCER_TRIAL_REQUIRED",
  "FREELANCER_TRIAL_EXPIRED",
  "FREELANCER_TRIAL_DAILY_BID_LIMIT_REACHED",
  "FREELANCER_TRIAL_BID_LIMIT_REACHED",
  "FREELANCER_TRIAL_WORK_CAP_REACHED",
  "FREELANCER_TRIAL_MINI_ARTICLES_ONLY",
  "FREELANCER_TRIAL_BID_GRANT_FAILED",
  "ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED",
  "ACTIVATION_CAMPAIGN_PAUSED",
  "ACTIVATION_WAVE_PAUSED",
  "ACTIVATION_CAMPAIGN_NOT_ACTIVE",
  "ACTIVATION_WAVE_NOT_ACTIVE",
]);

export function isFreelancerTrialApplyErrorCode(code) {
  return FREELANCER_TRIAL_APPLY_ERROR_CODES.includes(String(code || ""));
}

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function freelancerTrialApplyErrorMessage(err, { isEn = false, locale } = {}) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  if (!isFreelancerTrialApplyErrorCode(code)) return null;
  return ctFromEnFlag(`freelancerActivationTrial.applyErrors.${code}`, isEn, undefined, locale);
}

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function freelancerTrialActivateErrorMessage(err, { isEn = false, locale } = {}) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  if (code !== "FREELANCER_TRIAL_BID_GRANT_FAILED") return null;
  return freelancerTrialApplyErrorMessage(err, { isEn, locale });
}
