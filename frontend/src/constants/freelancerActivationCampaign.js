export function sharesSumToTotal(article, freelancer, company, reviewer) {
  const n = (v) => Math.round(Number(v) * 1000);
  if (![article, freelancer, company, reviewer].every((v) => Number.isFinite(Number(v)))) return false;
  return n(freelancer) + n(company) + n(reviewer) === n(article);
}

export const ACTIVATION_BUDGET_ERROR_CODES = Object.freeze({
  CAMPAIGN_INSUFFICIENT: "ACTIVATION_CAMPAIGN_BUDGET_INSUFFICIENT",
  WAVE_INSUFFICIENT: "ACTIVATION_WAVE_BUDGET_INSUFFICIENT",
});

const BUDGET_ERROR_COPY = Object.freeze({
  ACTIVATION_CAMPAIGN_BUDGET_INSUFFICIENT: {
    ar: "ميزانية الحملة لا تكفي لإسناد هذه المقالة.",
    en: "Campaign budget is not enough to assign this article.",
  },
  ACTIVATION_WAVE_BUDGET_INSUFFICIENT: {
    ar: "ميزانية الموجة لا تكفي لإسناد هذه المقالة.",
    en: "Wave budget is not enough to assign this article.",
  },
});

export function activationAssignmentErrorMessage(err, { isEn = false } = {}) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  const copy = BUDGET_ERROR_COPY[code];
  if (!copy) return null;
  return isEn ? copy.en : copy.ar;
}

export function formatActivationBudgetState(state, { isEn = false } = {}) {
  const key = String(state || "");
  if (key === "reserved") return isEn ? "Reserved" : "محجوز";
  if (key === "used") return isEn ? "Used" : "مستخدم";
  if (key === "released") return isEn ? "Released" : "محرّر";
  if (key === "not_reserved") return isEn ? "Not reserved" : "غير محجوز";
  return "";
}

