const EM_DASH = "—";

/**
 * @param {string} code
 */
export function normalizeStatusCode(code) {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 * @param {string} group
 * @param {string} code
 * @param {string} [fallback] — Arabic or legacy translated fallback when the statuses key is missing
 */
export function statusLabel(t, group, code, fallback) {
  const normalized = normalizeStatusCode(code);
  if (!normalized) {
    if (fallback != null && String(fallback).trim()) return String(fallback).trim();
    return EM_DASH;
  }

  const key = `statuses.${group}.${normalized}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;

  if (fallback != null && String(fallback).trim()) return String(fallback).trim();
  return normalized;
}
