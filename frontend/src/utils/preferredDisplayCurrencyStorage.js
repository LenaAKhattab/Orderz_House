import { PREFERRED_DISPLAY_CURRENCY_STORAGE_KEY, SUPPORTED_DISPLAY_CURRENCIES } from "../constants/displayCurrencies";

export function readPreferredDisplayCurrency() {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = String(window.localStorage.getItem(PREFERRED_DISPLAY_CURRENCY_STORAGE_KEY) || "auto").trim();
    if (raw === "auto") return "auto";
    const code = raw.toUpperCase();
    return SUPPORTED_DISPLAY_CURRENCIES.includes(code) ? code : "auto";
  } catch {
    return "auto";
  }
}

export function writePreferredDisplayCurrency(value) {
  if (typeof window === "undefined") return;
  const next = value == null || value === "" ? "auto" : String(value).trim();
  try {
    window.localStorage.setItem(PREFERRED_DISPLAY_CURRENCY_STORAGE_KEY, next);
  } catch {
    /* ignore quota */
  }
}
