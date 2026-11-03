import { pt } from "../i18n/activeLocale.js";
import { pickIntlTag } from "../i18n/intlLocale.js";

/** Tags the money / count helpers used before multi-locale support (Western digits for Arabic and English). */
const LEGACY_LATN_TAGS = Object.freeze({ ar: "en-US", en: "en-US" });

const numberFormats = new Map();

/**
 * Cached Intl.NumberFormat for a UI locale. Arabic / English keep the tag the call site used before (`legacy`,
 * en-US by default); German / Dutch / Romanian get de-DE / nl-NL / ro-RO (e.g. 1.234,56). Values never change.
 *
 * @param {string} locale
 * @param {Intl.NumberFormatOptions} [options]
 * @param {{ ar?: string, en?: string }} [legacy]
 */
export function numberFormatFor(locale, options = {}, legacy = LEGACY_LATN_TAGS) {
  const tag = pickIntlTag(locale, legacy);
  const id = `${tag}|${JSON.stringify(options)}`;
  let fmt = numberFormats.get(id);
  if (!fmt) {
    fmt = new Intl.NumberFormat(tag, options);
    numberFormats.set(id, fmt);
  }
  return fmt;
}

/**
 * Currency label shown after an amount: Arabic abbreviation in Arabic ("د.أ"), the ISO code elsewhere ("JOD").
 * Display only — the amount and the currency itself never change.
 *
 * @param {string} code ISO currency code
 * @param {string} [locale]
 */
export function currencyLabel(code, locale) {
  const c = String(code || "").trim().toUpperCase();
  if (!c) return "";
  const key = `platformUtils.money.currency.${c}`;
  const label = pt(key, undefined, locale);
  return label && label !== key ? label : c;
}

const regionNames = new Map();

/**
 * Localized region name for an ISO 3166-1 alpha-2 code (Intl.DisplayNames). `null` when unavailable.
 *
 * @param {string} code
 * @param {string} locale
 */
export function regionDisplayName(code, locale) {
  const cc = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const tag = pickIntlTag(locale, { ar: "ar", en: "en" });
  if (!regionNames.has(tag)) {
    try {
      regionNames.set(tag, new Intl.DisplayNames([tag], { type: "region" }));
    } catch {
      regionNames.set(tag, null);
    }
  }
  const names = regionNames.get(tag);
  if (!names) return null;
  try {
    const name = names.of(cc);
    return name && name !== cc ? name : null;
  } catch {
    return null;
  }
}
