import { BASE_CURRENCY } from "../constants/displayCurrencies.js";
import { localeFromEnFlag } from "../i18n/activeLocale.js";
import { isNewLocale } from "../i18n/systemContent.js";
import { currencyLabel, numberFormatFor } from "./localeFormat.js";

const JOD_OPTIONS = Object.freeze({
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const APPROX_OPTIONS = Object.freeze({
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatJodAmount(amount, { locale = "ar" } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const formatted = numberFormatFor(locale, JOD_OPTIONS).format(n);
  return `${formatted} ${currencyLabel("JOD", locale)}`;
}

/**
 * Approximate converted amount (display only).
 * Arabic / English keep the historical Arabic labels ("ر.س"); German / Dutch / Romanian use their catalog label
 * (ISO code) and number separators. Without `locale`, follows the UI (unchanged for Arabic / English).
 *
 * @param {{ locale?: string }} [options]
 */
export function formatApproximateCurrency(amountJod, targetCurrency, rate, { locale = localeFromEnFlag(false) } = {}) {
  const n = Number(amountJod);
  const r = Number(rate);
  const code = String(targetCurrency || "").toUpperCase();
  if (!Number.isFinite(n) || !Number.isFinite(r) || r <= 0) return null;
  if (!code || code === BASE_CURRENCY) return null;
  const converted = n * r;
  if (!Number.isFinite(converted)) return null;
  const suffix = currencyLabel(code, isNewLocale(locale) ? locale : "ar");
  return `${numberFormatFor(locale, APPROX_OPTIONS).format(converted)} ${suffix}`;
}

export function shouldShowApproximate(displayCurrency, rate) {
  const code = String(displayCurrency || "").toUpperCase();
  const r = Number(rate);
  return Boolean(code && code !== BASE_CURRENCY && Number.isFinite(r) && r > 0);
}
