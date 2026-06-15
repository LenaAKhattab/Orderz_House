import { getTranslation } from "../lib/translation/getTranslation";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../i18n/resources";

const GUEST_LOGIN_TITLE_KEY = "auth.guestLogin.title";
const GUEST_LOGIN_MESSAGE_KEY = "auth.guestLogin.message";
const FILE_ACCESS_TITLE_KEY = "auth.guestLogin.fileAccessTitle";
const FILE_ACCESS_MESSAGE_KEY = "auth.guestLogin.fileAccessMessage";
const PASSWORD_RESET_TITLE_KEY = "auth.forgot.success.passwordResetToastTitle";
const PASSWORD_RESET_MESSAGE_KEY = "auth.forgot.success.passwordResetToastMessage";

/** @deprecated Legacy copy — kept for toast dismissal matching during transition. */
const LEGACY_GUEST_POOL_LOGIN_MESSAGE = "سجّل دخولك لعرض التفاصيل والمشاركة في الطلبات.";

/** @deprecated Use isGuestPoolLoginMessage() — default Arabic message for legacy route-state checks. */
export const GUEST_POOL_LOGIN_MESSAGE = getTranslation(GUEST_LOGIN_MESSAGE_KEY, DEFAULT_LOCALE);

/** @deprecated Use getTranslation with locale — default Arabic title. */
export const GUEST_POOL_LOGIN_TITLE = getTranslation(GUEST_LOGIN_TITLE_KEY, DEFAULT_LOCALE);

export const LOGIN_SUCCESS_TITLE_KEY = "auth.login.successTitle";
export const LOGIN_SUCCESS_MESSAGE_KEY = "auth.login.successMessage";

export const PASSWORD_RESET_LOGIN_TITLE_KEY = PASSWORD_RESET_TITLE_KEY;
export const PASSWORD_RESET_LOGIN_MESSAGE_KEY = PASSWORD_RESET_MESSAGE_KEY;

export const FILE_ACCESS_LOGIN_TITLE_KEY = FILE_ACCESS_TITLE_KEY;
export const FILE_ACCESS_LOGIN_MESSAGE_KEY = FILE_ACCESS_MESSAGE_KEY;

const GUEST_TOAST_COOLDOWN_MS = 4000;
const SESSION_KEY = "oh_guest_pool_login_toast_v1";
let lastGuestPoolToastAt = 0;

function allLocaleTexts(key) {
  return SUPPORTED_LOCALES.map((locale) => getTranslation(key, locale));
}

function matchesAnyLocaleText(text, key) {
  const s = String(text || "").trim();
  if (!s) return false;
  return allLocaleTexts(key).includes(s);
}

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

export function isGuestPoolLoginMessage(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (matchesAnyLocaleText(s, GUEST_LOGIN_MESSAGE_KEY)) return true;
  if (s === LEGACY_GUEST_POOL_LOGIN_MESSAGE) return true;
  return false;
}

export function isGuestPoolLoginToast(toast) {
  const msg = String(toast?.message || "");
  const title = String(toast?.title || "");
  const isCurrent =
    toast?.type === "info" &&
    allLocaleTexts(GUEST_LOGIN_TITLE_KEY).includes(title) &&
    (matchesAnyLocaleText(msg, GUEST_LOGIN_MESSAGE_KEY) || msg === LEGACY_GUEST_POOL_LOGIN_MESSAGE);
  const isLegacy =
    toast?.type === "success" &&
    toast?.title === "تم" &&
    (matchesAnyLocaleText(msg, GUEST_LOGIN_MESSAGE_KEY) || msg === LEGACY_GUEST_POOL_LOGIN_MESSAGE);
  return isCurrent || isLegacy;
}

/**
 * @param {import("../components/ui/toastContext").ToastPush} push
 * @param {(key: string, values?: Record<string, string | number>) => string} [t]
 */
export function pushGuestPoolLoginToast(push, t) {
  const now = Date.now();
  const sessionTs = readSessionTs();
  if (now - sessionTs < GUEST_TOAST_COOLDOWN_MS) return;
  if (now - lastGuestPoolToastAt < GUEST_TOAST_COOLDOWN_MS) return;
  lastGuestPoolToastAt = now;
  writeSessionTs(now);
  const resolve = (key) => (typeof t === "function" ? t(key) : getTranslation(key));
  push({
    type: "info",
    title: resolve(GUEST_LOGIN_TITLE_KEY),
    message: resolve(GUEST_LOGIN_MESSAGE_KEY),
  });
}

const ROUTE_TOAST_COOLDOWN_MS = 1500;
let lastRouteToastKey = "";
let lastRouteToastAt = 0;

function loginRouteMessagePayload(message, t) {
  const text = String(message || "").trim();
  if (!text) return null;

  const resolve = (key) => (typeof t === "function" ? t(key) : getTranslation(key));

  if (matchesAnyLocaleText(text, PASSWORD_RESET_MESSAGE_KEY)) {
    return {
      type: "success",
      title: resolve(PASSWORD_RESET_TITLE_KEY),
      message: resolve(PASSWORD_RESET_MESSAGE_KEY),
    };
  }

  if (text.includes("كلمة المرور") && text.includes("تسجيل الدخول")) {
    return {
      type: "success",
      title: resolve(PASSWORD_RESET_TITLE_KEY),
      message: resolve(PASSWORD_RESET_MESSAGE_KEY),
    };
  }

  return {
    type: "info",
    title: resolve("auth.login.routeSystemTitle"),
    message: text,
  };
}

/**
 * Login page route-state messages (e.g. forgot-password) — deduped, not for browser POP.
 * @param {(payload: object) => void} success
 * @param {string} message
 * @param {(key: string, values?: Record<string, string | number>) => string} [t]
 */
export function pushLoginRouteMessageToast(success, message, t) {
  const text = String(message || "").trim();
  if (!text) return false;
  if (isGuestPoolLoginMessage(text)) return false;
  const now = Date.now();
  if (text === lastRouteToastKey && now - lastRouteToastAt < ROUTE_TOAST_COOLDOWN_MS) return false;
  lastRouteToastKey = text;
  lastRouteToastAt = now;
  const payload = loginRouteMessagePayload(text, t);
  if (!payload) return false;
  success(payload);
  return true;
}

/** Auth toast route state key for password reset success. */
export const AUTH_TOAST_PASSWORD_RESET = "passwordReset";

/**
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getPasswordResetLoginToast(t) {
  return {
    type: "success",
    title: t(PASSWORD_RESET_TITLE_KEY),
    message: t(PASSWORD_RESET_MESSAGE_KEY),
  };
}

/**
 * @param {(key: string, values?: Record<string, string | number>) => string} t
 */
export function getFileAccessLoginToast(t) {
  return {
    type: "info",
    title: t(FILE_ACCESS_TITLE_KEY),
    message: t(FILE_ACCESS_MESSAGE_KEY),
  };
}
