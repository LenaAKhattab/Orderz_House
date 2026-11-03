import { isNewLocale } from "../i18n/systemContent.js";
import { currencyLabel, numberFormatFor } from "./localeFormat.js";

// Referral amounts arrive from the API in integer fils (1 JOD = 1000). Display only — no math.
const FILS_OPTIONS = Object.freeze({
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const PERCENT_OPTIONS = Object.freeze({ style: "percent", maximumFractionDigits: 4 });

export function formatMinorJod(minor, locale = "ar") {
  const n = Number(minor);
  const value = Number.isFinite(n) ? n / 1000 : 0;
  return `${numberFormatFor(locale, FILS_OPTIONS).format(value)} ${currencyLabel("JOD", locale)}`;
}

export function formatCommissionRate(row, locale = "ar") {
  if (row?.calculationMode === "percentage") {
    const percent = (Number(row.percentageBps) || 0) / 100;
    // German / Dutch / Romanian: locale percent format ("2,5 %"); Arabic / English unchanged.
    return isNewLocale(locale) ? numberFormatFor(locale, PERCENT_OPTIONS).format(percent / 100) : `${percent}%`;
  }
  if (row?.calculationMode === "fixed") return formatMinorJod(row.fixedAmountMinor, locale);
  return "—";
}

export const COMMISSION_STATUS_TONE = {
  pending: "pending",
  available: "success",
  paid: "active",
  reversed: "danger",
  cancelled: "inactive",
};

export const WITHDRAWAL_STATUS_TONE = {
  pending: "pending",
  approved: "admin_assigned",
  paid: "success",
  rejected: "danger",
  cancelled: "inactive",
};

export function referralErrorMessage(err, t) {
  const code = err?.response?.data?.code;
  const key = code ? `referrals.common.errors.${code}` : null;
  const text = key ? t(key) : null;
  return text && text !== key ? text : t("referrals.common.errors.generic");
}
