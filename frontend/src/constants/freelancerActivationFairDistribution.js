export const ACTIVATION_FAIR_REASON_TAGS = Object.freeze({
  PREFERRED_ACTIVATION_CANDIDATE: "preferred_activation_candidate",
  FIRST_WORK_OPPORTUNITY: "first_work_opportunity",
  NO_PREVIOUS_ACCEPTED_WORK: "no_previous_accepted_work",
  NO_PREVIOUS_WIN: "no_previous_win",
  LOW_WORKLOAD: "low_workload",
  WAITING: "waiting",
  PAID_MEMBERSHIP: "paid_membership",
  TRAINING_NOT_AVAILABLE: "training_not_available",
  CATEGORY_MATCH_NOT_AVAILABLE: "category_match_not_available",
});

const DISPLAY_TAGS = Object.freeze([
  ACTIVATION_FAIR_REASON_TAGS.PREFERRED_ACTIVATION_CANDIDATE,
  ACTIVATION_FAIR_REASON_TAGS.FIRST_WORK_OPPORTUNITY,
  ACTIVATION_FAIR_REASON_TAGS.NO_PREVIOUS_ACCEPTED_WORK,
  ACTIVATION_FAIR_REASON_TAGS.LOW_WORKLOAD,
  ACTIVATION_FAIR_REASON_TAGS.WAITING,
]);

export function isActivationFairRankingApplied(fairRanking) {
  return Boolean(fairRanking?.activationFairRankingApplied);
}

export function findFairRankingCandidate(applicationId, fairRanking) {
  if (applicationId == null || !fairRanking?.candidates) return null;
  return fairRanking.candidates.find(
    (c) => String(c.applicationId) === String(applicationId),
  ) || null;
}

export function activationFairReasonLabel(tag, { isEn = false, waitingDays = 0 } = {}) {
  const key = String(tag || "");
  if (key === ACTIVATION_FAIR_REASON_TAGS.PREFERRED_ACTIVATION_CANDIDATE) {
    return isEn ? "Preferred activation candidate" : "مرشح مفضل للتفعيل";
  }
  if (key === ACTIVATION_FAIR_REASON_TAGS.FIRST_WORK_OPPORTUNITY) {
    return isEn ? "First work opportunity" : "أول فرصة عمل";
  }
  if (key === ACTIVATION_FAIR_REASON_TAGS.NO_PREVIOUS_ACCEPTED_WORK) {
    return isEn ? "No previously accepted work" : "لم يحصل على عمل مقبول سابقًا";
  }
  if (key === ACTIVATION_FAIR_REASON_TAGS.NO_PREVIOUS_WIN) {
    return isEn ? "No previous win" : "لم يحصل على فوز سابق";
  }
  if (key === ACTIVATION_FAIR_REASON_TAGS.LOW_WORKLOAD) {
    return isEn ? "Low workload" : "عبء عمل منخفض";
  }
  if (key === ACTIVATION_FAIR_REASON_TAGS.WAITING) {
    const days = Math.max(0, Number(waitingDays) || 0);
    return isEn ? `Waiting ${days} days` : `ينتظر منذ ${days} أيام`;
  }
  if (key === ACTIVATION_FAIR_REASON_TAGS.PAID_MEMBERSHIP) {
    return isEn ? "Paid membership" : "عضوية مدفوعة";
  }
  return "";
}

export function activationFairBadges(activationFairness, { isEn = false } = {}) {
  if (!activationFairness) return [];
  const waitingDays = activationFairness?.metrics?.waitingDays;
  const tags = Array.isArray(activationFairness.reasonTags)
    ? activationFairness.reasonTags
    : [];
  return DISPLAY_TAGS.filter((tag) => tags.includes(tag))
    .map((tag) => ({
      tag,
      label: activationFairReasonLabel(tag, { isEn, waitingDays }),
    }))
    .filter((item) => item.label);
}
