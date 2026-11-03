/**
 * Resolve a dotted key (e.g. "nav.login") against nested locale messages.
 * @param {Record<string, object>} messages
 * @param {string} key
 * @returns {string | undefined}
 */
function lookupKey(messages, key) {
  if (!messages || !key) return undefined;
  const parts = String(key).split(".");
  let cur = messages;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Interpolate {{var}} placeholders.
 * @param {string} template
 * @param {Record<string, string | number>} [values]
 */
export function interpolate(template, values) {
  if (!values || !template) return template;
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = values[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

/**
 * Emergency fallback chain per locale. Released locales are 100% complete (release gate), so a fallback
 * hit is a defect: it is recorded (see `getMissingTranslationLog`) instead of being silently accepted.
 */
export function fallbackChainFor(locale, fallbackLocale = "ar") {
  if (Array.isArray(fallbackLocale)) return fallbackLocale.filter((l) => l && l !== locale);
  if (locale === "ar") return [];
  if (locale === "en") return fallbackLocale && fallbackLocale !== "en" ? [fallbackLocale] : [];
  // German / Dutch / Romanian: English is the closer emergency fallback for a Latin-script page.
  return ["en", fallbackLocale].filter((l, i, arr) => l && l !== locale && arr.indexOf(l) === i);
}

const missingLog = new Map();
const MISSING_LOG_LIMIT = 500;

function recordMissing(locale, key, resolvedFrom) {
  const id = `${locale}:${key}`;
  if (missingLog.has(id) || missingLog.size >= MISSING_LOG_LIMIT) return;
  missingLog.set(id, { locale, key, resolvedFrom });
  if (typeof console !== "undefined" && typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn(`[i18n] missing ${locale} translation: ${key}${resolvedFrom ? ` (fell back to ${resolvedFrom})` : ""}`);
  }
}

/** Missing translations seen at runtime (QA / untranslated-string detector). */
export function getMissingTranslationLog() {
  return [...missingLog.values()];
}

export function clearMissingTranslationLog() {
  missingLog.clear();
}

/**
 * @param {Record<string, object>} bundle - namespace map for one locale
 * @param {string} key - "namespace.rest.of.key" or "common.actions.retry"
 * @param {string | string[]} [fallbackLocale] - single fallback (legacy signature) or explicit chain
 * @param {Record<string, object>} [allResources]
 * @param {string} [locale] - active locale (enables the per-locale chain + missing-key log)
 */
export function resolveTranslation(bundle, key, fallbackLocale = "ar", allResources = null, locale = null) {
  const raw = String(key || "").trim();
  if (!raw) return "";

  const dot = raw.indexOf(".");
  const ns = dot > 0 ? raw.slice(0, dot) : "common";
  const path = dot > 0 ? raw.slice(dot + 1) : raw;

  let value = lookupKey(bundle[ns], path);
  if (value !== undefined) return value;

  const chain = locale ? fallbackChainFor(locale, fallbackLocale) : [].concat(fallbackLocale || []);
  if (allResources) {
    for (const fb of chain) {
      if (!allResources[fb]) continue;
      value = lookupKey(allResources[fb][ns], path);
      if (value !== undefined) {
        if (locale && locale !== "ar" && locale !== "en") recordMissing(locale, raw, fb);
        return value;
      }
    }
  }
  if (locale && locale !== "ar" && locale !== "en") recordMissing(locale, raw, null);
  return raw;
}

export function createTranslator(locale, allResources, fallbackLocale = "ar") {
  /**
   * @param {string} key
   * @param {Record<string, string | number>} [values]
   */
  return function t(key, values) {
    // Resolve the bundle on each call: lazily loaded locales are merged into `allResources` after creation.
    // A Latin-script locale whose bundle is not loaded yet resolves against English, never Arabic.
    const bundle =
      allResources[locale] ||
      (locale && locale !== "ar" && allResources.en) ||
      allResources[fallbackLocale] ||
      {};
    const resolved = resolveTranslation(bundle, key, fallbackLocale, allResources, locale);
    return interpolate(resolved, values);
  };
}
