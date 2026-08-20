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

const COPY = Object.freeze({
  FREELANCER_TRIAL_REQUIRED: {
    ar: "يلزم تفعيل تجربة العمل قبل التقديم على مقالات Mini Article.",
    en: "Activate the work trial before applying to Mini Articles.",
  },
  FREELANCER_TRIAL_EXPIRED: {
    ar: "انتهت تجربة العمل. للمتابعة، انتقل إلى Silver.",
    en: "Your work trial has ended. Continue with Silver.",
  },
  FREELANCER_TRIAL_DAILY_BID_LIMIT_REACHED: {
    ar: "وصلت للحد اليومي من عروض التجربة.",
    en: "You reached today's trial bid limit.",
  },
  FREELANCER_TRIAL_BID_LIMIT_REACHED: {
    ar: "وصلت للحد الأقصى من عروض التجربة.",
    en: "You reached the trial bid limit.",
  },
  FREELANCER_TRIAL_WORK_CAP_REACHED: {
    ar: "وصلت للحد الأقصى من المقالات المقبولة في التجربة.",
    en: "You reached the trial accepted-work cap.",
  },
  FREELANCER_TRIAL_MINI_ARTICLES_ONLY: {
    ar: "التجربة تسمح بالتقديم على مقالات Mini Article فقط.",
    en: "The trial allows Mini Article applications only.",
  },
  FREELANCER_TRIAL_BID_GRANT_FAILED: {
    ar: "تعذر منح عروض التجربة. لم تكتمل التجربة، حاول مرة أخرى.",
    en: "Could not grant trial Bids. The trial was not completed. Try again.",
  },
  ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED: {
    ar: "تم إيقاف الحملة مؤقتًا من الإدارة.",
    en: "This campaign is temporarily stopped by admin.",
  },
  ACTIVATION_CAMPAIGN_PAUSED: {
    ar: "تم إيقاف الحملة مؤقتًا من الإدارة.",
    en: "This campaign is temporarily paused by admin.",
  },
  ACTIVATION_WAVE_PAUSED: {
    ar: "تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.",
    en: "Applications for this opportunity are temporarily paused.",
  },
  ACTIVATION_CAMPAIGN_NOT_ACTIVE: {
    ar: "تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.",
    en: "Applications for this opportunity are temporarily paused.",
  },
  ACTIVATION_WAVE_NOT_ACTIVE: {
    ar: "تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.",
    en: "Applications for this opportunity are temporarily paused.",
  },
});

export function isFreelancerTrialApplyErrorCode(code) {
  return FREELANCER_TRIAL_APPLY_ERROR_CODES.includes(String(code || ""));
}

export function freelancerTrialApplyErrorMessage(err, { isEn = false } = {}) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  const copy = COPY[code];
  if (!copy) return null;
  if (!isEn) return copy.ar;
  return copy.en;
}

export function freelancerTrialActivateErrorMessage(err, { isEn = false } = {}) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  if (code !== "FREELANCER_TRIAL_BID_GRANT_FAILED") return null;
  return freelancerTrialApplyErrorMessage(err, { isEn });
}
