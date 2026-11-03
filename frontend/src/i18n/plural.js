import { pickIntlTag } from "./intlLocale.js";

const rulesCache = new Map();
function pluralCategory(locale, n) {
  const tag = pickIntlTag(locale, { ar: "ar", en: "en-US" });
  if (!rulesCache.has(tag)) rulesCache.set(tag, new Intl.PluralRules(tag));
  return rulesCache.get(tag).select(n);
}

/**
 * Count-dependent translation with real plural rules (Intl.PluralRules), on top of the catalog convention
 * `key` (singular) / `key_plural` (plural):
 *   ar — unchanged historical behaviour (1 → key, otherwise key_plural; Arabic copy is written for it);
 *   en / de / nl — "one" → key, otherwise key_plural;
 *   ro — "one" → key, "few" (0, 2–19, …02–19) → key_plural, "other" (20+, "20 de …") → key_plural_other.
 *
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 * @param {string} locale
 * @param {string} baseKey
 * @param {number} count
 * @param {Record<string, unknown>} [values] extra interpolation values ({{count}} is always provided)
 */
export function tPlural(t, locale, baseKey, count, values = {}) {
  const n = Number(count);
  const vars = { count: Number.isFinite(n) ? n : count, ...values };
  if (!Number.isFinite(n)) return t(`${baseKey}_plural`, vars);
  if (locale === "ar") return t(n === 1 ? baseKey : `${baseKey}_plural`, vars);
  const category = pluralCategory(locale, n);
  if (category === "one") return t(baseKey, vars);
  if (locale === "ro" && category === "other") {
    const otherKey = `${baseKey}_plural_other`;
    const value = t(otherKey, vars);
    if (value !== otherKey) return value;
  }
  return t(`${baseKey}_plural`, vars);
}

/** Plural category for a count in a UI locale (exposed for tests / components with custom keys). */
export function pluralCategoryFor(locale, count) {
  return pluralCategory(locale, Number(count));
}
