import { RELEASED_LOCALES } from "./localeRelease.js";

export const DEFAULT_LOCALE = "ar";
/** Every locale the platform can render. Exposure to users is gated separately (localeRelease.js). */
export const SUPPORTED_LOCALES = Object.freeze(["ar", "en", "de", "nl", "ro"]);
export const LOCALE_STORAGE_KEY = "orderzhouse.locale";
export const LEGACY_LOCALE_STORAGE_KEY = "oh_locale";
/** Internal QA preview of locales that have not passed the release gate yet. */
export const I18N_PREVIEW_STORAGE_KEY = "orderzhouse.i18nPreview";

/**
 * nativeName: selector label (language names, never flags). dir: document direction.
 * intl: BCP 47 tag for Intl formatting of NEW locales (Arabic / English keep their existing per-call tags).
 */
export const LOCALE_META = Object.freeze({
  ar: Object.freeze({ nativeName: "العربية", dir: "rtl", intl: "ar-JO" }),
  en: Object.freeze({ nativeName: "English", dir: "ltr", intl: "en-US" }),
  de: Object.freeze({ nativeName: "Deutsch", dir: "ltr", intl: "de-DE" }),
  nl: Object.freeze({ nativeName: "Nederlands", dir: "ltr", intl: "nl-NL" }),
  ro: Object.freeze({ nativeName: "Română", dir: "ltr", intl: "ro-RO" }),
});

/** Allowlist check — locale values are untrusted input (storage, query string). */
export function isSupportedLocale(value) {
  return SUPPORTED_LOCALES.includes(String(value ?? "").trim());
}

export function isReleasedLocale(value) {
  return RELEASED_LOCALES.includes(String(value ?? "").trim());
}

export function isI18nPreviewEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(I18N_PREVIEW_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Locales a user may select: released ones, plus supported-but-unreleased ones in internal preview. */
export function getSelectableLocales(storage = globalThis.localStorage) {
  const preview = isI18nPreviewEnabled(storage);
  return SUPPORTED_LOCALES.filter((loc) => isReleasedLocale(loc) || preview);
}

export function isSelectableLocale(value, storage = globalThis.localStorage) {
  return getSelectableLocales(storage).includes(String(value ?? "").trim());
}

/** Arabic is the only right-to-left locale; unknown values follow the default (Arabic). */
export function getLocaleDirection(locale) {
  const meta = LOCALE_META[String(locale ?? "").trim()];
  return meta ? meta.dir : LOCALE_META[DEFAULT_LOCALE].dir;
}

export function readStoredLocale(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(LOCALE_STORAGE_KEY) || storage?.getItem(LEGACY_LOCALE_STORAGE_KEY);
    if (isSelectableLocale(stored, storage)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

/**
 * `?i18n_preview=1` enables / `?i18n_preview=0` disables the internal preview (persisted).
 * @returns {boolean} whether preview is enabled after applying the query
 */
export function applyI18nPreviewQuery(search, storage = globalThis.localStorage) {
  try {
    const value = new URLSearchParams(String(search || "")).get("i18n_preview");
    if (value === "1") storage?.setItem(I18N_PREVIEW_STORAGE_KEY, "1");
    if (value === "0") storage?.removeItem(I18N_PREVIEW_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return isI18nPreviewEnabled(storage);
}
