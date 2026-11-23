/**
 * One-time order-claim token kept for this browser tab only (sessionStorage), so a customer who
 * signs in or registers after opening the link comes back to /claim-order automatically.
 */
const KEY = "orderzhouse.pendingOrderClaim";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function storePendingOrderClaim(token) {
  if (!TOKEN_RE.test(String(token || ""))) return;
  try {
    sessionStorage.setItem(KEY, String(token));
  } catch {
    /* storage unavailable — the link still works in this page view */
  }
}

export function readPendingOrderClaim() {
  try {
    const v = sessionStorage.getItem(KEY);
    return v && TOKEN_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearPendingOrderClaim() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
