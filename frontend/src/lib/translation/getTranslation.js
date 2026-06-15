import { resources, DEFAULT_LOCALE } from "../../i18n/resources";
import { resolveTranslation, interpolate } from "../../i18n/resolveTranslation";

/**
 * Non-hook lookup for static locale strings (e.g. utilities, tests).
 * @param {string} key - e.g. "common.actions.retry"
 * @param {string} [locale]
 * @param {Record<string, string | number>} [values]
 */
export function getTranslation(key, locale = DEFAULT_LOCALE, values) {
  const bundle = resources[locale] || resources[DEFAULT_LOCALE];
  const resolved = resolveTranslation(bundle, key, DEFAULT_LOCALE, resources);
  return interpolate(resolved, values);
}
