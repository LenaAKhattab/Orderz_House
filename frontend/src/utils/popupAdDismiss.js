const DAY_KEY_PREFIX = "oh_popup_ad_day_";
const SESSION_KEY_PREFIX = "oh_popup_ad_sess_";
const VISIT_KEY_PREFIX = "oh_popup_ad_visit_";
const FIRST_LOGIN_KEY_PREFIX = "popup_ad_first_login_seen_";
const EVERY_LOGIN_KEY_PREFIX = "popup_ad_every_login_seen_";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizePath(pathname) {
  const raw = String(pathname || "/").trim();
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function requiresAuthenticatedUser(freq) {
  return freq === "first_login_only" || freq === "every_login";
}

/**
 * @param {string|number} userId
 * @param {string|number} adId
 */
export function firstLoginSeenStorageKey(userId, adId) {
  return `${FIRST_LOGIN_KEY_PREFIX}${userId}_${adId}`;
}

/**
 * @param {string|number} userId
 * @param {string|number} adId
 */
export function everyLoginSeenStorageKey(userId, adId) {
  return `${EVERY_LOGIN_KEY_PREFIX}${userId}_${adId}`;
}

/**
 * Clears per-login-session popup dismissals so every_login ads can show again after logout.
 * @param {string|number|null|undefined} userId
 */
export function clearEveryLoginPopupDismissals(userId) {
  if (userId == null || userId === "" || typeof sessionStorage === "undefined") return;
  const prefix = `${EVERY_LOGIN_KEY_PREFIX}${userId}_`;
  const keysToRemove = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
}

/**
 * @param {import("../types/popupAd.js").PopupAd} ad
 * @param {string} pathname
 * @param {{ userId?: string|number|null, isAuthenticated?: boolean }} [options]
 */
export function isPopupAdDismissed(ad, pathname, { userId = null, isAuthenticated = false } = {}) {
  if (!ad?.id) return true;
  const id = String(ad.id);
  const freq = ad.frequency || "session";
  const path = normalizePath(pathname);

  if (freq === "first_login_only") {
    if (!isAuthenticated || userId == null || userId === "") return true;
    return localStorage.getItem(firstLoginSeenStorageKey(userId, id)) === "1";
  }

  if (freq === "every_login") {
    if (!isAuthenticated || userId == null || userId === "") return true;
    return sessionStorage.getItem(everyLoginSeenStorageKey(userId, id)) === "1";
  }

  if (freq === "every_visit") {
    return sessionStorage.getItem(`${VISIT_KEY_PREFIX}${id}_${path}`) === "1";
  }
  if (freq === "day") {
    return localStorage.getItem(`${DAY_KEY_PREFIX}${id}_${todayKey()}`) === "1";
  }
  return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${id}`) === "1";
}

/**
 * @param {import("../types/popupAd.js").PopupAd} ad
 * @param {string} pathname
 * @param {{ userId?: string|number|null }} [options]
 */
export function markPopupAdDismissed(ad, pathname, { userId = null } = {}) {
  if (!ad?.id) return;
  const id = String(ad.id);
  const freq = ad.frequency || "session";
  const path = normalizePath(pathname);

  if (freq === "first_login_only") {
    if (userId == null || userId === "") return;
    localStorage.setItem(firstLoginSeenStorageKey(userId, id), "1");
    return;
  }

  if (freq === "every_login") {
    if (userId == null || userId === "") return;
    sessionStorage.setItem(everyLoginSeenStorageKey(userId, id), "1");
    return;
  }

  if (freq === "every_visit") {
    sessionStorage.setItem(`${VISIT_KEY_PREFIX}${id}_${path}`, "1");
    return;
  }
  if (freq === "day") {
    localStorage.setItem(`${DAY_KEY_PREFIX}${id}_${todayKey()}`, "1");
    return;
  }
  sessionStorage.setItem(`${SESSION_KEY_PREFIX}${id}`, "1");
}

/**
 * @param {import("../types/popupAd.js").PopupAd[]} ads
 * @param {string} pathname
 * @param {{ userId?: string|number|null, isAuthenticated?: boolean }} [options]
 */
export function pickPopupAdToShow(ads, pathname, { userId = null, isAuthenticated = false } = {}) {
  if (!Array.isArray(ads) || !ads.length) return null;
  for (const ad of ads) {
    if (requiresAuthenticatedUser(ad.frequency) && (!isAuthenticated || userId == null || userId === "")) {
      continue;
    }
    if (!isPopupAdDismissed(ad, pathname, { userId, isAuthenticated })) return ad;
  }
  return null;
}
