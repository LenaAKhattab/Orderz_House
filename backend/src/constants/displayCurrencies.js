/** Display-only currencies. Official stored/calculated currency remains JOD. */

const BASE_CURRENCY = "JOD";

const SUPPORTED_DISPLAY_CURRENCIES = Object.freeze([
  "JOD",
  "USD",
  "SAR",
  "AED",
  "QAR",
  "KWD",
  "BHD",
  "OMR",
  "EGP",
  "EUR",
  "GBP",
]);

const MANUAL_PREFERENCE_VALUES = Object.freeze(["auto", ...SUPPORTED_DISPLAY_CURRENCIES]);

const CURRENCY_LABELS_AR = Object.freeze({
  JOD: "د.أ",
  SAR: "ر.س",
  AED: "د.إ",
  QAR: "ر.ق",
  KWD: "د.ك",
  BHD: "د.ب",
  OMR: "ر.ع",
  EGP: "ج.م",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
});

const COUNTRY_TO_CURRENCY = Object.freeze({
  JO: "JOD",
  US: "USD",
  SA: "SAR",
  AE: "AED",
  QA: "QAR",
  KW: "KWD",
  BH: "BHD",
  OM: "OMR",
  EG: "EGP",
  GB: "GBP",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  IE: "EUR",
  FI: "EUR",
  PT: "EUR",
  GR: "EUR",
  LU: "EUR",
  SK: "EUR",
  SI: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  CY: "EUR",
  MT: "EUR",
});

const DISPLAY_DISCLAIMER_AR = "القيمة تقريبية حسب سعر الصرف الحالي.";
const OFFICIAL_CURRENCY_COPY_AR = "العملة الرسمية المعتمدة داخل Orderz House هي الدينار الأردني.";
const INDICATIVE_COPY_AR =
  "القيمة المحوّلة إرشادية فقط ولا تعتبر سعرًا نهائيًا أو التزامًا ماليًا.";

function normalizeDisplayCurrency(raw) {
  if (raw == null || raw === "") return null;
  const code = String(raw).trim().toUpperCase();
  return SUPPORTED_DISPLAY_CURRENCIES.includes(code) ? code : null;
}

function normalizeManualPreference(raw) {
  if (raw == null || raw === "") return "auto";
  const code = String(raw).trim().toLowerCase();
  if (code === "auto") return "auto";
  return normalizeDisplayCurrency(code) || "auto";
}

function currencyForCountry(countryCode) {
  if (!countryCode) return null;
  const cc = String(countryCode).trim().toUpperCase();
  return COUNTRY_TO_CURRENCY[cc] || null;
}

/**
 * Preference order: manual choice → IP country → USD.
 * Converted currency is never used for payments or ledger math.
 */
function resolveDisplayCurrencyChoice({ preferred, countryCode } = {}) {
  const pref = normalizeManualPreference(preferred);
  if (pref !== "auto") {
    return { displayCurrency: pref, source: "user_preference" };
  }
  const fromCountry = currencyForCountry(countryCode);
  if (fromCountry) {
    return { displayCurrency: fromCountry, source: "ip" };
  }
  return { displayCurrency: "USD", source: "fallback" };
}

module.exports = {
  BASE_CURRENCY,
  SUPPORTED_DISPLAY_CURRENCIES,
  MANUAL_PREFERENCE_VALUES,
  CURRENCY_LABELS_AR,
  COUNTRY_TO_CURRENCY,
  DISPLAY_DISCLAIMER_AR,
  OFFICIAL_CURRENCY_COPY_AR,
  INDICATIVE_COPY_AR,
  normalizeDisplayCurrency,
  normalizeManualPreference,
  currencyForCountry,
  resolveDisplayCurrencyChoice,
};
