import posthog from "posthog-js";

const POSTHOG_KEY = String(import.meta.env.VITE_POSTHOG_KEY || "").trim();
const POSTHOG_HOST = String(import.meta.env.VITE_POSTHOG_HOST || "https://app.posthog.com").trim() || "https://app.posthog.com";
const ENABLE_DEV_TRACKING = String(import.meta.env.VITE_POSTHOG_ENABLE_IN_DEV || "").trim() === "true";
const IS_PROD = Boolean(import.meta.env.PROD);
const ANALYTICS_ENABLED = Boolean(POSTHOG_KEY) && (IS_PROD || ENABLE_DEV_TRACKING);

let initialized = false;
let currentUserId = null;
let lastPageViewKey = "";

const SENSITIVE_PARAM_KEYS = new Set([
  "email",
  "password",
  "token",
  "secret",
  "card",
  "cvv",
  "iban",
  "phone",
]);

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function sanitizeEventParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (!key || SENSITIVE_PARAM_KEYS.has(String(key).toLowerCase())) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "object") continue;
    out[key] = value;
  }
  return out;
}

export function isAnalyticsEnabled() {
  return ANALYTICS_ENABLED;
}

export function initAnalytics() {
  if (!ANALYTICS_ENABLED || !canUseDom() || initialized) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST.replace(/\/+$/, ""),
    capture_pageview: false,
    autocapture: false,
    persistence: "localStorage+cookie",
    disable_session_recording: true,
  });
  initialized = true;
}

export function trackPageView(path, title = "") {
  if (!ANALYTICS_ENABLED || !path) return;
  initAnalytics();
  const key = `${path}::${title || ""}`;
  if (lastPageViewKey === key) return;
  lastPageViewKey = key;
  const href = typeof window !== "undefined" ? window.location.href : undefined;
  posthog.capture("$pageview", {
    path,
    title: title || undefined,
    $current_url: href,
  });
}

export function trackEvent(name, params = {}) {
  if (!ANALYTICS_ENABLED || !name) return;
  initAnalytics();
  posthog.capture(name, sanitizeEventParams(params));
}

export function setAnalyticsUser(user) {
  if (!ANALYTICS_ENABLED) return;
  const rawId = user?.id ?? user?.userId ?? null;
  const nextUserId = rawId != null ? String(rawId).trim() : "";
  if (!nextUserId || nextUserId === currentUserId) return;
  currentUserId = nextUserId;
  initAnalytics();
  const role = user?.primaryRole || user?.role;
  posthog.identify(currentUserId, role ? { role: String(role) } : undefined);
}

export function clearAnalyticsUser() {
  if (!ANALYTICS_ENABLED) return;
  currentUserId = null;
  lastPageViewKey = "";
  initAnalytics();
  posthog.reset();
}
