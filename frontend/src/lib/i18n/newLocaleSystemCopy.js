import { pt } from "../../i18n/activeLocale.js";
import { isNewLocale, normalizeSystemContentSource, translateSystemContent } from "../../i18n/systemContent.js";

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿ]/;

export function containsArabicScript(value) {
  return ARABIC_SCRIPT.test(String(value || ""));
}

/**
 * Old two-locale semantics for helpers that only branched on "en": English and the new Latin locales keep
 * their tag, anything else (Arabic, undefined, unknown) is Arabic.
 * @param {string | null | undefined} locale
 * @returns {string}
 */
export function resolveUiLocale(locale) {
  return locale === "en" || isNewLocale(locale) ? locale : "ar";
}

/**
 * Bilingual SYSTEM copy (plans, taxonomy, FAQ, CMS …) for German / Dutch / Romanian.
 * Order: system-content translation memory (English source, else Arabic) → static catalog key (canonical
 * platform copy) → the source text itself (English, else Arabic) as the emergency fallback.
 * Never use it for user-generated content.
 *
 * @param {string} locale de | nl | ro
 * @param {{ ar?: unknown, en?: unknown, key?: string | null }} values `en` is ignored when it is Arabic script
 * @returns {string}
 */
export function localizeSystemCopyForNewLocale(locale, { ar, en, key } = {}) {
  const arabic = normalizeSystemContentSource(ar);
  const englishRaw = normalizeSystemContentSource(en);
  const english = englishRaw && !containsArabicScript(englishRaw) ? englishRaw : "";
  const source = english || arabic;
  if (source) {
    const hit = translateSystemContent(source, locale);
    if (hit) return hit;
  }
  if (key) {
    const value = pt(key, undefined, locale);
    if (value && value !== key) return value;
  }
  return source;
}
