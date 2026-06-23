/**
 * Environment controls for the fake-orders automation runner (setInterval in server.js).
 * Production: in-process tick OFF unless FAKE_ORDERS_AUTOMATION_ENABLED=true (single instance).
 * Development: in-process tick ON by default unless explicitly disabled.
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

/**
 * When true, server.js registers setInterval(runAutomationTick).
 * - Production default: false (use external cron on multi-instance).
 * - Non-production default: true (local single backend).
 * Set FAKE_ORDERS_AUTOMATION_ENABLED explicitly to override either default.
 */
function isInProcessAutomationIntervalEnabled() {
  const raw = process.env.FAKE_ORDERS_AUTOMATION_ENABLED;
  if (raw !== undefined && String(raw).trim() !== "") {
    return parseBoolEnv("FAKE_ORDERS_AUTOMATION_ENABLED", false);
  }
  return !isProductionNodeEnv();
}

/** True when in-process ticks or a valid cron secret is configured. */
function isAutomationDriverConfigured() {
  return isInProcessAutomationIntervalEnabled() || Boolean(getAutomationCronSecret());
}

/** Minimum 15s; default 60s. Tick frequency — not round duration (see fake_order_settings.duration_value/unit). */
function getFakeOrdersTickMs() {
  return Math.max(15_000, Number(process.env.FAKE_ORDERS_TICK_MS) || 60_000);
}

/** Log skipped_not_due and similar verbose diagnostics (can be noisy). */
function isFakeOrdersAutomationVerbose() {
  return parseBoolEnv("FAKE_ORDERS_AUTOMATION_VERBOSE", false);
}

const WEAK_AUTOMATION_SECRETS = new Set([
  "changeme",
  "change-me",
  "change_me",
  "your_secret",
  "your-secret",
  "secret",
  "test",
  "test123",
  "placeholder",
  "fake_orders_automation_cron_secret",
  "xxxxxxxxxxxxxxxx",
]);

/** Secret for POST /api/internal/fake-orders/automation-tick (optional external cron). */
function getAutomationCronSecret() {
  const s = process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET;
  if (!s) return null;
  const trimmed = String(s).trim();
  if (trimmed.length < 16) return null;
  const lower = trimmed.toLowerCase();
  if (WEAK_AUTOMATION_SECRETS.has(lower)) return null;
  if (/^(.)\1{15,}$/.test(trimmed)) return null;
  return trimmed;
}

function resolveRoundOrderBoundsFromEnv(settings = {}) {
  const envMin = Number(process.env.FAKE_ORDERS_ROUND_MIN);
  const envMax = Number(process.env.FAKE_ORDERS_ROUND_MAX);
  const settingsMin = Number(settings.min_orders);
  const settingsMax = Number(settings.max_orders);
  const minOrders =
    Number.isFinite(envMin) && envMin >= 1 ? Math.floor(envMin) : Math.max(1, settingsMin || 1);
  const maxOrders =
    Number.isFinite(envMax) && envMax >= minOrders
      ? Math.floor(envMax)
      : Math.max(minOrders, settingsMax || minOrders);
  return { minOrders, maxOrders };
}

module.exports = {
  isInProcessAutomationIntervalEnabled,
  isAutomationDriverConfigured,
  isProductionNodeEnv,
  getFakeOrdersTickMs,
  isFakeOrdersAutomationVerbose,
  getAutomationCronSecret,
  resolveRoundOrderBoundsFromEnv,
};
