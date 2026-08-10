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

const updateMarketplaceEconomySettingsValidators = [
  optionalMoneyPositive("workTokenValueJod"),
  optionalMoneyPositive("normalApplicationTokensPerOrderJod"),
  optionalPercent("normalApplicationTokenRefundPercentage"),
  // Legacy aliases (normalized in service) — still validate if sent
  optionalMoneyPositive("bidTokensPerOrderJod"),
  optionalPercent("applicationTokenRefundPercentage"),
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
];

module.exports = {
  updateMarketplaceEconomySettingsValidators,
};
