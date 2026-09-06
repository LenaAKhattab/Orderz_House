/**
 * Bid Credits reconcile tick secret config — Phase B1.
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

function getBidCreditReconcileSecret() {
  const s = process.env.BID_CREDIT_RECONCILE_SECRET;
  if (!s) return null;
  const trimmed = String(s).trim();
  if (trimmed.length < 16) return null;
  const lower = trimmed.toLowerCase();
  if (WEAK_SECRETS.has(lower)) return null;
  if (/^(.)\1{15,}$/.test(trimmed)) return null;
  return trimmed;
}

function isInProcessBidCreditReconcileEnabled() {
  const raw = process.env.BID_CREDIT_RECONCILE_ENABLED;
  if (raw !== undefined && String(raw).trim() !== "") {
    return parseBoolEnv("BID_CREDIT_RECONCILE_ENABLED", false);
  }
  return !isProductionNodeEnv();
}

function getBidCreditReconcileTickMs() {
  return Math.max(60_000, Number(process.env.BID_CREDIT_RECONCILE_TICK_MS) || 300_000);
}

module.exports = {
  getBidCreditReconcileSecret,
  isInProcessBidCreditReconcileEnabled,
  getBidCreditReconcileTickMs,
};
