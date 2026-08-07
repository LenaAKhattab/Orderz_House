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

const VISIT_COUNTER_SESSION_KEY = "oh_visit_counter_session";
export const VISIT_COUNTER_SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Whether the existing homepage counter should increment (once per 30-min activity window).
 * Always updates last-activity so refreshes/navigation extend the window without incrementing.
 * @returns {boolean}
 */
export function shouldIncrementVisitCounter() {
  const now = Date.now();

  if (typeof localStorage === "undefined") {
    return true;
  }

  try {
    const raw = localStorage.getItem(VISIT_COUNTER_SESSION_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.lastActivityAt === "number") {
        if (now - parsed.lastActivityAt < VISIT_COUNTER_SESSION_TTL_MS) {
          localStorage.setItem(VISIT_COUNTER_SESSION_KEY, JSON.stringify({ lastActivityAt: now }));
          return false;
        }
        localStorage.setItem(VISIT_COUNTER_SESSION_KEY, JSON.stringify({ lastActivityAt: now }));
        return true;
      }
      localStorage.setItem(VISIT_COUNTER_SESSION_KEY, JSON.stringify({ lastActivityAt: now }));
      return true;
    }

    localStorage.setItem(VISIT_COUNTER_SESSION_KEY, JSON.stringify({ lastActivityAt: now }));
    return true;
  } catch {
    return true;
  }
}
