/**
 * Shared guards for Postgres integration tests.
 * Never treat placeholder DATABASE_URL values as a real database.
 */
function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

function isPlaceholderDatabaseUrl(url = getDatabaseUrl()) {
  return /placeholder/i.test(url);
}

function isIntegrationEnvConfigured() {
  const url = getDatabaseUrl();
  const jwt = String(process.env.JWT_SECRET || "").trim();
  return Boolean(url) && !isPlaceholderDatabaseUrl(url) && jwt.length >= 16;
}

module.exports = {
  getDatabaseUrl,
  isPlaceholderDatabaseUrl,
  isIntegrationEnvConfigured,
};
