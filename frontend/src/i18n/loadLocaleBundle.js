import { mergeLocaleNamespaces, resources } from "./resources.js";
import { loadSystemContentTranslations } from "./systemContent.js";

/**
 * Arabic / English namespaces ship statically (core bundle + per-area chunks). German / Dutch / Romanian are
 * loaded on demand as ONE chunk per locale, so a visitor downloads only the language they use.
 * Explicit allowlist switch: no file path is ever built from user input.
 */
function importLocale(locale) {
  switch (locale) {
    case "de":
      return import("../locales/de/index.js");
    case "nl":
      return import("../locales/nl/index.js");
    case "ro":
      return import("../locales/ro/index.js");
    default:
      return null;
  }
}

const loaded = new Set(["ar", "en"]);
const pending = new Map();

export function isLocaleBundleLoaded(locale) {
  return loaded.has(locale);
}

/**
 * Load the static UI bundle and the system-content translations of a lazily loaded locale.
 * Resolves when the locale can render without fallbacks; rejects when the bundle cannot be loaded.
 */
export function ensureLocaleLoaded(locale) {
  if (loaded.has(locale)) return Promise.resolve();
  if (pending.has(locale)) return pending.get(locale);
  const job = importLocale(locale);
  if (!job) return Promise.reject(new Error(`unsupported locale bundle: ${String(locale).slice(0, 8)}`));
  const p = Promise.all([job, loadSystemContentTranslations(locale)])
    .then(([mod]) => {
      const namespaces = mod && mod.default;
      if (!namespaces || typeof namespaces !== "object") throw new Error("invalid locale bundle");
      mergeLocaleNamespaces({ [locale]: namespaces });
      loaded.add(locale);
    })
    .finally(() => {
      pending.delete(locale);
    });
  pending.set(locale, p);
  return p;
}

/** Test hook. */
export function __localeBundleState() {
  return { loaded: [...loaded], resourcesLocales: Object.keys(resources) };
}
