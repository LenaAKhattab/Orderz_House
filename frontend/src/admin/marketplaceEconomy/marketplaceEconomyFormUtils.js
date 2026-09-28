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

  // Phase E3 Normal Order Admin limits
  normalOrderMinValueJod: "1",
  normalOrderMaxValueJod: "10000",
  normalOrderMinTargetApplicants: "1",
  normalOrderMaxTargetApplicants: "200",
  normalOrderDefaultTargetApplicants: "10",
  normalOrderMinBidCost: "1",
  normalOrderMaxBidCost: "20",
  normalOrderDefaultBidCost: "1",
  normalOrderMinApplicationPeriodHours: "1",
  normalOrderMaxApplicationPeriodHours: "720",
  normalOrderDefaultApplicationPeriodHours: "72",
  normalOrderMinExecutionDurationHours: "1",
  normalOrderMaxExecutionDurationHours: "2160",
  normalOrderDefaultExecutionDurationHours: "72",
  normalOrderDeadlineIncompleteTargetPolicy: "continue_with_received",
  normalOrderRefundClientCancelBeforeSelection: "full",
  normalOrderRefundSystemCancel: "full",
  normalOrderRefundDeadlineNoSelection: "full",
  normalOrderRefundNoFreelancerSelected: "full",
  normalOrderRefundFreelancerWithdrawal: "none",
  normalOrderRefundRejectedApplication: "none",
  normalOrderRefundLosingApplicant: "none",
  normalOrderRefundPostAwardCancel: "none",
  normalOrderBusinessTimezone: "Asia/Amman",

  articleMinRequiredBids: "10",
  articleAllowedRequiredBidCounts: "10,15,20,30",
  articleDefaultRequiredBidCount: "10",
  articleAutoCloseWhenThresholdReached: true,
  articleAutoAssignWhenThresholdReached: false,
  articleRefundPolicy: "full_on_minimum_not_met",
  pantryMinRequiredBids: "10",
  pantryAllowedRequiredBidCounts: "10,15,20,30",
  pantryDefaultRequiredBidCount: "10",
  pantryAutoCloseWhenThresholdReached: true,
  pantryAutoAssignWhenThresholdReached: false,
  pantryRefundPolicy: "full_on_minimum_not_met",
});

const ASSIGNMENT_STRATEGIES = new Set([
  "HIGHEST_TOKEN_ONLY",
  "FAIR_DISTRIBUTION_FIRST",
  // HYBRID reserved — not selectable until weight policy is approved
]);

export const ASSIGNMENT_STRATEGIES_UI = Object.freeze([
  {
    value: "HIGHEST_TOKEN_ONLY",
    label: "Highest eligible first",
    available: true,
  },
  {
    value: "FAIR_DISTRIBUTION_FIRST",
    label: "Fair distribution first",
    available: true,
  },
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

    normalOrderMinValueJod: money(settings.normalOrderMinValueJod ?? 1),
    normalOrderMaxValueJod: money(settings.normalOrderMaxValueJod ?? 10000),
    normalOrderMinTargetApplicants: String(settings.normalOrderMinTargetApplicants ?? 1),
    normalOrderMaxTargetApplicants: String(settings.normalOrderMaxTargetApplicants ?? 200),
    normalOrderDefaultTargetApplicants: String(settings.normalOrderDefaultTargetApplicants ?? 10),
    normalOrderMinBidCost: String(settings.normalOrderMinBidCost ?? 1),
    normalOrderMaxBidCost: String(settings.normalOrderMaxBidCost ?? 20),
    normalOrderDefaultBidCost: String(settings.normalOrderDefaultBidCost ?? 1),
    normalOrderMinApplicationPeriodHours: String(
      settings.normalOrderMinApplicationPeriodHours ?? 1,
    ),
    normalOrderMaxApplicationPeriodHours: String(
      settings.normalOrderMaxApplicationPeriodHours ?? 720,
    ),
    normalOrderDefaultApplicationPeriodHours: String(
      settings.normalOrderDefaultApplicationPeriodHours ?? 72,
    ),
    normalOrderMinExecutionDurationHours: String(
      settings.normalOrderMinExecutionDurationHours ?? 1,
    ),
    normalOrderMaxExecutionDurationHours: String(
      settings.normalOrderMaxExecutionDurationHours ?? 2160,
    ),
    normalOrderDefaultExecutionDurationHours: String(
      settings.normalOrderDefaultExecutionDurationHours ?? 72,
    ),
    normalOrderDeadlineIncompleteTargetPolicy:
      settings.normalOrderDeadlineIncompleteTargetPolicy || "continue_with_received",
    normalOrderRefundClientCancelBeforeSelection:
      settings.normalOrderRefundClientCancelBeforeSelection || "full",
    normalOrderRefundSystemCancel: settings.normalOrderRefundSystemCancel || "full",
    normalOrderRefundDeadlineNoSelection:
      settings.normalOrderRefundDeadlineNoSelection || "full",
    normalOrderRefundNoFreelancerSelected:
      settings.normalOrderRefundNoFreelancerSelected || "full",
    normalOrderRefundFreelancerWithdrawal:
      settings.normalOrderRefundFreelancerWithdrawal || "none",
    normalOrderRefundRejectedApplication:
      settings.normalOrderRefundRejectedApplication || "none",
    normalOrderRefundLosingApplicant: settings.normalOrderRefundLosingApplicant || "none",
    normalOrderRefundPostAwardCancel: settings.normalOrderRefundPostAwardCancel || "none",
    normalOrderBusinessTimezone: settings.normalOrderBusinessTimezone || "Asia/Amman",
    articleMinRequiredBids: String(settings.articleMinRequiredBids ?? 10),
    articleAllowedRequiredBidCounts: Array.isArray(settings.articleAllowedRequiredBidCounts)
      ? settings.articleAllowedRequiredBidCounts.join(",")
      : String(settings.articleAllowedRequiredBidCounts || "10,15,20,30"),
    articleDefaultRequiredBidCount: String(settings.articleDefaultRequiredBidCount ?? 10),
    articleAutoCloseWhenThresholdReached: settings.articleAutoCloseWhenThresholdReached !== false,
    articleAutoAssignWhenThresholdReached: false,
    articleRefundPolicy: settings.articleRefundPolicy || "full_on_minimum_not_met",
    pantryMinRequiredBids: String(settings.pantryMinRequiredBids ?? 10),
    pantryAllowedRequiredBidCounts: Array.isArray(settings.pantryAllowedRequiredBidCounts)
      ? settings.pantryAllowedRequiredBidCounts.join(",")
      : String(settings.pantryAllowedRequiredBidCounts || "10,15,20,30"),
    pantryDefaultRequiredBidCount: String(settings.pantryDefaultRequiredBidCount ?? 10),
    pantryAutoCloseWhenThresholdReached: settings.pantryAutoCloseWhenThresholdReached !== false,
    pantryAutoAssignWhenThresholdReached: false,
    pantryRefundPolicy: settings.pantryRefundPolicy || "full_on_minimum_not_met",
  };
}

/**
 * Validate form state before PUT. Returns { ok, errors, patch }.
 * @param {Record<string, unknown>} form
 * @param {{ isEn?: boolean, translate?: (key: string, values?: Record<string, string | number>) => string }} [opts]
 */
export function validateMarketplaceEconomyForm(form, { isEn = false, translate: tr, t: tOpt } = {}) {
  const errors = {};
  const translate = tr ?? tOpt;
  const t = (ar, en) => (isEn ? en : ar);
  const fieldLabel = (key, ar, en) => (translate ? translate(`economy.fields.${key}`) : t(ar, en));
  const valErr = (kind, label, extra = {}) => {
    if (translate) return translate(`economy.validation.${kind}`, { label, ...extra });
    if (kind === "moneyPositive") return t(`${label}: يجب أن تكون أكبر من 0.`, `${label}: must be > 0.`);
    if (kind === "moneyNonNeg") return t(`${label}: يجب أن تكون ≥ 0.`, `${label}: must be ≥ 0.`);
    if (kind === "percentRange") return t(`${label}: بين 0 و 100.`, `${label}: must be 0–100.`);
    if (kind === "intRange") {
      const { min, max } = extra;
      return t(`${label}: عدد صحيح بين ${min} و ${max}.`, `${label}: integer between ${min} and ${max}.`);
    }
    if (kind === "invalidValue") return t(`${label}: قيمة غير صالحة.`, `${label}: invalid value.`);
    if (kind === "hybridUnavailable") {
      return t(
        `${label}: HYBRID غير متاح حتى تُعرَّف أوزان الدمج.`,
        `${label}: HYBRID unavailable until weight policy is defined (FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED).`,
      );
    }
    if (kind === "minOrderInvalid") return t("الحد الأدنى لقيمة الطلب غير صالح.", "Min order value invalid.");
    if (kind === "maxOrderInvalid") return t("الحد الأقصى لقيمة الطلب غير صالح.", "Max order value invalid.");
    return t(`${label}: قيمة غير صالحة.`, `${label}: invalid value.`);
  };

  const moneyPositive = (key, label) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || n <= 0 || n > 1000) {
      errors[key] = valErr("moneyPositive", label);
      return null;
    }
    return roundMoney3(n);
  };

  const moneyNonNeg = (key, label) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || n < 0 || n > 100000) {
      errors[key] = valErr("moneyNonNeg", label);
      return null;
    }
    return roundMoney3(n);
  };

  const percent = (key, label) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || n < 0 || n > 100) {
      errors[key] = valErr("percentRange", label);
      return null;
    }
    return Math.round(n * 100) / 100;
  };

  const intRange = (key, label, min, max) => {
    const n = toFiniteNumber(form[key]);
    if (n == null || !Number.isInteger(n) || n < min || n > max) {
      errors[key] = valErr("intRange", label, { min, max });
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
        errors[key] = valErr("invalidValue", label);
        return null;
      }
    }
    return v;
  };

  const strategy = (key, label) => {
    const v = String(form[key] || "").trim();
    if (v === "HYBRID") {
      errors[key] = valErr("hybridUnavailable", label);
      return null;
    }
    return enumVal(key, label, ASSIGNMENT_STRATEGIES);
  };

  // Phase B7A: active Admin patch omits deprecated Work Token / legacy auction knobs.
  // Engines work_tokens_enabled + priority_bidding_enabled are always forced OFF.
  const patch = {
    platformCommissionPercentage: percent(
      "platformCommissionPercentage",
      fieldLabel("commissionPct", "نسبة العمولة", "Commission %"),
    ),
    cashProcessingFeeJod: moneyNonNeg(
      "cashProcessingFeeJod",
      fieldLabel("cashFee", "رسوم الدفع النقدي", "Cash processing fee"),
    ),
    // Phase B7B: omit verification Work Token amount knobs; engine forced OFF.
    eliteDirectOrdersPerCycle: intRange(
      "eliteDirectOrdersPerCycle",
      fieldLabel("eliteOrdersPerCycle", "طلبات Elite لكل دورة", "Elite orders / cycle"),
      0,
      1000,
    ),
    eliteOfferDurationMinutes: intRange(
      "eliteOfferDurationMinutes",
      fieldLabel("offerDuration", "مدة العرض", "Offer duration"),
      1,
      10080,
    ),
    eliteCarryForwardEnabled: Boolean(form.eliteCarryForwardEnabled),
    eliteCarryForwardDays: intRange(
      "eliteCarryForwardDays",
      fieldLabel("carryForwardDays", "أيام الترحيل", "Carry-forward days"),
      0,
      3650,
    ),
    eliteMaximumCarryForward: intRange(
      "eliteMaximumCarryForward",
      fieldLabel("maxCarryForward", "الحد الأقصى للترحيل", "Max carry-forward"),
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
    assignmentStrategy: strategy(
      "assignmentStrategy",
      fieldLabel("assignmentStrategy", "استراتيجية التعيين", "Assignment strategy"),
    ),
    fairDistributionLookbackDays: intRange(
      "fairDistributionLookbackDays",
      fieldLabel("fairLookback", "نافذة التوزيع العادل (أيام)", "Fair Distribution lookback (days)"),
      1,
      3650,
    ),
    fairnessWeight: percent("fairnessWeight", fieldLabel("fairnessWeight", "وزن العدالة", "Fairness weight")),
    tokenWeight: percent("tokenWeight", fieldLabel("tokenWeight", "وزن العروض", "Token weight")),
    performanceWeight: percent(
      "performanceWeight",
      fieldLabel("performanceWeight", "وزن الأداء", "Performance weight"),
    ),
    recencyWeight: percent("recencyWeight", fieldLabel("recencyWeight", "وزن الحداثة", "Recency weight")),
    workloadWeight: percent("workloadWeight", fieldLabel("workloadWeight", "وزن عبء العمل", "Workload weight")),
    eligibleLossPriorityEffect: String(form.eligibleLossPriorityEffect || "INCREASE_PRIORITY"),
    awardResetPolicy: String(form.awardResetPolicy || "RESET_TO_ZERO"),
    declinePriorityEffect: String(form.declinePriorityEffect || "NO_BOOST"),
    freelancerCancelPriorityEffect: String(form.freelancerCancelPriorityEffect || "NO_BOOST"),

    marketplaceCommissionEnabled: Boolean(form.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(form.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(form.eliteEngineEnabled),
    verificationBonusesEnabled: false,

    // Phase E3
    normalOrderMinValueJod: (() => {
      const n = toFiniteNumber(form.normalOrderMinValueJod);
      if (n == null || n <= 0 || n > 1_000_000) {
        errors.normalOrderMinValueJod = valErr("minOrderInvalid", "");
        return null;
      }
      return roundMoney3(n);
    })(),
    normalOrderMaxValueJod: (() => {
      const n = toFiniteNumber(form.normalOrderMaxValueJod);
      if (n == null || n <= 0 || n > 1_000_000) {
        errors.normalOrderMaxValueJod = valErr("maxOrderInvalid", "");
        return null;
      }
      return roundMoney3(n);
    })(),
    normalOrderMinTargetApplicants: intRange(
      "normalOrderMinTargetApplicants",
      fieldLabel("minApplicants", "حد أدنى للمتقدمين", "Min applicants"),
      1,
      10000,
    ),
    normalOrderMaxTargetApplicants: intRange(
      "normalOrderMaxTargetApplicants",
      fieldLabel("maxApplicants", "حد أقصى للمتقدمين", "Max applicants"),
      1,
      10000,
    ),
    normalOrderDefaultTargetApplicants: intRange(
      "normalOrderDefaultTargetApplicants",
      fieldLabel("defaultApplicants", "العدد الافتراضي للمتقدمين", "Default applicants"),
      1,
      10000,
    ),
    normalOrderMinBidCost: intRange(
      "normalOrderMinBidCost",
      fieldLabel("minBidCost", "حد أدنى لتكلفة العرض", "Min Bid cost"),
      1,
      1000,
    ),
    normalOrderMaxBidCost: intRange(
      "normalOrderMaxBidCost",
      fieldLabel("maxBidCost", "حد أقصى لتكلفة العرض", "Max Bid cost"),
      1,
      1000,
    ),
    normalOrderDefaultBidCost: intRange(
      "normalOrderDefaultBidCost",
      fieldLabel("defaultBidCost", "تكلفة العرض الافتراضية", "Default Bid cost"),
      1,
      1000,
    ),
    normalOrderMinApplicationPeriodHours: intRange(
      "normalOrderMinApplicationPeriodHours",
      fieldLabel("minApplicationHours", "حد أدنى لساعات التقديم", "Min application hours"),
      1,
      8760,
    ),
    normalOrderMaxApplicationPeriodHours: intRange(
      "normalOrderMaxApplicationPeriodHours",
      fieldLabel("maxApplicationHours", "حد أقصى لساعات التقديم", "Max application hours"),
      1,
      8760,
    ),
    normalOrderDefaultApplicationPeriodHours: intRange(
      "normalOrderDefaultApplicationPeriodHours",
      fieldLabel("defaultApplicationHours", "ساعات التقديم الافتراضية", "Default application hours"),
      1,
      8760,
    ),
    normalOrderMinExecutionDurationHours: intRange(
      "normalOrderMinExecutionDurationHours",
      fieldLabel("minExecutionHours", "حد أدنى لساعات التنفيذ", "Min execution hours"),
      1,
      87600,
    ),
    normalOrderMaxExecutionDurationHours: intRange(
      "normalOrderMaxExecutionDurationHours",
      fieldLabel("maxExecutionHours", "حد أقصى لساعات التنفيذ", "Max execution hours"),
      1,
      87600,
    ),
    normalOrderDefaultExecutionDurationHours: intRange(
      "normalOrderDefaultExecutionDurationHours",
      fieldLabel("defaultExecutionHours", "ساعات التنفيذ الافتراضية", "Default execution hours"),
      1,
      87600,
    ),
    normalOrderDeadlineIncompleteTargetPolicy: String(
      form.normalOrderDeadlineIncompleteTargetPolicy || "continue_with_received",
    ),
    normalOrderRefundClientCancelBeforeSelection: String(
      form.normalOrderRefundClientCancelBeforeSelection || "full",
    ),
    normalOrderRefundSystemCancel: String(form.normalOrderRefundSystemCancel || "full"),
    normalOrderRefundDeadlineNoSelection: String(
      form.normalOrderRefundDeadlineNoSelection || "full",
    ),
    normalOrderRefundNoFreelancerSelected: String(
      form.normalOrderRefundNoFreelancerSelected || "full",
    ),
    normalOrderRefundFreelancerWithdrawal: String(
      form.normalOrderRefundFreelancerWithdrawal || "none",
    ),
    normalOrderRefundRejectedApplication: String(
      form.normalOrderRefundRejectedApplication || "none",
    ),
    normalOrderRefundLosingApplicant: String(form.normalOrderRefundLosingApplicant || "none"),
    normalOrderRefundPostAwardCancel: String(form.normalOrderRefundPostAwardCancel || "none"),
    normalOrderBusinessTimezone: String(form.normalOrderBusinessTimezone || "Asia/Amman"),
    articleMinRequiredBids: intRange(
      "articleMinRequiredBids",
      fieldLabel("articleMinBids", "حد أدنى لمناقصات المقال", "Article min required bids"),
      1,
      10000,
    ),
    articleDefaultRequiredBidCount: intRange(
      "articleDefaultRequiredBidCount",
      fieldLabel("articleDefaultBids", "الافتراضي لمناقصات المقال", "Article default required bids"),
      1,
      10000,
    ),
    articleAllowedRequiredBidCounts: String(form.articleAllowedRequiredBidCounts || "10,15,20,30")
      .split(/[,\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n >= 1),
    articleAutoCloseWhenThresholdReached: Boolean(form.articleAutoCloseWhenThresholdReached),
    articleAutoAssignWhenThresholdReached: false,
    articleRefundPolicy: "full_on_minimum_not_met",
    pantryMinRequiredBids: intRange(
      "pantryMinRequiredBids",
      fieldLabel("pantryMinBids", "حد أدنى لمناقصات بيت المونة", "Pantry min required bids"),
      1,
      10000,
    ),
    pantryDefaultRequiredBidCount: intRange(
      "pantryDefaultRequiredBidCount",
      fieldLabel("pantryDefaultBids", "الافتراضي لمناقصات بيت المونة", "Pantry default required bids"),
      1,
      10000,
    ),
    pantryAllowedRequiredBidCounts: String(form.pantryAllowedRequiredBidCounts || "10,15,20,30")
      .split(/[,\s]+/)
      .map((s) => Number(s))
      .filter((n) => Number.isInteger(n) && n >= 1),
    pantryAutoCloseWhenThresholdReached: Boolean(form.pantryAutoCloseWhenThresholdReached),
    pantryAutoAssignWhenThresholdReached: false,
    pantryRefundPolicy: "full_on_minimum_not_met",
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
