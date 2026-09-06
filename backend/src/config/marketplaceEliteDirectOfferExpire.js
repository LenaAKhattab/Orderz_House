/**
 * Elite Direct Offer expiry tick config (Phase 8).
 * DB expires_at + secret-gated cron/tick — not setTimeout as source of truth.
 */

function parseBoolEnv(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") return defaultValue;
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

/** Secret for POST /api/internal/elite-direct-offers/expire-tick */
function getEliteDirectOfferExpireSecret() {
  const s = process.env.ELITE_DIRECT_OFFER_EXPIRE_SECRET;
  if (!s) return null;
  const trimmed = String(s).trim();
  if (trimmed.length < 16) return null;
  const lower = trimmed.toLowerCase();
  if (WEAK_SECRETS.has(lower)) return null;
  if (/^(.)\1{15,}$/.test(trimmed)) return null;
  return trimmed;
}

function isInProcessEliteDirectOfferExpireEnabled() {
  const raw = process.env.ELITE_DIRECT_OFFER_EXPIRE_ENABLED;
  if (raw !== undefined && String(raw).trim() !== "") {
    return parseBoolEnv("ELITE_DIRECT_OFFER_EXPIRE_ENABLED", false);
  }
  return !isProductionNodeEnv();
}

function getEliteDirectOfferExpireTickMs() {
  return Math.max(15_000, Number(process.env.ELITE_DIRECT_OFFER_EXPIRE_TICK_MS) || 60_000);
}

module.exports = {
  getEliteDirectOfferExpireSecret,
  isInProcessEliteDirectOfferExpireEnabled,
  getEliteDirectOfferExpireTickMs,
};
