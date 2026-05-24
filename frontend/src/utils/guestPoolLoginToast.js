/** Shown when a guest tries to open pool order details from the marketplace. */
export const GUEST_POOL_LOGIN_MESSAGE = "سجّل دخولك لعرض التفاصيل والمشاركة في الطلبات.";

const GUEST_TOAST_COOLDOWN_MS = 4000;
const SESSION_KEY = "oh_guest_pool_login_toast_v1";
let lastGuestPoolToastAt = 0;

function readSessionTs() {
  try {
    return Number(sessionStorage.getItem(SESSION_KEY) || 0);
  } catch {
    return 0;
  }
}

function writeSessionTs(ts) {
  try {
    sessionStorage.setItem(SESSION_KEY, String(ts));
  } catch {
    // ignore
  }
}

export function clearGuestPoolLoginToastFlag() {
  lastGuestPoolToastAt = 0;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function isGuestPoolLoginToast(toast) {
  return (
    toast?.type === "success" &&
    toast?.title === "تم" &&
    String(toast?.message || "") === GUEST_POOL_LOGIN_MESSAGE
  );
}

/** Fire at most one guest-login toast per redirect flow (click), never stack duplicates. */
export function pushGuestPoolLoginToast(push) {
  const now = Date.now();
  const sessionTs = readSessionTs();
  if (now - sessionTs < GUEST_TOAST_COOLDOWN_MS) return;
  if (now - lastGuestPoolToastAt < GUEST_TOAST_COOLDOWN_MS) return;
  lastGuestPoolToastAt = now;
  writeSessionTs(now);
  push({
    type: "success",
    title: "تم",
    message: GUEST_POOL_LOGIN_MESSAGE,
  });
}

const ROUTE_TOAST_COOLDOWN_MS = 1500;
let lastRouteToastKey = "";
let lastRouteToastAt = 0;

/** Login page route-state messages (e.g. forgot-password) — deduped, not for browser POP. */
export function pushLoginRouteMessageToast(success, message) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (text === GUEST_POOL_LOGIN_MESSAGE) return false;
  const now = Date.now();
  if (text === lastRouteToastKey && now - lastRouteToastAt < ROUTE_TOAST_COOLDOWN_MS) return false;
  lastRouteToastKey = text;
  lastRouteToastAt = now;
  success({ title: "تم", message: text });
  return true;
}
