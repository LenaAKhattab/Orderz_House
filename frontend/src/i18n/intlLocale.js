import { LOCALE_META } from "./localePreference.js";

/**
 * BCP 47 tag for Intl formatting.
 * Arabic / English call sites keep their historical tags (passed in `legacy`) so existing output is unchanged;
 * German / Dutch / Romanian use their canonical tag (de-DE, nl-NL, ro-RO).
 *
 * @param {string} locale UI locale
 * @param {{ ar?: string, en?: string }} [legacy] tags the call site used before multi-locale support
 */
export function pickIntlTag(locale, legacy = {}) {
  const loc = String(locale || "").trim();
  if (loc === "ar") return legacy.ar || LOCALE_META.ar.intl;
  if (loc === "en") return legacy.en || LOCALE_META.en.intl;
  return (LOCALE_META[loc] && LOCALE_META[loc].intl) || legacy.ar || LOCALE_META.ar.intl;
}

/**
 * For call sites that used the browser default (`toLocaleString()` / `new Intl.*(undefined, …)`):
 * Arabic / English keep `undefined` (unchanged behaviour); German / Dutch / Romanian get their tag.
 */
export function intlTagOrDefault(locale) {
  const loc = String(locale || "").trim();
  if (loc === "ar" || loc === "en" || !LOCALE_META[loc]) return undefined;
  return LOCALE_META[loc].intl;
}

/** Latin-script UI locale (everything except Arabic). */
export function isLatinUiLocale(locale) {
  return String(locale || "").trim() !== "ar" && Boolean(LOCALE_META[String(locale || "").trim()]);
}

/** Locale-aware number (value never changes; only separators / grouping do). */
export function formatNumberLocale(value, locale, options = {}, legacy = { ar: "en-US", en: "en-US" }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(pickIntlTag(locale, legacy), options).format(n);
}
