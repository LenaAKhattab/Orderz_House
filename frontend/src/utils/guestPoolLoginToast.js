/** Guest pool marketplace — login required before order details / participation. */
export const GUEST_POOL_LOGIN_TITLE = "تسجيل الدخول مطلوب";
export const GUEST_POOL_LOGIN_MESSAGE = "سجّل دخولك لعرض تفاصيل الطلبات والتقدم إليها.";

/** @deprecated Legacy copy — kept for toast dismissal matching during transition. */
const LEGACY_GUEST_POOL_LOGIN_MESSAGE = "سجّل دخولك لعرض التفاصيل والمشاركة في الطلبات.";

export const LOGIN_SUCCESS_TITLE = "تم تسجيل الدخول";
export const LOGIN_SUCCESS_MESSAGE = "مرحباً بعودتك.";

export const PASSWORD_RESET_LOGIN_TITLE = "تم تحديث كلمة المرور";
export const PASSWORD_RESET_LOGIN_MESSAGE = "يمكنك تسجيل الدخول بحسابك الآن.";

export const FILE_ACCESS_LOGIN_TITLE = "تسجيل الدخول مطلوب";
export const FILE_ACCESS_LOGIN_MESSAGE = "سجّل دخولك لعرض ملفات الطلب.";

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
  const msg = String(toast?.message || "");
  const isCurrent =
    toast?.type === "info" &&
    toast?.title === GUEST_POOL_LOGIN_TITLE &&
    msg === GUEST_POOL_LOGIN_MESSAGE;
  const isLegacy =
    toast?.type === "success" &&
    toast?.title === "تم" &&
    (msg === GUEST_POOL_LOGIN_MESSAGE || msg === LEGACY_GUEST_POOL_LOGIN_MESSAGE);
  return isCurrent || isLegacy;
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
    type: "info",
    title: GUEST_POOL_LOGIN_TITLE,
    message: GUEST_POOL_LOGIN_MESSAGE,
  });
}

const ROUTE_TOAST_COOLDOWN_MS = 1500;
let lastRouteToastKey = "";
let lastRouteToastAt = 0;

function loginRouteMessagePayload(message) {
  const text = String(message || "").trim();
  if (!text) return null;
  if (text.includes("كلمة المرور") && text.includes("تسجيل الدخول")) {
    return {
      type: "success",
      title: PASSWORD_RESET_LOGIN_TITLE,
      message: PASSWORD_RESET_LOGIN_MESSAGE,
    };
  }
  return {
    type: "info",
    title: "متابعة من النظام",
    message: text,
  };
}

/** Login page route-state messages (e.g. forgot-password) — deduped, not for browser POP. */
export function pushLoginRouteMessageToast(success, message) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (text === GUEST_POOL_LOGIN_MESSAGE || text === LEGACY_GUEST_POOL_LOGIN_MESSAGE) return false;
  const now = Date.now();
  if (text === lastRouteToastKey && now - lastRouteToastAt < ROUTE_TOAST_COOLDOWN_MS) return false;
  lastRouteToastKey = text;
  lastRouteToastAt = now;
  const payload = loginRouteMessagePayload(text);
  if (!payload) return false;
  success(payload);
  return true;
}
