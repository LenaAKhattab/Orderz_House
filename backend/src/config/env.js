/**
 * Startup validation for environment variables.
 * Never logs secret values — only variable names.
 */

const {
  isInProcessAutomationIntervalEnabled,
  getAutomationCronSecret,
} = require("./fakeOrdersAutomation");
const { printEnvironmentBanner } = require("../utils/databaseEnvironmentSafety");

function isProduction() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

/**
 * Client-facing error debug (stack, internal message) is only sent when explicitly enabled
 * and never in production. Mis-set NODE_ENV=development on a prod host still blocks debug if
 * EXPOSE_ERROR_DEBUG is not true; missing NODE_ENV never enables debug.
 */
function shouldExposeErrorDebug() {
  if (isProduction()) return false;
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === undefined || nodeEnv === null || String(nodeEnv).trim() === "") {
    return false;
  }
  const flag = String(process.env.EXPOSE_ERROR_DEBUG || "").trim().toLowerCase();
  return flag === "true" || flag === "1";
}

function warnProduction(name, detail) {
  // eslint-disable-next-line no-console
  console.warn(`[env] production warning: ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Call immediately after `dotenv.config()` and before loading `db` or `app`.
 * Exits the process when required configuration is missing in production,
 * or when DATABASE_URL is missing in any environment.
 *
 * Does NOT block normal npm run dev merely because backend/.env points at a
 * shared DB or Live Stripe — those risks are gated on migrate/QA tooling instead.
 */
function validateEnv() {
  const missing = [];

  if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
    missing.push("DATABASE_URL");
  }

  const jwt = process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim();
  if (!jwt || jwt.length < 16) {
    missing.push("JWT_SECRET");
  }

  if (!process.env.CLIENT_URL || !String(process.env.CLIENT_URL).trim()) {
    missing.push("CLIENT_URL");
  }

  if (isProduction()) {
    if (!process.env.STRIPE_SECRET_KEY || !String(process.env.STRIPE_SECRET_KEY).trim()) {
      missing.push("STRIPE_SECRET_KEY");
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET || !String(process.env.STRIPE_WEBHOOK_SECRET).trim()) {
      missing.push("STRIPE_WEBHOOK_SECRET");
    }
  }

  for (const key of missing) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variable: ${key}`);
  }

  if (
    missing.length === 0 &&
    isProduction() &&
    String(process.env.CLIENT_URL || "").includes(",")
  ) {
    // eslint-disable-next-line no-console
    console.error(
      "Production CLIENT_URL must be a single origin (no commas). Use CORS_ORIGINS for additional browser origins.",
    );
    process.exit(1);
  }

  if (missing.length === 0 && isProduction()) {
    const clientUrl = String(process.env.CLIENT_URL || "").trim();
    if (/localhost|127\.0\.0\.1/i.test(clientUrl)) {
      // eslint-disable-next-line no-console
      console.error(
        "Production CLIENT_URL must not point at localhost/127.0.0.1 (Stripe success/cancel redirects would break for real users).",
      );
      process.exit(1);
    }
  }

  if (missing.length === 0 && !isProduction()) {
    const clientUrl = String(process.env.CLIENT_URL || "").trim();
    const looksPublicHttps =
      /^https:\/\//i.test(clientUrl) && !/localhost|127\.0\.0\.1/i.test(clientUrl);
    if (looksPublicHttps) {
      // eslint-disable-next-line no-console
      console.error(
        "[env] CRITICAL: CLIENT_URL is a public HTTPS origin but NODE_ENV is not \"production\". " +
          "Origin guard, secure cookies, Stripe startup checks, and in-process schedulers will use development defaults. " +
          "Set NODE_ENV=production on the API host.",
      );
    }
  }

  if (missing.length === 0 && isProduction()) {
    const trustProxy = process.env.TRUST_PROXY;
    if (!trustProxy || !String(trustProxy).trim()) {
      warnProduction(
        "TRUST_PROXY",
        "set TRUST_PROXY=1 when the API runs behind Render/Railway/Fly/nginx",
      );
    }

    if (isInProcessAutomationIntervalEnabled() && !getAutomationCronSecret()) {
      warnProduction(
        "FAKE_ORDERS_AUTOMATION",
        "in-process tick enabled without FAKE_ORDERS_AUTOMATION_CRON_SECRET — risky on multiple instances",
      );
    }

    const { isAutomationDriverConfigured } = require("./fakeOrdersAutomation");
    if (!isAutomationDriverConfigured()) {
      warnProduction(
        "FAKE_ORDERS_AUTOMATION",
        "no automation driver — set FAKE_ORDERS_AUTOMATION_ENABLED=true (single instance) or FAKE_ORDERS_AUTOMATION_CRON_SECRET + external cron POST /api/internal/fake-orders/automation-tick every 1–2 min",
      );
    }

    const {
      getBackendPublicUrl,
      isUnsafeMobileCheckoutPublicUrl,
    } = require("./backendPublicUrl");
    const bridgeOrigin = getBackendPublicUrl();
    if (!String(process.env.BACKEND_PUBLIC_URL || "").trim()) {
      warnProduction(
        "BACKEND_PUBLIC_URL",
        "unset — mobile Stripe return uses CLIENT_URL HTTPS origin when available; set BACKEND_PUBLIC_URL explicitly",
      );
    }
    if (isUnsafeMobileCheckoutPublicUrl(bridgeOrigin)) {
      warnProduction(
        "BACKEND_PUBLIC_URL",
        "resolves to a loopback host — mobile Stripe success/cancel URLs will be unreachable on devices",
      );
    }
  }

  if (missing.length === 0) {
    try {
      printEnvironmentBanner();
    } catch {
      /* banner is best-effort */
    }
    return;
  }

  const mustExit = missing.includes("DATABASE_URL") || isProduction();
  if (mustExit) {
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.warn("Startup allowed in development only; set missing variables before production.");
}

module.exports = {
  validateEnv,
  isProduction,
  shouldExposeErrorDebug,
};
