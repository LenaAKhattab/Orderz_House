/**
 * Startup validation for environment variables.
 * Never logs secret values — only variable names.
 */

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

/**
 * Call immediately after `dotenv.config()` and before loading `db` or `app`.
 * Exits the process when required configuration is missing in production,
 * or when DATABASE_URL is missing in any environment.
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

  for (const key of missing) {
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variable: ${key}`);
  }

  if (missing.length === 0) {
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
