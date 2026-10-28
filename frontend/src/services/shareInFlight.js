/**
 * Concurrent identical reads share one network request (e.g. the notifications bell and the sidebar badge
 * mounting together). Nothing is cached once the request settles, so later calls always fetch fresh data.
 */
const inFlight = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} run
 * @returns {Promise<T>}
 */
export function shareInFlight(key, run) {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = Promise.resolve()
    .then(run)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
