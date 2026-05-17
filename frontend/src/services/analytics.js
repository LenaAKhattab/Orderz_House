import posthog from "posthog-js";
import { resolvePostHogHost, validatePostHogProjectKey } from "../utils/posthogEnv";

const POSTHOG_KEY_RAW = String(import.meta.env.VITE_POSTHOG_KEY || "").trim();
const HOST_RESOLVED = resolvePostHogHost(import.meta.env.VITE_POSTHOG_HOST);
const POSTHOG_KEY_VALIDATION = validatePostHogProjectKey(POSTHOG_KEY_RAW);
const POSTHOG_HOST = HOST_RESOLVED.host;
const ENABLE_DEV_TRACKING = String(import.meta.env.VITE_POSTHOG_ENABLE_IN_DEV || "").trim() === "true";
const IS_PROD = Boolean(import.meta.env.PROD);
const IS_DEV = Boolean(import.meta.env.DEV);

const CONFIG_VALID = Boolean(POSTHOG_HOST) && POSTHOG_KEY_VALIDATION.valid;
const ANALYTICS_ENABLED = CONFIG_VALID && Boolean(POSTHOG_KEY_RAW) && (IS_PROD || ENABLE_DEV_TRACKING);

let initialized = false;
let initBlocked = false;
let currentUserId = null;
let lastPageViewKey = "";
let lastPageviewTrackedAt = null;
let startupChecksDone = false;
const warnedCodes = new Set();

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function debugLog(...args) {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  console.debug("[analytics]", ...args);
}

function warnOnceCode(code, message) {
  if (!canUseDom() || warnedCodes.has(code)) return;
  warnedCodes.add(code);
  // eslint-disable-next-line no-console
  console.warn(`[analytics] ${message}`);
}

function validateFrontendEnv() {
  /** @type {Array<{ code: string, message: string, impact: string }>} */
  const warnings = [];
  /** @type {Array<{ code: string, message: string, impact: string }>} */
  const errors = [];

  if (!POSTHOG_KEY_RAW) {
    errors.push({
      code: "VITE_POSTHOG_KEY_MISSING",
      message: "VITE_POSTHOG_KEY is not set.",
      impact: "Browser pageviews will not be sent — homepage «الزوار» will stay at 0.",
    });
  } else if (!POSTHOG_KEY_VALIDATION.valid) {
    errors.push({
      code: "VITE_POSTHOG_KEY_INVALID",
      message: POSTHOG_KEY_VALIDATION.message,
      impact: "PostHog initialization skipped — visitors counter will not receive browser pageviews.",
    });
  }

  if (HOST_RESOLVED.error) {
    errors.push({
      code: "VITE_POSTHOG_HOST_INVALID",
      message: `VITE_POSTHOG_HOST is not a valid URL (${HOST_RESOLVED.originalHost || "empty"}).`,
      impact: "PostHog initialization skipped.",
    });
  } else if (HOST_RESOLVED.isDashboardHost && HOST_RESOLVED.corrected) {
    warnings.push({
      code: "VITE_POSTHOG_HOST_DASHBOARD_URL",
      message: `Dashboard URL detected (${HOST_RESOLVED.originalHost}). Using ingestion host ${POSTHOG_HOST} instead.`,
      impact: "Fixed automatically — update .env to avoid 404/401 on flags and config.",
    });
  } else if (HOST_RESOLVED.isDashboardHost) {
    errors.push({
      code: "VITE_POSTHOG_HOST_DASHBOARD_URL",
      message: "Invalid PostHog host: use https://us.i.posthog.com (ingestion), not the dashboard URL.",
      impact: "PostHog /flags and /config requests fail with 401/404.",
    });
  } else if (HOST_RESOLVED.originalHost?.includes("app.posthog.com")) {
    warnings.push({
      code: "VITE_POSTHOG_HOST_LEGACY",
      message: "app.posthog.com is legacy — prefer https://us.i.posthog.com or https://eu.i.posthog.com for your project region.",
      impact: "May cause region mismatch with HogQL on the server.",
    });
  }

  if (!HOST_RESOLVED.isIngestionHost && POSTHOG_HOST && !HOST_RESOLVED.corrected) {
    warnings.push({
      code: "VITE_POSTHOG_HOST_UNUSUAL",
      message: `PostHog host ${POSTHOG_HOST} is not a standard ingestion host (us.i / eu.i).`,
      impact: "Verify region matches backend POSTHOG_HOST and project.",
    });
  }

  if (IS_DEV && !ENABLE_DEV_TRACKING) {
    warnings.push({
      code: "VITE_POSTHOG_ENABLE_IN_DEV_FALSE",
      message: "VITE_POSTHOG_ENABLE_IN_DEV is false.",
      impact: "PostHog dev tracking disabled — visitors counter will remain 0.",
    });
  }

  if (IS_DEV && POSTHOG_KEY_RAW && !ENABLE_DEV_TRACKING) {
    warnOnceCode(
      "dev_tracking_off",
      "[analytics] PostHog dev tracking disabled — visitors counter will remain 0. Set VITE_POSTHOG_ENABLE_IN_DEV=true in frontend/.env to test locally.",
    );
  }

  return {
    trackingEnabled: ANALYTICS_ENABLED,
    configValid: CONFIG_VALID,
    isProd: IS_PROD,
    isDev: IS_DEV,
    devTrackingEnabled: ENABLE_DEV_TRACKING,
    hasKey: Boolean(POSTHOG_KEY_RAW),
    keyValid: POSTHOG_KEY_VALIDATION.valid,
    host: POSTHOG_HOST || "",
    hostOriginal: HOST_RESOLVED.originalHost,
    hostCorrected: HOST_RESOLVED.corrected,
    ingestionHostValid: Boolean(HOST_RESOLVED.isIngestionHost || HOST_RESOLVED.corrected),
    region: HOST_RESOLVED.region,
    initialized,
    initBlocked,
    flagsDisabled: true,
    lastPageviewTrackedAt,
    warnings,
    errors,
  };
}

export function runAnalyticsStartupChecks() {
  if (!canUseDom() || startupChecksDone) return validateFrontendEnv();
  startupChecksDone = true;

  const v = validateFrontendEnv();
  debugLog("startup", {
    trackingEnabled: v.trackingEnabled,
    host: v.host,
    hostCorrected: v.hostCorrected,
    isDev: v.isDev,
    devTrackingEnabled: v.devTrackingEnabled,
  });

  for (const e of v.errors) {
    warnOnceCode(e.code, `${e.code}: ${e.message} — ${e.impact}`);
  }
  for (const w of v.warnings) {
    warnOnceCode(w.code, `${w.code}: ${w.message} — ${w.impact}`);
  }

  if (HOST_RESOLVED.corrected && POSTHOG_HOST) {
    warnOnceCode(
      "host_auto_corrected",
      `[analytics] PostHog host auto-corrected to ${POSTHOG_HOST}. Set VITE_POSTHOG_HOST=${POSTHOG_HOST} in frontend/.env.`,
    );
  }

  return v;
}

export function getAnalyticsDiagnostics() {
  return validateFrontendEnv();
}

export function isAnalyticsEnabled() {
  return ANALYTICS_ENABLED;
}

export function isDevTrackingDisabled() {
  return IS_DEV && !ENABLE_DEV_TRACKING;
}

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

export function initAnalytics() {
  runAnalyticsStartupChecks();

  if (!ANALYTICS_ENABLED || !canUseDom() || initialized || initBlocked) {
    if (!CONFIG_VALID && POSTHOG_KEY_RAW && (IS_PROD || ENABLE_DEV_TRACKING)) {
      debugLog("init skipped — invalid PostHog configuration");
    } else if (!ANALYTICS_ENABLED && IS_DEV) {
      debugLog("init skipped — tracking disabled");
    }
    return;
  }

  if (!POSTHOG_HOST) {
    initBlocked = true;
    warnOnceCode("init_no_host", "[analytics] PostHog initialization skipped due to invalid configuration (host).");
    return;
  }

  try {
    posthog.init(POSTHOG_KEY_RAW, {
      api_host: POSTHOG_HOST,
      ...(HOST_RESOLVED.uiHost ? { ui_host: HOST_RESOLVED.uiHost } : {}),
      capture_pageview: false,
      autocapture: false,
      persistence: "localStorage+cookie",
      disable_session_recording: true,
      advanced_disable_flags: true,
      advanced_disable_decide: true,
      disable_persistence: false,
    });
    initialized = true;
    debugLog("initialized", { api_host: POSTHOG_HOST, flags: "disabled" });
  } catch (err) {
    initBlocked = true;
    // eslint-disable-next-line no-console
    console.warn("[analytics] init failed:", err?.message || err);
  }
}

export function trackPageView(path, title = "") {
  runAnalyticsStartupChecks();
  if (!ANALYTICS_ENABLED || !path) {
    debugLog("pageview skipped", { path, reason: !ANALYTICS_ENABLED ? "disabled" : "empty_path" });
    return;
  }
  initAnalytics();
  if (!initialized) return;

  const key = `${path}::${title || ""}`;
  if (lastPageViewKey === key) return;
  lastPageViewKey = key;
  const href = typeof window !== "undefined" ? window.location.href : undefined;
  try {
    posthog.capture("$pageview", {
      path,
      title: title || undefined,
      $current_url: href,
    });
    lastPageviewTrackedAt = new Date().toISOString();
    debugLog("pageview captured", { path, at: lastPageviewTrackedAt });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[analytics] pageview capture failed:", err?.message || err);
  }
}

export function trackEvent(name, params = {}) {
  if (!ANALYTICS_ENABLED || !name) return;
  initAnalytics();
  if (!initialized) return;
  try {
    posthog.capture(name, sanitizeEventParams(params));
    debugLog("event", name);
  } catch (err) {
    debugLog("event failed", name, err?.message);
  }
}

export function setAnalyticsUser(user) {
  if (!ANALYTICS_ENABLED) return;
  const rawId = user?.id ?? user?.userId ?? null;
  const nextUserId = rawId != null ? String(rawId).trim() : "";
  if (!nextUserId || nextUserId === currentUserId) return;
  currentUserId = nextUserId;
  initAnalytics();
  if (!initialized) return;
  const role = user?.primaryRole || user?.role;
  posthog.identify(currentUserId, role ? { role: String(role) } : undefined);
}

export function clearAnalyticsUser() {
  if (!ANALYTICS_ENABLED) return;
  currentUserId = null;
  lastPageViewKey = "";
  initAnalytics();
  if (!initialized) return;
  posthog.reset();
}
