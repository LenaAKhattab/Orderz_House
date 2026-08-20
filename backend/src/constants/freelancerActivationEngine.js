/**
 * Freelancer Activation Engine — Phase A1 vocabulary.
 * Configuration + trial state only. No Bid, Stripe, or apply execution.
 */

const FREELANCER_ACTIVATION_TRIAL_STATUSES = Object.freeze([
  "not_started",
  "eligible",
  "trial_active",
  "trial_expired_high_intent",
  "dormant",
  "final_reactivation_window",
  "archived",
  "paid_active",
]);

const FREELANCER_ACTIVATION_TERMINAL_STATUSES = Object.freeze([
  "trial_expired_high_intent",
  "dormant",
  "final_reactivation_window",
  "archived",
  "paid_active",
]);

const FREELANCER_ACTIVATION_PAID_TIER_CODES = Object.freeze(["silver", "pro", "elite"]);

const FREELANCER_ACTIVATION_EVENT_TYPES = Object.freeze({
  TRIAL_ACTIVATED: "trial_activated",
  TRIAL_ACTIVATION_IDEMPOTENT: "trial_activation_idempotent",
  TRIAL_ACTIVATION_BLOCKED: "trial_activation_blocked",
  TRIAL_EXPIRED: "trial_expired",
  TRIAL_BID_GRANTED: "trial_bid_granted",
  SILVER_CTA_SHOWN: "silver_cta_shown",
  SILVER_CHECKOUT_VIEWED: "silver_checkout_viewed",
  SILVER_PAYMENT_STARTED: "silver_payment_started",
  SILVER_PAID_DETECTED: "silver_paid_detected",
  SILVER_CONVERSION_BLOCKED: "silver_conversion_blocked",
  SILVER_CONVERSION_ERROR: "silver_conversion_error",
  WORK_INVENTORY_RESERVE_ALLOCATED: "work_inventory_reserve_allocated",
  WORK_INVENTORY_RESERVE_SKIPPED: "work_inventory_reserve_skipped",
});

/** Trial statuses that may transition to paid_active when marketplace paid membership is confirmed. */
const FREELANCER_ACTIVATION_PAID_SYNC_FROM_STATUSES = Object.freeze([
  "trial_active",
  "trial_expired_high_intent",
  "dormant",
  "final_reactivation_window",
]);

const FREELANCER_ACTIVATION_CONVERSION_REASONS = Object.freeze({
  TRIAL_EXPIRED: "trial_expired",
  LAST_3_DAYS: "last_3_days",
  WORK_CAP_REACHED: "work_cap_reached",
  FIRST_ACCEPTED: "first_accepted",
  FIRST_PUBLISHED: "first_published",
  EARNED_BALANCE: "earned_balance",
  NO_TRIAL_BIDS_REMAINING: "no_trial_bids_remaining",
  NONE: "none",
});

const FREELANCER_ACTIVATION_TRIAL_BID_SOURCE = "freelancer_activation_trial";
const FREELANCER_ACTIVATION_TRIAL_BID_LEDGER_EVENT = "FREELANCER_ACTIVATION_TRIAL_GRANT";

const FREELANCER_ACTIVATION_NEXT_ACTIONS = Object.freeze({
  NONE: "none",
  VERIFY_EMAIL: "verify_email",
  COMPLETE_ACTIVATION: "complete_activation",
  COMPLETE_TRAINING: "complete_training",
  ACTIVATE_TRIAL: "activate_trial",
  USE_TRIAL: "use_trial",
  CONVERT_TO_SILVER: "convert_to_silver",
});

const FREELANCER_ACTIVATION_ERROR_CODES = Object.freeze({
  ENGINE_DISABLED: "FREELANCER_ACTIVATION_ENGINE_DISABLED",
  NOT_FREELANCER: "FREELANCER_ACTIVATION_NOT_FREELANCER",
  NOT_ELIGIBLE: "FREELANCER_ACTIVATION_NOT_ELIGIBLE",
  ALREADY_USED: "FREELANCER_ACTIVATION_ALREADY_USED",
  SCHEMA_MISSING: "FREELANCER_ACTIVATION_SCHEMA_MISSING",
  TRIAL_REQUIRED: "FREELANCER_TRIAL_REQUIRED",
  TRIAL_EXPIRED: "FREELANCER_TRIAL_EXPIRED",
  TRIAL_DAILY_BID_LIMIT_REACHED: "FREELANCER_TRIAL_DAILY_BID_LIMIT_REACHED",
  TRIAL_BID_LIMIT_REACHED: "FREELANCER_TRIAL_BID_LIMIT_REACHED",
  TRIAL_WORK_CAP_REACHED: "FREELANCER_TRIAL_WORK_CAP_REACHED",
  TRIAL_MINI_ARTICLES_ONLY: "FREELANCER_TRIAL_MINI_ARTICLES_ONLY",
  TRIAL_BID_GRANT_FAILED: "FREELANCER_TRIAL_BID_GRANT_FAILED",
  SILVER_CONVERSION_BLOCKED: "FREELANCER_SILVER_CONVERSION_BLOCKED",
  SILVER_PLAN_NOT_FOUND: "FREELANCER_SILVER_PLAN_NOT_FOUND",
  INVALID_BUDGET: "FREELANCER_ACTIVATION_INVALID_BUDGET",
  INVALID_SHARE_SPLIT: "FREELANCER_ACTIVATION_INVALID_SHARE_SPLIT",
  WAVE_BUDGET_EXCEEDS_CAMPAIGN: "FREELANCER_ACTIVATION_WAVE_BUDGET_EXCEEDS_CAMPAIGN",
  INVALID_STATUS_TRANSITION: "FREELANCER_ACTIVATION_INVALID_STATUS_TRANSITION",
  CAMPAIGN_NOT_FOUND: "FREELANCER_ACTIVATION_CAMPAIGN_NOT_FOUND",
  WAVE_NOT_FOUND: "FREELANCER_ACTIVATION_WAVE_NOT_FOUND",
  CAMPAIGN_EMERGENCY_STOPPED: "ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED",
  CAMPAIGN_PAUSED: "ACTIVATION_CAMPAIGN_PAUSED",
  WAVE_PAUSED: "ACTIVATION_WAVE_PAUSED",
  CAMPAIGN_NOT_ACTIVE: "ACTIVATION_CAMPAIGN_NOT_ACTIVE",
  WAVE_NOT_ACTIVE: "ACTIVATION_WAVE_NOT_ACTIVE",
  INVALID_ATTACHMENT: "ACTIVATION_CAMPAIGN_ATTACHMENT_INVALID",
  CAMPAIGN_BUDGET_INSUFFICIENT: "ACTIVATION_CAMPAIGN_BUDGET_INSUFFICIENT",
  WAVE_BUDGET_INSUFFICIENT: "ACTIVATION_WAVE_BUDGET_INSUFFICIENT",
});

const FREELANCER_ACTIVATION_CAMPAIGN_STATUSES = Object.freeze([
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]);

const FREELANCER_ACTIVATION_BUDGET_ENTRY_TYPES = Object.freeze([
  "budget_allocated",
  "budget_reserved",
  "budget_released",
  "budget_used",
  "manual_adjustment",
]);

const FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS = Object.freeze({
  status: "draft",
  totalBudgetJod: "0.000",
  articleTotalValueJod: "1.000",
  freelancerShareJod: "0.500",
  companyShareJod: "0.300",
  reviewerShareJod: "0.200",
  trialBidLimit: 20,
  trialDurationDays: 10,
  dailyBidLimit: 2,
  minimumBiddersPerArticle: 10,
  maxTrialWins: 2,
  verificationRequired: true,
  trainingRequired: true,
  autoPublishToBildazo: true,
  emergencyStopEnabled: false,
  pauseNewAssignments: false,
  silverPlanCode: "silver",
  silverPriceJod: "19.000",
});

const FREELANCER_ACTIVATION_WIR_ENTRY_TYPES = Object.freeze([
  "membership_reserve_allocated",
  "membership_reserve_reversed",
  "manual_adjustment",
]);

const FREELANCER_ACTIVATION_WIR_STATUSES = Object.freeze(["active", "reversed"]);

/** Defaults must match migrations 167 + 172. */
const FREELANCER_ACTIVATION_SETTINGS_DEFAULTS = Object.freeze({
  engineEnabled: false,
  trialDurationDays: 10,
  trialBids: 20,
  dailyBidLimit: 2,
  successfulWorkCap: 2,
  requiresTraining: true,
  requiresVerification: true,
  silverPlanCode: "silver",
  archiveAfterDays: 45,
  workInventoryEnabled: false,
  workInventoryPercentage: 50,
});

function isTerminalTrialStatus(status) {
  return FREELANCER_ACTIVATION_TERMINAL_STATUSES.includes(String(status || ""));
}

function normalizeSilverPlanCode(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw || FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.silverPlanCode;
}

module.exports = {
  FREELANCER_ACTIVATION_TRIAL_STATUSES,
  FREELANCER_ACTIVATION_TERMINAL_STATUSES,
  FREELANCER_ACTIVATION_PAID_TIER_CODES,
  FREELANCER_ACTIVATION_PAID_SYNC_FROM_STATUSES,
  FREELANCER_ACTIVATION_CONVERSION_REASONS,
  FREELANCER_ACTIVATION_EVENT_TYPES,
  FREELANCER_ACTIVATION_NEXT_ACTIONS,
  FREELANCER_ACTIVATION_ERROR_CODES,
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
  FREELANCER_ACTIVATION_TRIAL_BID_SOURCE,
  FREELANCER_ACTIVATION_TRIAL_BID_LEDGER_EVENT,
  FREELANCER_ACTIVATION_CAMPAIGN_STATUSES,
  FREELANCER_ACTIVATION_BUDGET_ENTRY_TYPES,
  FREELANCER_ACTIVATION_CAMPAIGN_DEFAULTS,
  FREELANCER_ACTIVATION_WIR_ENTRY_TYPES,
  FREELANCER_ACTIVATION_WIR_STATUSES,
  isTerminalTrialStatus,
  normalizeSilverPlanCode,
};
