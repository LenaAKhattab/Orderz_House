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
 * @param {Record<string, object>} bundle - namespace map for one locale
 * @param {string} key - "namespace.rest.of.key" or "common.actions.retry"
 * @param {string} [fallbackLocale]
 * @param {Record<string, object>} [allResources]
 */
export function resolveTranslation(bundle, key, fallbackLocale = "ar", allResources = null) {
  const raw = String(key || "").trim();
  if (!raw) return "";

  const dot = raw.indexOf(".");
  const ns = dot > 0 ? raw.slice(0, dot) : "common";
  const path = dot > 0 ? raw.slice(dot + 1) : raw;

  let value = lookupKey(bundle[ns], path);
  if (value !== undefined) return value;

  if (allResources && fallbackLocale && allResources[fallbackLocale]) {
    value = lookupKey(allResources[fallbackLocale][ns], path);
    if (value !== undefined) return value;
  }

  return raw;
}

export function createTranslator(locale, allResources, fallbackLocale = "ar") {
  const bundle = allResources[locale] || allResources[fallbackLocale] || {};

  /**
   * @param {string} key
   * @param {Record<string, string | number>} [values]
   */
  return function t(key, values) {
    const resolved = resolveTranslation(bundle, key, fallbackLocale, allResources);
    return interpolate(resolved, values);
  };
}
