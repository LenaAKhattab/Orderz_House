/**
 * Phase A4.3 — unique-trial fair distribution ranking vocabulary.
 * Ranking / recommendation only. Does not auto-assign.
 */

const ACTIVATION_FAIR_RANKING_VERSION = "activation_unique_trial_v1";

const ACTIVATION_FAIR_RANK_GROUPS = Object.freeze({
  FIRST_ACTIVATION: "first_activation",
  TRIAL_ACTIVATION: "trial_activation",
  PAID_MEMBERSHIP: "paid_membership",
  STANDARD: "standard",
});

const ACTIVATION_FAIR_REASON_TAGS = Object.freeze({
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

const ACTIVATION_FAIR_NOT_AVAILABLE = "not_available";

module.exports = {
  ACTIVATION_FAIR_RANKING_VERSION,
  ACTIVATION_FAIR_RANK_GROUPS,
  ACTIVATION_FAIR_REASON_TAGS,
  ACTIVATION_FAIR_NOT_AVAILABLE,
};
