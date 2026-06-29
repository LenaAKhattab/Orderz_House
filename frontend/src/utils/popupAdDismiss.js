const DAY_KEY_PREFIX = "oh_popup_ad_day_";
const SESSION_KEY_PREFIX = "oh_popup_ad_sess_";
const VISIT_KEY_PREFIX = "oh_popup_ad_visit_";

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

/**
 * @param {import("../types/popupAd.js").PopupAd} ad
 * @param {string} pathname
 */
export function isPopupAdDismissed(ad, pathname) {
  if (!ad?.id) return true;
  const id = String(ad.id);
  const freq = ad.frequency || "session";
  const path = normalizePath(pathname);

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
 */
export function markPopupAdDismissed(ad, pathname) {
  if (!ad?.id) return;
  const id = String(ad.id);
  const freq = ad.frequency || "session";
  const path = normalizePath(pathname);

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
 */
export function pickPopupAdToShow(ads, pathname) {
  if (!Array.isArray(ads) || !ads.length) return null;
  for (const ad of ads) {
    if (!isPopupAdDismissed(ad, pathname)) return ad;
  }
  return null;
}
