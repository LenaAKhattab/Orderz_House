const { body } = require("express-validator");
const {
  ASSIGNMENT_STRATEGIES,
  AWARD_RESET_POLICIES,
  ELIGIBLE_LOSS_EFFECTS,
  DECLINE_PRIORITY_EFFECTS,
  CANCEL_PRIORITY_EFFECTS,
} = require("../constants/marketplaceEconomy");

const optionalBoolean = (field) => body(field).optional().isBoolean().withMessage(`${field} must be boolean.`);

const optionalMoneyPositive = (field) =>
  body(field)
    .optional()
    .isFloat({ gt: 0, max: 1000 })
    .withMessage(`${field} must be > 0 and <= 1000.`);

const optionalMoneyPositiveLarge = (field, { max = 1_000_000 } = {}) =>
  body(field)
    .optional()
    .isFloat({ gt: 0, max })
    .withMessage(`${field} must be > 0 and <= ${max}.`);

const optionalMoneyNonNeg = (field) =>
  body(field)
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage(`${field} must be >= 0 and <= 100000.`);

const optionalPercent = (field) =>
  body(field)
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage(`${field} must be between 0 and 100.`);

/** Current product phase: only 100% until non-100 refund rounding policy is approved. */
const optionalNormalApplicationRefundPercentage100Only = (field) =>
  body(field)
    .optional()
    .isFloat({ min: 100, max: 100 })
    .withMessage(
      `${field} must be 100 until a non-100 refund rounding policy is approved (FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED).`,
    );

const optionalInt = (field, { min = 0, max = 1000000 } = {}) =>
  body(field)
    .optional()
    .isInt({ min, max })
    .withMessage(`${field} must be an integer between ${min} and ${max}.`);

const optionalNullableInt = (field, { min = 1, max = 100000000 } = {}) =>
  body(field)
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined || value === "") return true;
      const n = Number(value);
      if (!Number.isInteger(n) || n < min || n > max) {
        throw new Error(`${field} must be null or an integer between ${min} and ${max}.`);
      }
      return true;
    });

const optionalEnum = (field, allowed) =>
  body(field)
    .optional()
    .isString()
    .isIn(allowed)
    .withMessage(`${field} must be one of: ${allowed.join(", ")}.`);

const REFUND_MODES = ["full", "none"];
const DEADLINE_POLICIES = [
  "continue_with_received",
  "cancel_and_refund",
  "require_admin_review",
];

const updateMarketplaceEconomySettingsValidators = [
  optionalMoneyPositive("workTokenValueJod"),
  optionalMoneyPositive("normalApplicationTokensPerOrderJod"),
  optionalNormalApplicationRefundPercentage100Only("normalApplicationTokenRefundPercentage"),
  // Legacy aliases (normalized in service) — still validate if sent
  optionalMoneyPositive("bidTokensPerOrderJod"),
  optionalNormalApplicationRefundPercentage100Only("applicationTokenRefundPercentage"),
  optionalPercent("platformCommissionPercentage"),
  optionalMoneyNonNeg("cashProcessingFeeJod"),
  optionalBoolean("identityVerificationBonusEnabled"),
  optionalInt("identityVerificationBonusTokens"),
  optionalBoolean("payoutMethodVerificationBonusEnabled"),
  optionalInt("payoutMethodVerificationBonusTokens"),
  optionalInt("eliteDirectOrdersPerCycle", { min: 0, max: 1000 }),
  optionalInt("eliteOfferDurationMinutes", { min: 1, max: 10080 }),
  optionalBoolean("eliteCarryForwardEnabled"),
  optionalInt("eliteCarryForwardDays", { min: 0, max: 3650 }),
  optionalInt("eliteMaximumCarryForward", { min: 0, max: 1000 }),
  optionalBoolean("eliteDeclinesAffectCarryForward"),

  optionalBoolean("priorityBiddingEnabled"),
  optionalInt("priorityBidDurationMinutes", { min: 1, max: 10080 }),
  optionalInt("priorityBidMinimumTokens", { min: 1, max: 100000000 }),
  optionalNullableInt("priorityBidMaximumTokens"),
  optionalBoolean("priorityBidShowHighest"),
  optionalBoolean("priorityBidShowPosition"),
  optionalBoolean("priorityBidAllowIncrease"),
  optionalBoolean("priorityBidAllowDecrease"),
  optionalBoolean("priorityBidAllowWithdrawal"),
  optionalBoolean("priorityBidWithdrawalReleasesTokens"),
  optionalBoolean("priorityBidWithdrawalReturnsUse"),
  optionalBoolean("priorityBidReturnUseOnOrderCancel"),
  optionalBoolean("priorityBidAutoAssignmentEnabled"),
  optionalEnum("priorityBidAssignmentStrategy", ASSIGNMENT_STRATEGIES),

  optionalBoolean("fairWorkDistributionEnabled"),
  optionalEnum("assignmentStrategy", ASSIGNMENT_STRATEGIES),
  optionalInt("fairDistributionLookbackDays", { min: 1, max: 3650 }),
  optionalPercent("fairnessWeight"),
  optionalPercent("tokenWeight"),
  optionalPercent("performanceWeight"),
  optionalPercent("recencyWeight"),
  optionalPercent("workloadWeight"),
  optionalEnum("eligibleLossPriorityEffect", ELIGIBLE_LOSS_EFFECTS),
  optionalEnum("awardResetPolicy", AWARD_RESET_POLICIES),
  optionalEnum("declinePriorityEffect", DECLINE_PRIORITY_EFFECTS),
  optionalEnum("freelancerCancelPriorityEffect", CANCEL_PRIORITY_EFFECTS),

  optionalBoolean("workTokensEnabled"),
  optionalBoolean("marketplaceCommissionEnabled"),
  optionalBoolean("cashMembershipPaymentsEnabled"),
  optionalBoolean("eliteEngineEnabled"),
  optionalBoolean("verificationBonusesEnabled"),
  optionalBoolean("bidCreditsEnabled"),
  optionalBoolean("bidCreditPurchasesEnabled"),
  optionalBoolean("articleApplicationsEnabled"),
  optionalBoolean("priorityApplicationBoostEnabled"),

  // Phase E3 Normal Order Admin limits
  optionalMoneyPositiveLarge("normalOrderMinValueJod"),
  optionalMoneyPositiveLarge("normalOrderMaxValueJod"),
  optionalInt("normalOrderMinTargetApplicants", { min: 1, max: 10000 }),
  optionalInt("normalOrderMaxTargetApplicants", { min: 1, max: 10000 }),
  optionalInt("normalOrderDefaultTargetApplicants", { min: 1, max: 10000 }),
  optionalInt("normalOrderMinBidCost", { min: 1, max: 1000 }),
  optionalInt("normalOrderMaxBidCost", { min: 1, max: 1000 }),
  optionalInt("normalOrderDefaultBidCost", { min: 1, max: 1000 }),
  optionalInt("normalOrderMinApplicationPeriodHours", { min: 1, max: 8760 }),
  optionalInt("normalOrderMaxApplicationPeriodHours", { min: 1, max: 8760 }),
  optionalInt("normalOrderDefaultApplicationPeriodHours", { min: 1, max: 8760 }),
  optionalInt("normalOrderMinExecutionDurationHours", { min: 1, max: 87600 }),
  optionalInt("normalOrderMaxExecutionDurationHours", { min: 1, max: 87600 }),
  optionalInt("normalOrderDefaultExecutionDurationHours", { min: 1, max: 87600 }),
  optionalEnum("normalOrderDeadlineIncompleteTargetPolicy", DEADLINE_POLICIES),
  optionalEnum("normalOrderRefundClientCancelBeforeSelection", REFUND_MODES),
  optionalEnum("normalOrderRefundSystemCancel", REFUND_MODES),
  optionalEnum("normalOrderRefundDeadlineNoSelection", REFUND_MODES),
  optionalEnum("normalOrderRefundNoFreelancerSelected", REFUND_MODES),
  optionalEnum("normalOrderRefundFreelancerWithdrawal", REFUND_MODES),
  optionalEnum("normalOrderRefundRejectedApplication", REFUND_MODES),
  optionalEnum("normalOrderRefundLosingApplicant", REFUND_MODES),
  optionalEnum("normalOrderRefundPostAwardCancel", REFUND_MODES),
  body("normalOrderBusinessTimezone")
    .optional()
    .isString()
    .isLength({ min: 1, max: 64 })
    .withMessage("normalOrderBusinessTimezone must be 1–64 characters."),
  optionalInt("articleMinRequiredBids", { min: 1, max: 10000 }),
  optionalInt("articleDefaultRequiredBidCount", { min: 1, max: 10000 }),
  optionalBoolean("articleAutoCloseWhenThresholdReached"),
  optionalBoolean("articleAutoAssignWhenThresholdReached"),
  optionalEnum("articleRefundPolicy", ["full_on_minimum_not_met"]),
  body("articleAllowedRequiredBidCounts")
    .optional()
    .isArray({ min: 1 })
    .withMessage("articleAllowedRequiredBidCounts must be a non-empty array."),
  body("articleAllowedRequiredBidCounts.*").optional().isInt({ min: 1 }),
  optionalInt("pantryMinRequiredBids", { min: 1, max: 10000 }),
  optionalInt("pantryDefaultRequiredBidCount", { min: 1, max: 10000 }),
  optionalBoolean("pantryAutoCloseWhenThresholdReached"),
  optionalBoolean("pantryAutoAssignWhenThresholdReached"),
  optionalEnum("pantryRefundPolicy", ["full_on_minimum_not_met"]),
  body("pantryAllowedRequiredBidCounts")
    .optional()
    .isArray({ min: 1 })
    .withMessage("pantryAllowedRequiredBidCounts must be a non-empty array."),
  body("pantryAllowedRequiredBidCounts.*").optional().isInt({ min: 1 }),
];

module.exports = {
  updateMarketplaceEconomySettingsValidators,
};
