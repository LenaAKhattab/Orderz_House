import { resources, DEFAULT_LOCALE } from "../../i18n/resources.js";
import { resolveTranslation, interpolate } from "../../i18n/resolveTranslation.js";
import { isNewLocale } from "../../i18n/systemContent.js";

/**
 * Non-hook lookup for static locale strings (e.g. utilities, tests).
 * @param {string} key - e.g. "common.actions.retry"
 * @param {string} [locale]
 * @param {Record<string, string | number>} [values]
 */
export function getTranslation(key, locale = DEFAULT_LOCALE, values) {
  const bundle = resources[locale] || resources[DEFAULT_LOCALE];
  // German / Dutch / Romanian use their emergency chain (English, then Arabic) + missing-key log;
  // Arabic / English resolve exactly as before.
  const chainLocale = isNewLocale(locale) ? locale : null;
  const resolved = resolveTranslation(bundle, key, DEFAULT_LOCALE, resources, chainLocale);
  return interpolate(resolved, values);
}
