import { CURRENCY_LABELS } from "../constants/displayCurrencies.js";

// Referral amounts arrive from the API in integer fils (1 JOD = 1000). Display only — no math.
const FILS_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatMinorJod(minor, locale = "ar") {
  const n = Number(minor);
  const value = Number.isFinite(n) ? n / 1000 : 0;
  return `${FILS_FORMAT.format(value)} ${locale === "en" ? "JOD" : CURRENCY_LABELS.JOD}`;
}

export function formatCommissionRate(row, locale = "ar") {
  if (row?.calculationMode === "percentage") return `${(Number(row.percentageBps) || 0) / 100}%`;
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
