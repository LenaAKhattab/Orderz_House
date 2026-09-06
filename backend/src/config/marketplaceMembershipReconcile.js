/**
 * Marketplace Membership cycle reconciliation driver config (Phase 3).
 * Idempotent DB reconciliation — not a memory-only timer as source of truth.
 */

function parseBoolEnv(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") {
    return defaultValue;
  }
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return defaultValue;
}

function isProductionNodeEnv() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

const WEAK_SECRETS = new Set([
  "changeme",
  "change-me",
  "secret",
  "test",
  "test123",
  "placeholder",
  "xxxxxxxxxxxxxxxx",
]);

/** Secret for POST /api/internal/marketplace-memberships/reconcile-tick */
function getMarketplaceMembershipReconcileSecret() {
  const s = process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_SECRET;
  if (!s) return null;
  const trimmed = String(s).trim();
  if (trimmed.length < 16) return null;
  const lower = trimmed.toLowerCase();
  if (WEAK_SECRETS.has(lower)) return null;
  if (/^(.)\1{15,}$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * In-process interval (optional). Production default OFF.
 * DB timestamps + reconcileMembershipCycles remain the source of truth.
 */
function isInProcessMembershipReconcileEnabled() {
  const raw = process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED;
  if (raw !== undefined && String(raw).trim() !== "") {
    return parseBoolEnv("MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED", false);
  }
  return !isProductionNodeEnv();
}

function getMarketplaceMembershipReconcileTickMs() {
  return Math.max(60_000, Number(process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_TICK_MS) || 300_000);
}

module.exports = {
  getMarketplaceMembershipReconcileSecret,
  isInProcessMembershipReconcileEnabled,
  getMarketplaceMembershipReconcileTickMs,
};
