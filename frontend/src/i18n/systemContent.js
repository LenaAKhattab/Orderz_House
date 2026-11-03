/**
 * System-authored DB content (plans, categories, FAQ, CMS / legal pages, page blocks …) in German / Dutch /
 * Romanian. Arabic / English keep their existing columns (`field` / `field_en`). For the new locales the
 * platform keeps a translation memory keyed by the hash of the SOURCE text (English when present, else
 * Arabic): `system_content_translations(source_hash, locale, value)`, served by
 * GET /api/i18n/system-content/:locale and loaded once together with the locale bundle.
 *
 * User-generated content (orders, messages, deliveries, profiles) never goes through this module.
 * The hash MUST stay identical to backend/src/utils/systemContentHash.js (shared test vectors).
 */

export function normalizeSystemContentSource(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** cyrb53 (53-bit) → 14 hex chars. Deterministic, sync, identical in Node and browsers. */
export function systemContentHash(text) {
  const str = normalizeSystemContentSource(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

const NEW_LOCALES = new Set(["de", "nl", "ro"]);
/** @type {Map<string, Record<string, string>>} */
const memory = new Map();
const misses = new Map();
const MISS_LIMIT = 300;

export function setSystemContentTranslations(locale, entries) {
  if (!NEW_LOCALES.has(locale)) return;
  memory.set(locale, entries && typeof entries === "object" ? { ...entries } : {});
}

export function hasSystemContentTranslations(locale) {
  return memory.has(locale);
}

/** Fetch the locale's translation memory (public, cacheable). Never throws: a failure is logged as misses. */
export async function loadSystemContentTranslations(locale, { fetchImpl = globalThis.fetch, baseUrl } = {}) {
  if (!NEW_LOCALES.has(locale)) return;
  if (memory.has(locale)) return;
  try {
    const base = baseUrl ?? (await import("../config/apiBase.js")).getApiBaseUrl();
    const res = await fetchImpl(`${base}/i18n/system-content/${locale}`, { credentials: "omit" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    setSystemContentTranslations(locale, body && body.entries);
  } catch (err) {
    memory.set(locale, {});
    if (typeof console !== "undefined") console.warn(`[i18n] system content translations unavailable for ${locale}`);
  }
}

function recordMiss(locale, text) {
  const id = `${locale}:${systemContentHash(text)}`;
  if (misses.has(id) || misses.size >= MISS_LIMIT) return;
  misses.set(id, { locale, hash: systemContentHash(text), excerpt: text.slice(0, 60) });
}

/** System-content strings rendered without a translation (QA / untranslated-string detector). */
export function getMissingSystemContentLog() {
  return [...misses.values()];
}

/**
 * Translate one system-content source string for a new locale.
 * @returns {string | null} translation, or null when the memory has none (caller decides the emergency fallback)
 */
export function translateSystemContent(source, locale) {
  const text = normalizeSystemContentSource(source);
  if (!text || !NEW_LOCALES.has(locale)) return text || null;
  const map = memory.get(locale);
  const value = map ? map[systemContentHash(text)] : undefined;
  if (typeof value === "string" && value.trim()) return value;
  recordMiss(locale, text);
  return null;
}

/**
 * Pick a bilingual system-content value for any UI locale.
 * Arabic / English behave exactly as before (Arabic prefers `ar`, English prefers `en`, each falling back to the
 * other); German / Dutch / Romanian translate the source (English, else Arabic) through the memory, with the
 * source itself as the emergency fallback (recorded as a miss).
 *
 * @param {string} locale
 * @param {{ ar?: unknown, en?: unknown }} values
 */
export function localizeSystemText(locale, { ar, en } = {}) {
  const arText = normalizeSystemContentSource(ar);
  const enText = normalizeSystemContentSource(en);
  if (locale === "ar") return arText || enText;
  if (locale === "en" || !NEW_LOCALES.has(locale)) return enText || arText;
  const source = enText || arText;
  if (!source) return "";
  return translateSystemContent(source, locale) ?? source;
}

export function isNewLocale(locale) {
  return NEW_LOCALES.has(locale);
}
