/**
 * Client-side helpers for Marketplace Economy settings form (باقات العمل).
 * Mirrors backend validation rules — configuration only; no economy execution.
 */

export const MARKETPLACE_ECONOMY_DEFAULT_FORM = Object.freeze({
  workTokenValueJod: "0.100",
  bidTokensPerOrderJod: "1",
  applicationTokenRefundPercentage: "70",
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
  workTokensEnabled: false,
  marketplaceCommissionEnabled: false,
  cashMembershipPaymentsEnabled: false,
  eliteEngineEnabled: false,
  verificationBonusesEnabled: false,
});

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
  return {
    workTokenValueJod: money(settings.workTokenValueJod),
    bidTokensPerOrderJod: money(settings.bidTokensPerOrderJod),
    applicationTokenRefundPercentage: String(
      Number.isFinite(Number(settings.applicationTokenRefundPercentage))
        ? Number(settings.applicationTokenRefundPercentage)
        : "",
    ),
    platformCommissionPercentage: String(
      Number.isFinite(Number(settings.platformCommissionPercentage))
        ? Number(settings.platformCommissionPercentage)
        : "",
    ),
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
    workTokensEnabled: Boolean(settings.workTokensEnabled),
    marketplaceCommissionEnabled: Boolean(settings.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(settings.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(settings.eliteEngineEnabled),
    verificationBonusesEnabled: Boolean(settings.verificationBonusesEnabled),
  };
}

/**
 * Validate form state before PUT. Returns { ok, errors, patch }.
 * On failure, patch is null — caller must not apply optimistic UI.
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

  const patch = {
    workTokenValueJod: moneyPositive("workTokenValueJod", t("قيمة Work Token", "Work Token value")),
    bidTokensPerOrderJod: moneyPositive(
      "bidTokensPerOrderJod",
      t("Tokens لكل دينار", "Tokens per JOD"),
    ),
    applicationTokenRefundPercentage: percent(
      "applicationTokenRefundPercentage",
      t("نسبة الاسترداد", "Refund %"),
    ),
    platformCommissionPercentage: percent(
      "platformCommissionPercentage",
      t("نسبة العمولة", "Commission %"),
    ),
    cashProcessingFeeJod: moneyNonNeg(
      "cashProcessingFeeJod",
      t("رسوم الدفع النقدي", "Cash processing fee"),
    ),
    identityVerificationBonusEnabled: Boolean(form.identityVerificationBonusEnabled),
    identityVerificationBonusTokens: intRange(
      "identityVerificationBonusTokens",
      t("مكافأة توثيق الهوية", "Identity bonus tokens"),
      0,
      1_000_000,
    ),
    payoutMethodVerificationBonusEnabled: Boolean(form.payoutMethodVerificationBonusEnabled),
    payoutMethodVerificationBonusTokens: intRange(
      "payoutMethodVerificationBonusTokens",
      t("مكافأة توثيق الاستلام", "Payout bonus tokens"),
      0,
      1_000_000,
    ),
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
    workTokensEnabled: Boolean(form.workTokensEnabled),
    marketplaceCommissionEnabled: Boolean(form.marketplaceCommissionEnabled),
    cashMembershipPaymentsEnabled: Boolean(form.cashMembershipPaymentsEnabled),
    eliteEngineEnabled: Boolean(form.eliteEngineEnabled),
    verificationBonusesEnabled: Boolean(form.verificationBonusesEnabled),
  };

  const ok = Object.keys(errors).length === 0 && Object.values(patch).every((v) => v !== null);
  return { ok, errors, patch: ok ? patch : null };
}

/** True when all unfinished execution engines are off (Phase 2 safety). */
export function areEconomyEnginesDisabled(settings) {
  if (!settings) return true;
  return (
    !settings.workTokensEnabled &&
    !settings.marketplaceCommissionEnabled &&
    !settings.cashMembershipPaymentsEnabled &&
    !settings.eliteEngineEnabled &&
    !settings.verificationBonusesEnabled
  );
}
