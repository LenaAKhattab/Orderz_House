import { DEFAULT_LOCALE, resources } from "./resources.js";
import { createTranslator } from "./resolveTranslation.js";

/**
 * Module-level view of the UI locale for plain helpers (constants / utils) that are not React components.
 * LanguageProvider keeps it in sync on every render where the locale changes; outside the app (Node tests)
 * it stays on the default locale.
 */
let active = DEFAULT_LOCALE;
const translators = new Map();

export function setActiveLocale(locale) {
  if (locale) active = locale;
}

export function getActiveLocale() {
  return active;
}

export function translatorFor(locale = active) {
  if (!translators.has(locale)) translators.set(locale, createTranslator(locale, resources, DEFAULT_LOCALE));
  return translators.get(locale);
}

/**
 * Locale for helpers that historically took an `isEn` flag: English when asked, otherwise the active locale —
 * except that an explicit "not English" while the UI is English means Arabic (unchanged legacy semantics).
 */
export function localeFromEnFlag(isEn) {
  if (isEn) return "en";
  return active === "en" ? "ar" : active;
}

/** Translate a catalog key for the active (or given) locale from non-component code. */
export function pt(key, values, locale = active) {
  return translatorFor(locale)(key, values);
}
