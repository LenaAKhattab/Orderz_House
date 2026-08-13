/**
 * Client-side helpers for Marketplace Economy settings form (باقات العمل).
 * Mirrors backend validation — configuration only; no economy / auction execution.
 */

export const MARKETPLACE_ECONOMY_DEFAULT_FORM = Object.freeze({
  workTokenValueJod: "0.100",
  normalApplicationTokensPerOrderJod: "1",
  normalApplicationTokenRefundPercentage: "100",
  platformCommissionPercentage: "30",
  cashProcessingFeeJod: "5.000",
  identityVerificationBonusEnabled: true,
  identityVerificationBonusTokens: "10",
  payoutMethodVerificationBonusEnabled: true,
  payoutMethodVerificationBonusTokens: "10",
  eliteDirectOrdersPerCycle: "1",
  eliteOfferDurationMinutes: "10",
  eliteCarryForwardEnabled: true,
  eliteCarryForwardDays: "7",
  eliteMaximumCarryForward: "1",
  eliteDeclinesAffectCarryForward: false,

  priorityBiddingEnabled: false,
  priorityApplicationBoostEnabled: false,
  bidCreditsEnabled: false,
  bidCreditPurchasesEnabled: false,
  articleApplicationsEnabled: false,
  priorityBidDurationMinutes: "30",
  priorityBidMinimumTokens: "1",
  priorityBidMaximumTokens: "",
  priorityBidShowHighest: true,
  priorityBidShowPosition: false,
  priorityBidAllowIncrease: true,
  priorityBidAllowDecrease: false,
  priorityBidAllowWithdrawal: false,
  priorityBidWithdrawalReleasesTokens: true,
  priorityBidWithdrawalReturnsUse: false,
  priorityBidReturnUseOnOrderCancel: true,
  priorityBidAutoAssignmentEnabled: true,
  priorityBidAssignmentStrategy: "HIGHEST_TOKEN_ONLY",

  fairWorkDistributionEnabled: false,
  assignmentStrategy: "HIGHEST_TOKEN_ONLY",
  fairDistributionLookbackDays: "30",
  fairnessWeight: "0",
  tokenWeight: "100",
  performanceWeight: "0",
  recencyWeight: "0",
  workloadWeight: "0",
  eligibleLossPriorityEffect: "INCREASE_PRIORITY",
  awardResetPolicy: "RESET_TO_ZERO",
  declinePriorityEffect: "NO_BOOST",
  freelancerCancelPriorityEffect: "NO_BOOST",

  workTokensEnabled: false,
  marketplaceCommissionEnabled: false,
  cashMembershipPaymentsEnabled: false,
  eliteEngineEnabled: false,
  verificationBonusesEnabled: false,
});

const ASSIGNMENT_STRATEGIES = new Set([
  "HIGHEST_TOKEN_ONLY",
  "FAIR_DISTRIBUTION_FIRST",
  // HYBRID reserved — not selectable until weight policy is approved
]);

export const ASSIGNMENT_STRATEGIES_UI = Object.freeze([
  { value: "HIGHEST_TOKEN_ONLY", label: "HIGHEST_TOKEN_ONLY", available: true },
  { value: "FAIR_DISTRIBUTION_FIRST", label: "FAIR_DISTRIBUTION_FIRST", available: true },
  {
    value: "HYBRID",
    label: "HYBRID (unavailable — weight policy required)",
    available: false,
  },
]);

function toFiniteNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function roundMoney3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/**
 * @param {object|null|undefined} settings
 */
export function settingsToFormState(settings) {
  if (!settings || typeof settings !== "object") {
    return { ...MARKETPLACE_ECONOMY_DEFAULT_FORM };
  }
  const money = (n, digits = 3) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return "";
    return v.toFixed(digits);
  };
  const num = (n) =>
    Number.isFinite(Number(n)) ? String(Number(n)) : "";

  // Prefer renamed fields; accept legacy API aliases if present
  const normalTokens =
    settings.normalApplicationTokensPerOrderJod ?? settings.bidTokensPerOrderJod;
  const normalRefund =
    settings.normalApplicationTokenRefundPercentage ?? settings.applicationTokenRefundPercentage;

  return {
    workTokenValueJod: money(settings.workTokenValueJod),
    normalApplicationTokensPerOrderJod: money(normalTokens),
    normalApplicationTokenRefundPercentage: num(normalRefund),
    platformCommissionPercentage: num(settings.platformCommissionPercentage),
    cashProcessingFeeJod: money(settings.cashProcessingFeeJod),
    identityVerificationBonusEnabled: Boolean(settings.identityVerificationBonusEnabled),
    identityVerificationBonusTokens: String(settings.identityVerificationBonusTokens ?? ""),
    payoutMethodVerificationBonusEnabled: Boolean(settings.payoutMethodVerificationBonusEnabled),
    payoutMethodVerificationBonusTokens: String(settings.payoutMethodVerificationBonusTokens ?? ""),
    eliteDirectOrdersPerCycle: String(settings.eliteDirectOrdersPerCycle ?? ""),
    eliteOfferDurationMinutes: String(settings.eliteOfferDurationMinutes ?? ""),
    eliteCarryForwardEnabled: Boolean(settings.eliteCarryForwardEnabled),
    eliteCarryForwardDays: String(settings.eliteCarryForwardDays ?? ""),
    eliteMaximumCarryForward: String(settings.eliteMaximumCarryForward ?? ""),
    eliteDeclinesAffectCarryForward: Boolean(settings.eliteDeclinesAffectCarryForward),

    priorityBiddingEnabled: Boolean(settings.priorityBiddingEnabled),
    priorityApplicationBoostEnabled: Boolean(settings.priorityApplicationBoostEnabled),
    bidCreditsEnabled: Boolean(settings.bidCreditsEnabled),
    bidCreditPurchasesEnabled: Boolean(settings.bidCreditPurchasesEnabled),
    articleApplicationsEnabled: Boolean(settings.articleApplicationsEnabled),
    priorityBidDurationMinutes: String(settings.priorityBidDurationMinutes ?? ""),
    priorityBidMinimumTokens: String(settings.priorityBidMinimumTokens ?? ""),
    priorityBidMaximumTokens:
      settings.priorityBidMaximumTokens == null || settings.priorityBidMaximumTokens === ""
        ? ""
        : String(settings.priorityBidMaximumTokens),
    priorityBidShowHighest: Boolean(settings.priorityBidShowHighest),
    priorityBidShowPosition: Boolean(settings.priorityBidShowPosition),
    priorityBidAllowIncrease: Boolean(settings.priorityBidAllowIncrease),
    priorityBidAllowDecrease: Boolean(settings.priorityBidAllowDecrease),
    priorityBidAllowWithdrawal: Boolean(settings.priorityBidAllowWithdrawal),
    priorityBidWithdrawalReleasesTokens: Boolean(settings.priorityBidWithdrawalReleasesTokens),
    priorityBidWithdrawalReturnsUse: Boolean(settings.priorityBidWithdrawalReturnsUse),
    priorityBidReturnUseOnOrderCancel: Boolean(settings.priorityBidReturnUseOnOrderCancel),
    priorityBidAutoAssignmentEnabled: Boolean(settings.priorityBidAutoAssignmentEnabled),
    priorityBidAssignmentStrategy: settings.priorityBidAssignmentStrategy || "HIGHEST_TOKEN_ONLY",

    fairWorkDistributionEnabled: Boolean(settings.fairWorkDistributionEnabled),
    assignmentStrategy: settings.assignmentStrategy || "HIGHEST_TOKEN_ONLY",
    fairDistributionLookbackDays: String(settings.fairDistributionLookbackDays ?? 30),
    fairnessWeight: num(settings.fairnessWeight ?? 0),
    tokenWeight: num(settings.tokenWeight ?? 100),
    performanceWeight: num(settings.performanceWeight ?? 0),
    recencyWeight: num(settings.recencyWeight ?? 0),
    workloadWeight: num(settings.workloadWeight ?? 0),
    eligibleLossPriorityEffect: settings.eligibleLossPriorityEffect || "INCREASE_PRIORITY",
    awardResetPolicy: settings.awardResetPolicy || "RESET_TO_ZERO",
    declinePriorityEffect: settings.declinePriorityEffect || "NO_BOOST",
    freelancerCancelPriorityEffect: settings.freelancerCancelPriorityEffect || "NO_BOOST",

    workTokensEnabled: Boolean(settings.workTokensEnabled),
    marketplaceCommissionEnabled: Boolean(settings.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(settings.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(settings.eliteEngineEnabled),
    verificationBonusesEnabled: Boolean(settings.verificationBonusesEnabled),
  };
}

/**
 * Validate form state before PUT. Returns { ok, errors, patch }.
 * @param {Record<string, unknown>} form
 * @param {{ isEn?: boolean }} [opts]
 */
export function validateMarketplaceEconomyForm(form, { isEn = false } = {}) {
  const errors = {};
  const t = (ar, en) => (isEn ? en : ar);

  const moneyPositive = (key, label) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || n <= 0 || n > 1000) {
      errors[key] = t(`${label}: يجب أن تكون أكبر من 0.`, `${label}: must be > 0.`);
      return null;
    }
    return roundMoney3(n);
  };

  const moneyNonNeg = (key, label) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || n < 0 || n > 100000) {
      errors[key] = t(`${label}: يجب أن تكون ≥ 0.`, `${label}: must be ≥ 0.`);
      return null;
    }
    return roundMoney3(n);
  };

  const percent = (key, label) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || n < 0 || n > 100) {
      errors[key] = t(`${label}: بين 0 و 100.`, `${label}: must be 0–100.`);
      return null;
    }
    return Math.round(n * 100) / 100;
  };

  const intRange = (key, label, min, max) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || !Number.isInteger(n) || n < min || n > max) {
      errors[key] = t(
        `${label}: عدد صحيح بين ${min} و ${max}.`,
        `${label}: integer between ${min} and ${max}.`,
      );
      return null;
    }
    return n;
  };

  const nullableInt = (key, label, min, max) => {
    if (form[key] === "" || form[key] == null) return null;
    return intRange(key, label, min, max);
  };

  const enumVal = (key, label, allowed) => {
    const v = String(form[key] || "").trim();
    if (!allowed.has(v) && !allowed.includes?.(v) && !(allowed instanceof Set ? allowed.has(v) : false)) {
      const set = allowed instanceof Set ? allowed : new Set(allowed);
      if (!set.has(v)) {
        errors[key] = t(`${label}: قيمة غير صالحة.`, `${label}: invalid value.`);
        return null;
      }
    }
    return v;
  };

  const strategy = (key, label) => {
    const v = String(form[key] || "").trim();
    if (v === "HYBRID") {
      errors[key] = t(
        `${label}: HYBRID غير متاح حتى تُعرَّف أوزان الدمج.`,
        `${label}: HYBRID unavailable until weight policy is defined (FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED).`,
      );
      return null;
    }
    return enumVal(key, label, ASSIGNMENT_STRATEGIES);
  };

  // Phase B7A: active Admin patch omits deprecated Work Token / legacy auction knobs.
  // Engines work_tokens_enabled + priority_bidding_enabled are always forced OFF.
  const patch = {
    platformCommissionPercentage: percent(
      "platformCommissionPercentage",
      t("نسبة العمولة", "Commission %"),
    ),
    cashProcessingFeeJod: moneyNonNeg(
      "cashProcessingFeeJod",
      t("رسوم الدفع النقدي", "Cash processing fee"),
    ),
    // Phase B7B: omit verification Work Token amount knobs; engine forced OFF.
    eliteDirectOrdersPerCycle: intRange(
      "eliteDirectOrdersPerCycle",
      t("طلبات Elite لكل دورة", "Elite orders / cycle"),
      0,
      1000,
    ),
    eliteOfferDurationMinutes: intRange(
      "eliteOfferDurationMinutes",
      t("مدة العرض", "Offer duration"),
      1,
      10080,
    ),
    eliteCarryForwardEnabled: Boolean(form.eliteCarryForwardEnabled),
    eliteCarryForwardDays: intRange(
      "eliteCarryForwardDays",
      t("أيام الترحيل", "Carry-forward days"),
      0,
      3650,
    ),
    eliteMaximumCarryForward: intRange(
      "eliteMaximumCarryForward",
      t("الحد الأقصى للترحيل", "Max carry-forward"),
      0,
      1000,
    ),
    eliteDeclinesAffectCarryForward: Boolean(form.eliteDeclinesAffectCarryForward),

    workTokensEnabled: false,
    priorityBiddingEnabled: false,
    priorityApplicationBoostEnabled: Boolean(form.priorityApplicationBoostEnabled),
    bidCreditsEnabled: Boolean(form.bidCreditsEnabled),
    bidCreditPurchasesEnabled: Boolean(form.bidCreditPurchasesEnabled),
    articleApplicationsEnabled: Boolean(form.articleApplicationsEnabled),

    fairWorkDistributionEnabled: Boolean(form.fairWorkDistributionEnabled),
    assignmentStrategy: strategy("assignmentStrategy", t("استراتيجية التعيين", "Assignment strategy")),
    fairDistributionLookbackDays: intRange(
      "fairDistributionLookbackDays",
      t("نافذة التوزيع العادل (أيام)", "Fair Distribution lookback (days)"),
      1,
      3650,
    ),
    fairnessWeight: percent("fairnessWeight", "fairnessWeight"),
    tokenWeight: percent("tokenWeight", "tokenWeight"),
    performanceWeight: percent("performanceWeight", "performanceWeight"),
    recencyWeight: percent("recencyWeight", "recencyWeight"),
    workloadWeight: percent("workloadWeight", "workloadWeight"),
    eligibleLossPriorityEffect: String(form.eligibleLossPriorityEffect || "INCREASE_PRIORITY"),
    awardResetPolicy: String(form.awardResetPolicy || "RESET_TO_ZERO"),
    declinePriorityEffect: String(form.declinePriorityEffect || "NO_BOOST"),
    freelancerCancelPriorityEffect: String(form.freelancerCancelPriorityEffect || "NO_BOOST"),

    marketplaceCommissionEnabled: Boolean(form.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(form.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(form.eliteEngineEnabled),
    verificationBonusesEnabled: false,
  };

  const blockingNull = Object.entries(patch).some(([, v]) => v === null);
  const finalOk = Object.keys(errors).length === 0 && !blockingNull;
  return { ok: finalOk, errors, patch: finalOk ? patch : null };
}

/** True when unfinished execution engines are off (Phase 2 safety). */
export function areEconomyEnginesDisabled(settings) {
  if (!settings) return true;
  return (
    !settings.workTokensEnabled &&
    !settings.bidCreditsEnabled &&
    !settings.bidCreditPurchasesEnabled &&
    !settings.articleApplicationsEnabled &&
    !settings.marketplaceCommissionEnabled &&
    !settings.cashMembershipPaymentsEnabled &&
    !settings.eliteEngineEnabled &&
    !settings.verificationBonusesEnabled &&
    !settings.priorityBiddingEnabled &&
    !settings.priorityApplicationBoostEnabled &&
    !settings.fairWorkDistributionEnabled
  );
}
