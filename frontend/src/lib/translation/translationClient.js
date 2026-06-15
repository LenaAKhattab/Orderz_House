const CACHE_PREFIX = "oh_tr_cache_v1:";
const CACHE_MAX_ENTRIES = 500;

function cacheKey(text, sourceLang, targetLang) {
  return `${CACHE_PREFIX}${sourceLang}:${targetLang}:${text}`;
}

function readCache(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, value);
    pruneCacheIfNeeded();
  } catch {
    /* ignore quota errors */
  }
}

function pruneCacheIfNeeded() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length <= CACHE_MAX_ENTRIES) return;
    keys.sort();
    const remove = keys.length - CACHE_MAX_ENTRIES;
    for (let i = 0; i < remove; i += 1) {
      localStorage.removeItem(keys[i]);
    }
  } catch {
    /* ignore */
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

/**
 * Translate a single Arabic string to English via backend API.
 * Falls back to source text on failure. Results are cached in localStorage.
 * @param {string} text
 * @param {{ sourceLang?: string; targetLang?: string; skipCache?: boolean }} [options]
 */
export async function translateText(text, options = {}) {
  const sourceLang = options.sourceLang || "ar";
  const targetLang = options.targetLang || "en";
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (targetLang === sourceLang) return raw;

  const key = cacheKey(raw, sourceLang, targetLang);
  if (!options.skipCache) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  try {
    const res = await fetch(`${API_BASE}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text: raw, sourceLang, targetLang }),
    });
    if (!res.ok) return raw;
    const data = await res.json();
    const translated = String(data?.translatedText || "").trim() || raw;
    writeCache(key, translated);
    return translated;
  } catch {
    return raw;
  }
}

/**
 * Batch translate — dedupes input, uses cache, single API call for misses.
 * @param {string[]} texts
 * @param {{ sourceLang?: string; targetLang?: string }} [options]
 * @returns {Promise<Record<string, string>>} map original -> translated
 */
export async function translateBatch(texts, options = {}) {
  const sourceLang = options.sourceLang || "ar";
  const targetLang = options.targetLang || "en";
  const unique = [...new Set((texts || []).map((t) => String(t || "").trim()).filter(Boolean))];
  /** @type {Record<string, string>} */
  const result = {};

  if (targetLang === sourceLang) {
    unique.forEach((t) => {
      result[t] = t;
    });
    return result;
  }

  const misses = [];
  for (const text of unique) {
    const key = cacheKey(text, sourceLang, targetLang);
    const cached = readCache(key);
    if (cached) {
      result[text] = cached;
    } else {
      misses.push(text);
    }
  }

  if (misses.length === 0) return result;

  try {
    const res = await fetch(`${API_BASE}/translate/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ texts: misses, sourceLang, targetLang }),
    });
    if (!res.ok) {
      misses.forEach((t) => {
        result[t] = t;
      });
      return result;
    }
    const data = await res.json();
    const items = Array.isArray(data?.translations) ? data.translations : [];
    items.forEach((item) => {
      const src = String(item?.sourceText || "").trim();
      const tr = String(item?.translatedText || "").trim() || src;
      if (src) {
        result[src] = tr;
        writeCache(cacheKey(src, sourceLang, targetLang), tr);
      }
    });
    misses.forEach((t) => {
      if (!result[t]) result[t] = t;
    });
  } catch {
    misses.forEach((t) => {
      result[t] = t;
    });
  }

  return result;
}

export function clearTranslationCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
