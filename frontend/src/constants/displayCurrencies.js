/** Display-only currencies. Official stored amounts remain JOD. */
import { ct, ctAr } from "./constantsI18n.js";

export const BASE_CURRENCY = "JOD";

export const SUPPORTED_DISPLAY_CURRENCIES = [
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
];

/** Currencies with a localized short symbol (catalog: platformConstants.displayCurrencies.symbols.<code>). */
const SYMBOL_CURRENCIES = Object.freeze(["JOD", "SAR", "AED", "QAR", "KWD", "BHD", "OMR", "EGP"]);

/** Arabic short symbols (ISO code for USD / EUR / GBP). */
export const CURRENCY_LABELS = {
  ...Object.fromEntries(SYMBOL_CURRENCIES.map((code) => [code, ctAr(`displayCurrencies.symbols.${code}`)])),
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
};

/** Short currency symbol for a UI locale (default: Arabic, or the active de / nl / ro locale). */
export function displayCurrencySymbol(code, locale) {
  const c = String(code || "").toUpperCase();
  return SYMBOL_CURRENCIES.includes(c) ? ct(`displayCurrencies.symbols.${c}`, undefined, locale) : c;
}

export const PREFERRED_DISPLAY_CURRENCY_STORAGE_KEY = "orderzhouse_preferred_display_currency";

/** Arabic copy (catalog: platformConstants.displayCurrencies.*); use `displayCurrencyCopy(locale)` per locale. */
export const DISPLAY_DISCLAIMER = ctAr("displayCurrencies.disclaimer");
export const OFFICIAL_CURRENCY_COPY = ctAr("displayCurrencies.officialCurrency");
export const INDICATIVE_COPY = ctAr("displayCurrencies.indicative");
export const PREFERENCE_LABEL = ctAr("displayCurrencies.preferenceLabel");
export const PREFERENCE_HINT = ctAr("displayCurrencies.preferenceHint");

/**
 * Currency display copy for a UI locale (default: Arabic, or the active de / nl / ro locale).
 * @param {string} [locale]
 */
export function displayCurrencyCopy(locale) {
  return {
    disclaimer: ct("displayCurrencies.disclaimer", undefined, locale),
    officialCurrencyCopy: ct("displayCurrencies.officialCurrency", undefined, locale),
    indicativeCopy: ct("displayCurrencies.indicative", undefined, locale),
    preferenceLabel: ct("displayCurrencies.preferenceLabel", undefined, locale),
    preferenceHint: ct("displayCurrencies.preferenceHint", undefined, locale),
  };
}

function manualPreferenceLabel(value, locale) {
  if (value === "auto") return ct("displayCurrencies.autoByCountry", undefined, locale);
  const symbol = displayCurrencySymbol(value, locale);
  return symbol && symbol !== value ? `${symbol} (${value})` : value;
}

const MANUAL_PREFERENCE_VALUES = ["auto", "USD", "SAR", "AED", "QAR", "KWD", "BHD", "OMR", "EGP", "EUR", "GBP", "JOD"];

/**
 * Manual preference options. `label` follows the non-English UI branch (Arabic, or the active de / nl / ro
 * locale) — unchanged for Arabic / English; use `manualPreferenceOptions(locale)` for an explicit locale.
 */
export const MANUAL_PREFERENCE_OPTIONS = MANUAL_PREFERENCE_VALUES.map((value) => ({
  value,
  get label() {
    return manualPreferenceLabel(value);
  },
}));

export function manualPreferenceOptions(locale) {
  return MANUAL_PREFERENCE_VALUES.map((value) => ({ value, label: manualPreferenceLabel(value, locale) }));
}
