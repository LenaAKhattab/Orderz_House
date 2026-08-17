/**
 * In-memory TTL + in-flight dedupe for **public, non-sensitive** GETs only.
 * Do not store auth/session, dashboard, orders, financial, claims, or payment data.
 */

export const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;
export const PUBLIC_HOME_STATS_TTL_MS = 20 * 1000;

const store = new Map();
const inflight = new Map();

function isFresh(entry) {
  return Boolean(entry) && entry.expiresAt > Date.now();
}

export function peekPublicCached(key) {
  const entry = store.get(key);
  return isFresh(entry) ? entry.value : undefined;
}

/**
 * @template T
 * @param {string} key endpoint + params (no user/role)
 * @param {() => Promise<T>} fetcher
 * @param {{ ttlMs?: number, bypassCache?: boolean }} [options]
 * @returns {Promise<T>}
 */
export function fetchPublicCached(key, fetcher, { ttlMs = PUBLIC_CACHE_TTL_MS, bypassCache = false } = {}) {
  if (!bypassCache) {
    const cached = peekPublicCached(key);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = Promise.resolve()
    .then(() => fetcher())
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

/** Test-only: drop memory cache between cases. */
export function resetPublicRequestCache() {
  store.clear();
  inflight.clear();
}
