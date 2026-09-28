export const DEFAULT_LOCALE = "ar";
export const SUPPORTED_LOCALES = ["ar", "en"];
export const LOCALE_STORAGE_KEY = "orderzhouse.locale";
export const LEGACY_LOCALE_STORAGE_KEY = "oh_locale";

export function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.includes(String(value || "").trim());
}

export function getLocaleDirection(locale) {
  return locale === "en" ? "ltr" : "rtl";
}

export function readStoredLocale(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY) || storage?.getItem(LEGACY_LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}
