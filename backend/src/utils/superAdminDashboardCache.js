const { logDashboard, shouldLogDashboardTiming } = require("./superAdminDashboardTiming");

/** @type {Map<string, { value: unknown, expires: number }>} */
const store = new Map();

function getCached(key) {
  const hit = store.get(key);
  if (!hit) return { hit: false, value: null };
  if (hit.expires <= Date.now()) {
    store.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: hit.value };
}

function setCached(key, value, ttlMs) {
  const ttl = Math.max(1000, Math.trunc(Number(ttlMs) || 0));
  store.set(key, { value, expires: Date.now() + ttl });
}

function logCacheAccess(endpoint, key, status) {
  if (!shouldLogDashboardTiming()) return;
  logDashboard(`endpoint=${endpoint} cache=${status} key=${key}`);
}

/**
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} factory
 * @param {{ endpoint?: string }} [opts]
 * @returns {Promise<T>}
 */
async function getOrSet(key, ttlMs, factory, opts = {}) {
  const endpoint = opts.endpoint || "unknown";
  const cached = getCached(key);
  if (cached.hit) {
    logCacheAccess(endpoint, key, "hit");
    return cached.value;
  }

  logCacheAccess(endpoint, key, "miss");
  const value = await factory();
  setCached(key, value, ttlMs);
  return value;
}

function invalidateDashboardCache(prefix) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = {
  getCached,
  setCached,
  getOrSet,
  invalidateDashboardCache,
};
