/**
 * Server-to-server Bildazo author link/create (Phase 1B).
 * Separate from BILDAZO_AUTHOR_GATE_ENABLED (article-apply block).
 * Default OFF: no HTTP call to Bildazo. Secrets stay in backend env only.
 */

function truthy(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function parseTimeoutMs(raw = process.env.BILDAZO_AUTHOR_SYNC_TIMEOUT_MS) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1000) return 8000;
  return Math.min(Math.floor(n), 30000);
}

function isBildazoAuthorSyncEnabled() {
  return truthy(process.env.BILDAZO_AUTHOR_SYNC_ENABLED);
}

function getBildazoAuthorSyncConfig() {
  const enabled = isBildazoAuthorSyncEnabled();
  const baseUrl = String(process.env.BILDAZO_API_BASE_URL || "").trim();
  const secret = String(process.env.BILDAZO_ORDERZHOUSE_INTEGRATION_SECRET || "").trim();
  return {
    enabled,
    baseUrl,
    secret,
    timeoutMs: parseTimeoutMs(),
    configured: Boolean(baseUrl && secret),
  };
}

module.exports = {
  isBildazoAuthorSyncEnabled,
  getBildazoAuthorSyncConfig,
};
