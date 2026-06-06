/**
 * Pageview idempotency for one browser document load + SPA navigations.
 * - New full refresh → new PAGE_LOAD_ID → new pageview.
 * - Same route revisited later → navigationCounter increments → new pageview.
 * - React StrictMode double effect on same navigation → same key → one record.
 */

const PAGE_LOAD_ID = (() => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
})();

let lastLocationSignature = "";
let navigationCounter = 0;

/**
 * @param {string} fullPath
 * @returns {string}
 */
export function buildPageViewIdempotencyKey(fullPath) {
  const sig = String(fullPath || "/");
  if (sig !== lastLocationSignature) {
    lastLocationSignature = sig;
    navigationCounter += 1;
  }
  return `${PAGE_LOAD_ID}:${navigationCounter}`;
}

export function getPageLoadId() {
  return PAGE_LOAD_ID;
}

/**
 * Persistent anonymous client id for active-user dedup (localStorage).
 * @returns {string | null}
 */
export function getClientSessionId() {
  if (typeof localStorage === "undefined") return null;
  try {
    let id = localStorage.getItem("oh_client_sid");
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem("oh_client_sid", id);
    }
    return id;
  } catch {
    return null;
  }
}
