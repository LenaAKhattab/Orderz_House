import { BASE_CURRENCY, CURRENCY_LABELS } from "../constants/displayCurrencies.js";

const JOD_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const APPROX_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatJodAmount(amount, { locale = "ar" } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const formatted = JOD_FORMAT.format(n);
  const suffix = locale === "en" ? "JOD" : CURRENCY_LABELS.JOD;
  return `${formatted} ${suffix}`;
}

export function formatApproximateCurrency(amountJod, targetCurrency, rate) {
  const n = Number(amountJod);
  const r = Number(rate);
  const code = String(targetCurrency || "").toUpperCase();
  if (!Number.isFinite(n) || !Number.isFinite(r) || r <= 0) return null;
  if (!code || code === BASE_CURRENCY) return null;
  const converted = n * r;
  if (!Number.isFinite(converted)) return null;
  const suffix = CURRENCY_LABELS[code] || code;
  return `${APPROX_FORMAT.format(converted)} ${suffix}`;
}

export function shouldShowApproximate(displayCurrency, rate) {
  const code = String(displayCurrency || "").toUpperCase();
  const r = Number(rate);
  return Boolean(code && code !== BASE_CURRENCY && Number.isFinite(r) && r > 0);
}
