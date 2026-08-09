const { body } = require("express-validator");

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

const updateMarketplaceEconomySettingsValidators = [
  optionalMoneyPositive("workTokenValueJod"),
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
  optionalBoolean("workTokensEnabled"),
  optionalBoolean("marketplaceCommissionEnabled"),
  optionalBoolean("cashMembershipPaymentsEnabled"),
  optionalBoolean("eliteEngineEnabled"),
  optionalBoolean("verificationBonusesEnabled"),
];

module.exports = {
  updateMarketplaceEconomySettingsValidators,
};
