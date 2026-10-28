export function isBrowserNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserPermission() {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserPermission() {
  if (!isBrowserNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function permissionToStoredStatus(permission) {
  if (permission === "granted") return "accepted";
  if (permission === "denied") return "rejected";
  return "pending";
}

/**
 * Show a native browser notification (foreground tab — no service worker required).
 */
export function showBrowserNotification({ title, body, link, tag }) {
  if (!isBrowserNotificationSupported()) return null;
  if (Notification.permission !== "granted") return null;

  // Follow the UI language (set on <html lang> by the language provider).
  const lang = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ar";
  const n = new Notification(title || (lang === "en" ? "New notification" : "إشعار جديد"), {
    body: body || "",
    tag: tag || undefined,
    icon: "/logo.png",
    dir: lang === "en" ? "ltr" : "rtl",
    lang,
  });

  n.onclick = (ev) => {
    ev.preventDefault();
    window.focus();
    if (link) {
      const path = String(link).startsWith("http") ? link : `${window.location.origin}${link.startsWith("/") ? link : `/${link}`}`;
      window.location.assign(path);
    }
    n.close();
  };

  return n;
}
