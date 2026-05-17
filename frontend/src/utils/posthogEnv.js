/**
 * PostHog env normalization & validation (browser). No secrets logged.
 */

/** Dashboard / legacy hosts → ingestion API host */
const HOST_CORRECTIONS = Object.freeze({
  "us.posthog.com": "https://us.i.posthog.com",
  "eu.posthog.com": "https://eu.i.posthog.com",
});

/** Optional UI host for toolbar links (not used for capture) */
const UI_HOST_BY_REGION = Object.freeze({
  us: "https://us.posthog.com",
  eu: "https://eu.posthog.com",
});

/**
 * @param {string} [raw]
 * @returns {{
 *   host: string | null,
 *   uiHost: string | null,
 *   region: "us" | "eu" | "unknown",
 *   corrected: boolean,
 *   originalHost: string | null,
 *   isDashboardHost: boolean,
 *   isIngestionHost: boolean,
 *   error: string | null,
 * }}
 */
export function resolvePostHogHost(raw) {
  const original = String(raw || "").trim().replace(/\/+$/, "");
  if (!original) {
    return {
      host: "https://us.i.posthog.com",
      uiHost: UI_HOST_BY_REGION.us,
      region: "us",
      corrected: true,
      originalHost: null,
      isDashboardHost: false,
      isIngestionHost: true,
      error: null,
    };
  }

  let url;
  try {
    url = new URL(original.startsWith("http") ? original : `https://${original}`);
  } catch {
    return {
      host: null,
      uiHost: null,
      region: "unknown",
      corrected: false,
      originalHost: original,
      isDashboardHost: false,
      isIngestionHost: false,
      error: "invalid_url",
    };
  }

  const hostname = url.hostname.toLowerCase();
  const correctedTarget = HOST_CORRECTIONS[hostname];

  if (correctedTarget) {
    const region = hostname.startsWith("eu.") ? "eu" : "us";
    return {
      host: correctedTarget,
      uiHost: UI_HOST_BY_REGION[region],
      region,
      corrected: true,
      originalHost: original,
      isDashboardHost: true,
      isIngestionHost: false,
      error: null,
    };
  }

  const isUsIngestion = hostname === "us.i.posthog.com";
  const isEuIngestion = hostname === "eu.i.posthog.com";
  const isIngestionHost = isUsIngestion || isEuIngestion;
  const region = isEuIngestion ? "eu" : isUsIngestion ? "us" : "unknown";
  const uiHost = isUsIngestion ? UI_HOST_BY_REGION.us : isEuIngestion ? UI_HOST_BY_REGION.eu : null;

  return {
    host: `${url.protocol}//${url.host}`,
    uiHost,
    region,
    corrected: false,
    originalHost: original,
    isDashboardHost: hostname === "app.posthog.com",
    isIngestionHost,
    error: null,
  };
}

/**
 * @param {string} [key]
 */
export function validatePostHogProjectKey(key) {
  const k = String(key || "").trim();
  if (!k) {
    return { valid: false, code: "missing", message: "Missing PostHog project key." };
  }
  if (!k.startsWith("phc_")) {
    return {
      valid: false,
      code: "invalid_prefix",
      message: "VITE_POSTHOG_KEY must be a Project API Key (starts with phc_).",
    };
  }
  if (k.length < 20) {
    return { valid: false, code: "too_short", message: "VITE_POSTHOG_KEY looks truncated." };
  }
  return { valid: true, code: "ok", message: "" };
}
