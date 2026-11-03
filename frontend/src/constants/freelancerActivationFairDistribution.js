import { ctFromEnFlag } from "./constantsI18n.js";

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

/** Tags with a display label (catalog: platformConstants.freelancerActivationFairDistribution.reasons.<tag>). */
const LABELLED_TAGS = new Set([
  ACTIVATION_FAIR_REASON_TAGS.PREFERRED_ACTIVATION_CANDIDATE,
  ACTIVATION_FAIR_REASON_TAGS.FIRST_WORK_OPPORTUNITY,
  ACTIVATION_FAIR_REASON_TAGS.NO_PREVIOUS_ACCEPTED_WORK,
  ACTIVATION_FAIR_REASON_TAGS.NO_PREVIOUS_WIN,
  ACTIVATION_FAIR_REASON_TAGS.LOW_WORKLOAD,
  ACTIVATION_FAIR_REASON_TAGS.WAITING,
  ACTIVATION_FAIR_REASON_TAGS.PAID_MEMBERSHIP,
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

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function activationFairReasonLabel(tag, { isEn = false, waitingDays = 0, locale } = {}) {
  const key = String(tag || "");
  if (!LABELLED_TAGS.has(key)) return "";
  const values =
    key === ACTIVATION_FAIR_REASON_TAGS.WAITING ? { days: Math.max(0, Number(waitingDays) || 0) } : undefined;
  return ctFromEnFlag(`freelancerActivationFairDistribution.reasons.${key}`, isEn, values, locale);
}

/** `locale` (optional) wins over the legacy `isEn` flag. */
export function activationFairBadges(activationFairness, { isEn = false, locale } = {}) {
  if (!activationFairness) return [];
  const waitingDays = activationFairness?.metrics?.waitingDays;
  const tags = Array.isArray(activationFairness.reasonTags)
    ? activationFairness.reasonTags
    : [];
  return DISPLAY_TAGS.filter((tag) => tags.includes(tag))
    .map((tag) => ({
      tag,
      label: activationFairReasonLabel(tag, { isEn, waitingDays, locale }),
    }))
    .filter((item) => item.label);
}
