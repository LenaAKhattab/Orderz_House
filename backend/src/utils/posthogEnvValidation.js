/**
 * PostHog environment validation (no secrets in return values).
 */

const HOST_CORRECTIONS = {
  "us.posthog.com": "https://us.i.posthog.com",
  "eu.posthog.com": "https://eu.i.posthog.com",
};

/**
 * @param {string} [raw]
 * @returns {{ host: string, corrected: boolean, original: string | null, isDashboardHost: boolean }}
 */
function normalizeHost(raw) {
  const original = String(raw || "https://us.i.posthog.com").trim().replace(/\/+$/, "");
  if (!original) {
    return { host: "https://us.i.posthog.com", corrected: true, original: null, isDashboardHost: false };
  }

  let url;
  try {
    url = new URL(original.startsWith("http") ? original : `https://${original}`);
  } catch {
    return { host: "https://us.i.posthog.com", corrected: false, original, isDashboardHost: false };
  }

  const hostname = url.hostname.toLowerCase();
  const corrected = HOST_CORRECTIONS[hostname];
  if (corrected) {
    return { host: corrected, corrected: true, original, isDashboardHost: true };
  }

  return {
    host: `${url.protocol}//${url.host}`,
    corrected: false,
    original,
    isDashboardHost: hostname === "app.posthog.com",
  };
}

function maskHost(host) {
  try {
    const u = new URL(host);
    return u.host;
  } catch {
    return "invalid-host";
  }
}

/**
 * @returns {{
 *   hogqlReady: boolean,
 *   captureReady: boolean,
 *   host: string,
 *   projectIdPresent: boolean,
 *   personalKeyPresent: boolean,
 *   personalKeyLooksValid: boolean,
 *   apiKeyPresent: boolean,
 *   warnings: Array<{ code: string, message: string, impact: string }>,
 *   errors: Array<{ code: string, message: string, impact: string }>,
 * }}
 */
function validatePosthogEnv() {
  const projectId = String(process.env.POSTHOG_PROJECT_ID || "").trim();
  const personalKey = String(process.env.POSTHOG_PERSONAL_API_KEY || "").trim();
  const apiKey = String(process.env.POSTHOG_API_KEY || "").trim();
  const hostNorm = normalizeHost(process.env.POSTHOG_HOST);
  const host = hostNorm.host;

  /** @type {Array<{ code: string, message: string, impact: string }>} */
  const warnings = [];
  /** @type {Array<{ code: string, message: string, impact: string }>} */
  const errors = [];

  if (!projectId) {
    errors.push({
      code: "POSTHOG_PROJECT_ID_MISSING",
      message: "POSTHOG_PROJECT_ID is not set.",
      impact: "Homepage visitors/active users (HogQL) and Super Admin analytics charts will fail.",
    });
  }

  if (!personalKey) {
    errors.push({
      code: "POSTHOG_PERSONAL_API_KEY_MISSING",
      message: "POSTHOG_PERSONAL_API_KEY is not set.",
      impact: "Cannot query PostHog for homepage hero metrics or admin overview.",
    });
  } else if (personalKey.startsWith("phc_")) {
    errors.push({
      code: "POSTHOG_PERSONAL_API_KEY_INVALID",
      message: "POSTHOG_PERSONAL_API_KEY looks like a project key (phc_), not a Personal API Key.",
      impact: "HogQL queries will fail — use Account settings → Personal API Keys.",
    });
  }

  if (!apiKey) {
    warnings.push({
      code: "POSTHOG_API_KEY_MISSING",
      message: "POSTHOG_API_KEY is not set.",
      impact: "Server-side events (login, orders) will not be sent to PostHog; active users may stay low.",
    });
  } else if (!apiKey.startsWith("phc_")) {
    errors.push({
      code: "POSTHOG_API_KEY_INVALID",
      message: "POSTHOG_API_KEY must be a Project API Key (phc_), not a personal key.",
      impact: "Server-side capture will fail.",
    });
  }

  if (hostNorm.isDashboardHost && hostNorm.corrected) {
    warnings.push({
      code: "POSTHOG_HOST_DASHBOARD_URL",
      message: `POSTHOG_HOST was dashboard URL (${hostNorm.original}); use ${host} for ingestion.`,
      impact: "Update backend .env to match frontend VITE_POSTHOG_HOST.",
    });
  }

  if (hostNorm.original && hostNorm.original.includes("app.posthog.com") && !hostNorm.corrected) {
    warnings.push({
      code: "POSTHOG_HOST_LEGACY",
      message: "POSTHOG_HOST uses app.posthog.com — prefer https://us.i.posthog.com or https://eu.i.posthog.com.",
      impact: "Region may not match HogQL project.",
    });
  }

  const personalKeyLooksValid = Boolean(personalKey && !personalKey.startsWith("phc_"));
  const hogqlReady = Boolean(projectId && personalKeyLooksValid);

  return {
    hogqlReady,
    captureReady: Boolean(apiKey && host),
    host: maskHost(host),
    projectIdPresent: Boolean(projectId),
    personalKeyPresent: Boolean(personalKey),
    personalKeyLooksValid,
    apiKeyPresent: Boolean(apiKey),
    warnings,
    errors,
  };
}

let startupLogged = false;

function logPosthogEnvWarningsOnce() {
  if (startupLogged) return;
  startupLogged = true;
  const v = validatePosthogEnv();
  for (const e of v.errors) {
    // eslint-disable-next-line no-console
    console.warn(`[analytics] ${e.code}: ${e.message} — ${e.impact}`);
  }
  for (const w of v.warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[analytics] ${w.code}: ${w.message} — ${w.impact}`);
  }
}

module.exports = {
  validatePosthogEnv,
  logPosthogEnvWarningsOnce,
  normalizeHost,
};
