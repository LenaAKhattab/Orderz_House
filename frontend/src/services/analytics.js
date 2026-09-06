import { resolvePostHogHost, validatePostHogProjectKey } from "../utils/posthogEnv";
import { buildPageViewIdempotencyKey, getClientSessionId, shouldIncrementVisitCounter } from "../utils/pageViewNavigation";
import { postPublicPageViewRequest } from "./publicChromeApi";
import { triggerPublicHomeStatsRefetch } from "./publicHomeStatsRefetch";

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
let initPromise = null;
let posthog = null;
let currentUserId = null;
let lastPageviewTrackedAt = null;
let startupChecksDone = false;
const warnedCodes = new Set();
/** @type {Set<string>} */
const emittedPageViewKeys = new Set();

/** @type {Array<{ path: string, title: string }>} */
const pendingPageViews = [];
/** @type {Array<{ name: string, params: Record<string, unknown> }>} */
const pendingEvents = [];
/** @type {Array<{ userId: string, role?: string }>} */
const pendingIdentifies = [];
let pendingReset = false;

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function debugLog(...args) {
  if (!IS_DEV) return;
  console.debug("[analytics]", ...args);
}

function warnOnceCode(code, message) {
  if (!canUseDom() || warnedCodes.has(code)) return;
  warnedCodes.add(code);
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
      impact: "Browser PostHog pageviews will not be sent — local DB counter still works for the homepage hero.",
    });
  } else if (!POSTHOG_KEY_VALIDATION.valid) {
    errors.push({
      code: "VITE_POSTHOG_KEY_INVALID",
      message: POSTHOG_KEY_VALIDATION.message,
      impact: "PostHog initialization skipped — secondary analytics only; homepage hero uses local DB.",
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
      impact: "PostHog dev tracking disabled — homepage hero still uses local DB pageview POST.",
    });
  }

  if (IS_DEV && POSTHOG_KEY_RAW && !ENABLE_DEV_TRACKING) {
    warnOnceCode(
      "dev_tracking_off",
      "[analytics] PostHog dev tracking disabled — homepage hero still records local pageviews. Set VITE_POSTHOG_ENABLE_IN_DEV=true for PostHog secondary analytics.",
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

function flushPendingQueue() {
  if (!initialized || !posthog) return;

  if (pendingReset) {
    pendingReset = false;
    try {
      posthog.reset();
    } catch (err) {
      debugLog("reset failed", err?.message);
    }
  }

  for (const item of pendingIdentifies.splice(0)) {
    try {
      posthog.identify(item.userId, item.role ? { role: item.role } : undefined);
    } catch (err) {
      debugLog("identify failed", err?.message);
    }
  }

  for (const item of pendingPageViews.splice(0)) {
    const href = typeof window !== "undefined" ? window.location.href : undefined;
    try {
      posthog.capture("$pageview", {
        path: item.path,
        title: item.title || undefined,
        $current_url: href,
      });
      lastPageviewTrackedAt = new Date().toISOString();
      debugLog("pageview captured (queued)", { path: item.path, at: lastPageviewTrackedAt });
    } catch (err) {
      console.warn("[analytics] pageview capture failed:", err?.message || err);
    }
  }

  for (const item of pendingEvents.splice(0)) {
    try {
      posthog.capture(item.name, sanitizeEventParams(item.params));
      debugLog("event (queued)", item.name);
    } catch (err) {
      debugLog("event failed", item.name, err?.message);
    }
  }
}

async function ensurePostHogLoaded() {
  if (!ANALYTICS_ENABLED || !canUseDom() || initBlocked) return false;
  if (initialized && posthog) return true;

  if (!POSTHOG_HOST) {
    initBlocked = true;
    warnOnceCode("init_no_host", "[analytics] PostHog initialization skipped due to invalid configuration (host).");
    return false;
  }

  if (!initPromise) {
    initPromise = import("posthog-js")
      .then((mod) => {
        posthog = mod.default;
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
        debugLog("initialized (lazy)", { api_host: POSTHOG_HOST, flags: "disabled" });
        flushPendingQueue();
        return true;
      })
      .catch((err) => {
        initBlocked = true;
        initPromise = null;
        console.warn("[analytics] init failed:", err?.message || err);
        return false;
      });
  }

  await initPromise;
  return initialized;
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

  void ensurePostHogLoaded();
}

async function recordLocalPageView({ path, title, idempotencyKey }) {
  try {
    const referrer = typeof document !== "undefined" ? document.referrer || null : null;
    const res = await postPublicPageViewRequest({
      path,
      title: title || null,
      referrer,
      idempotencyKey,
      clientSessionId: getClientSessionId(),
    });
    triggerPublicHomeStatsRefetch(res?.data?.totalCount, res?.data?.activeUsersLast7Days);
    debugLog("local pageview recorded", { path, idempotencyKey });
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[analytics] local pageview failed:", err?.message || err);
    }
  }
}

export function trackPageView(path, title = "") {
  runAnalyticsStartupChecks();
  const fullPath = path || "/";
  if (!fullPath) {
    debugLog("pageview skipped", { path, reason: "empty_path" });
    return;
  }

  const idempotencyKey = buildPageViewIdempotencyKey(fullPath);
  if (emittedPageViewKeys.has(idempotencyKey)) {
    debugLog("pageview skipped duplicate", { path: fullPath, idempotencyKey });
    return;
  }
  emittedPageViewKeys.add(idempotencyKey);

  if (shouldIncrementVisitCounter()) {
    void recordLocalPageView({ path: fullPath, title, idempotencyKey });
  } else {
    debugLog("visit counter skipped", { path: fullPath, reason: "within_30min_session" });
  }

  if (!ANALYTICS_ENABLED) {
    debugLog("posthog pageview skipped", { path: fullPath, reason: "disabled" });
    return;
  }

  if (!initialized) {
    pendingPageViews.push({ path: fullPath, title });
    void ensurePostHogLoaded();
    return;
  }

  const href = typeof window !== "undefined" ? window.location.href : undefined;
  try {
    posthog.capture("$pageview", {
      path: fullPath,
      title: title || undefined,
      $current_url: href,
    });
    lastPageviewTrackedAt = new Date().toISOString();
    debugLog("pageview captured", { path: fullPath, at: lastPageviewTrackedAt });
  } catch (err) {
    console.warn("[analytics] pageview capture failed:", err?.message || err);
  }
}

export function trackEvent(name, params = {}) {
  if (!ANALYTICS_ENABLED || !name) return;

  if (!initialized) {
    pendingEvents.push({ name, params });
    void ensurePostHogLoaded();
    return;
  }

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
  const role = user?.primaryRole || user?.role;

  if (!initialized) {
    pendingIdentifies.push({ userId: nextUserId, role: role ? String(role) : undefined });
    void ensurePostHogLoaded();
    return;
  }

  posthog.identify(currentUserId, role ? { role: String(role) } : undefined);
}

export function clearAnalyticsUser() {
  if (!ANALYTICS_ENABLED) return;
  currentUserId = null;
  pendingIdentifies.length = 0;

  if (!initialized) {
    pendingReset = true;
    void ensurePostHogLoaded();
    return;
  }

  posthog.reset();
}
