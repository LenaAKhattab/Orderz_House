/**
 * Catalog access for src/constants (namespace `platformConstants`, src/locales/<locale>/platformConstants.json).
 *
 * Many constants historically exposed Arabic (`ar`, `labelAr`, `nameAr`, `*_AR`) and English (`en`, `labelEn`)
 * copies and callers picked one with `isEn ? en : ar`. The non-English branch now means "Arabic, or the active
 * German / Dutch / Romanian UI locale" (see `localeFromEnFlag`), so Arabic and English output stay identical
 * while de / nl / ro render their own catalog text.
 */
import { localeFromEnFlag, pt } from "../i18n/activeLocale.js";
import { isNewLocale } from "../i18n/systemContent.js";
import { pickIntlTag } from "../i18n/intlLocale.js";

export const CONSTANTS_NS = "platformConstants";

/** Full catalog key (`platformConstants.<path>`) — usable with `t()` in components. */
export function constantsKey(path) {
  return `${CONSTANTS_NS}.${path}`;
}

/**
 * Translate a `platformConstants` path. Without `locale`: the historical non-English branch (Arabic, or the
 * active de / nl / ro UI locale; an English UI keeps Arabic there, as before).
 */
export function ct(path, values, locale) {
  return pt(constantsKey(path), values, locale || localeFromEnFlag(false));
}

/** Helpers with a legacy `isEn` flag: English when set, otherwise the non-English branch. `locale` wins. */
export function ctFromEnFlag(path, isEn, values, locale) {
  return pt(constantsKey(path), values, locale || localeFromEnFlag(isEn));
}

/** Arabic catalog text — for exports whose name promises Arabic (`*_AR`). */
export function ctAr(path, values) {
  return pt(constantsKey(path), values, "ar");
}

/** English catalog text — for exports whose name promises English (`*_EN`). */
export function ctEnglish(path, values) {
  return pt(constantsKey(path), values, "en");
}

/**
 * Copy `row` and add catalog-backed label getters.
 * `fields` maps a property name to "local" (non-English branch, see `ct`), "en" or "ar".
 * Adds `labelKey` (full catalog key) unless `keyProp` is false or the row already has that property.
 *
 * @param {Record<string, unknown>} row
 * @param {string} path platformConstants path of the label
 * @param {Record<string, "local" | "en" | "ar">} fields
 * @param {{ keyProp?: string | false }} [options]
 */
export function withCatalogLabels(row, path, fields, { keyProp = "labelKey" } = {}) {
  const out = { ...row };
  if (keyProp && !(keyProp in out)) out[keyProp] = constantsKey(path);
  for (const [prop, mode] of Object.entries(fields)) {
    Object.defineProperty(out, prop, {
      enumerable: true,
      configurable: false,
      get: () => (mode === "en" ? ctEnglish(path) : mode === "ar" ? ctAr(path) : ct(path)),
    });
  }
  return out;
}

const regionNamesCache = new Map();

/**
 * Country name from its ISO-3166 code for German / Dutch / Romanian (Intl.DisplayNames).
 * Returns "" for Arabic / English (callers keep their existing names) or when unavailable.
 */
export function newLocaleRegionName(code, locale = localeFromEnFlag(false)) {
  const iso = String(code || "").trim().toUpperCase();
  if (!iso || !isNewLocale(locale) || typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") {
    return "";
  }
  const tag = pickIntlTag(locale);
  try {
    if (!regionNamesCache.has(tag)) regionNamesCache.set(tag, new Intl.DisplayNames([tag], { type: "region" }));
    const name = regionNamesCache.get(tag).of(iso);
    return name && name !== iso ? name : "";
  } catch {
    return "";
  }
}
