/**
 * Marketplace Economy / Priority Bid / Fair Distribution constants.
 * Configuration vocabulary only — no auction or wallet execution.
 */

const ASSIGNMENT_STRATEGIES = Object.freeze([
  "HIGHEST_TOKEN_ONLY",
  "FAIR_DISTRIBUTION_FIRST",
  "HYBRID",
]);

const ASSIGNMENT_STRATEGY_SET = new Set(ASSIGNMENT_STRATEGIES);

/** Default for Priority Bid auctions — preserves highest eligible Token Bid wins. */
const DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY = "HIGHEST_TOKEN_ONLY";

const AWARD_RESET_POLICIES = Object.freeze(["RESET_TO_ZERO", "DECREMENT_ONE", "NO_RESET"]);
const ELIGIBLE_LOSS_EFFECTS = Object.freeze(["INCREASE_PRIORITY", "NO_EFFECT"]);
const DECLINE_PRIORITY_EFFECTS = Object.freeze(["NO_BOOST", "DECREASE_PRIORITY"]);
const CANCEL_PRIORITY_EFFECTS = Object.freeze(["NO_BOOST", "DECREASE_PRIORITY"]);

/**
 * Per-plan Priority Bid monthly uses (by tier_code).
 * Never key off display names.
 */
const PRIORITY_BID_USES_BY_TIER = Object.freeze({
  pay_as_you_work: 1,
  active: 2,
  pro: 3,
  elite: 4,
});

/**
 * Work Token ledger event types (Phase 4+).
 * Canonical list lives in marketplaceWorkTokens.js — re-exported here for economy vocab.
 * Do not invent temporary users.tokens shortcuts.
 */
const {
  WORK_TOKEN_LEDGER_EVENT_TYPES,
} = require("./marketplaceWorkTokens");

/**
 * Future fairness outcome codes (immutable history).
 * APPLIED_AND_LOST ≠ ASSIGNMENT_OFFERED_AND_DECLINED ≠ FREELANCER_CANCELLED_AFTER_AWARD
 */
const FAIRNESS_OUTCOME_CODES = Object.freeze([
  "APPLIED_AND_LOST",
  "ASSIGNMENT_OFFERED_AND_DECLINED",
  "FREELANCER_CANCELLED_AFTER_AWARD",
  "AWARDED",
  "INELIGIBLE_SKIPPED",
  "ORDER_CANCELLED_BEFORE_RESOLUTION",
  "NO_ELIGIBLE_WINNER",
]);

/**
 * Internal fields that must NEVER be serialized to Freelancer-facing APIs.
 */
const FREELANCER_FORBIDDEN_FAIRNESS_FIELDS = Object.freeze([
  "fairnessScore",
  "distributionPriority",
  "queuePosition",
  "eligibleAttemptsWithoutAward",
  "rankingReason",
  "assignmentWeights",
  "internalCandidateRank",
]);

function isValidAssignmentStrategy(value) {
  return ASSIGNMENT_STRATEGY_SET.has(String(value || "").trim());
}

function defaultPriorityBidUsesForTier(tierCode) {
  const code = String(tierCode || "").trim();
  return Object.prototype.hasOwnProperty.call(PRIORITY_BID_USES_BY_TIER, code)
    ? PRIORITY_BID_USES_BY_TIER[code]
    : 0;
}

module.exports = {
  ASSIGNMENT_STRATEGIES,
  ASSIGNMENT_STRATEGY_SET,
  DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,
  AWARD_RESET_POLICIES,
  ELIGIBLE_LOSS_EFFECTS,
  DECLINE_PRIORITY_EFFECTS,
  CANCEL_PRIORITY_EFFECTS,
  PRIORITY_BID_USES_BY_TIER,
  WORK_TOKEN_LEDGER_EVENT_TYPES,
  FAIRNESS_OUTCOME_CODES,
  FREELANCER_FORBIDDEN_FAIRNESS_FIELDS,
  isValidAssignmentStrategy,
  defaultPriorityBidUsesForTier,
};
