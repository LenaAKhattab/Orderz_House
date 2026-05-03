/**
 * Environment controls for the fake-orders automation runner (setInterval in server.js).
 * Production-safe default: in-process tick is OFF unless explicitly enabled.
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

/** When true, server.js registers setInterval(runAutomationTick). Default false (prod-safe). */
function isInProcessAutomationIntervalEnabled() {
  return parseBoolEnv("FAKE_ORDERS_AUTOMATION_ENABLED", false);
}

/** Minimum 15s; default 60s. */
function getFakeOrdersTickMs() {
  return Math.max(15_000, Number(process.env.FAKE_ORDERS_TICK_MS) || 60_000);
}

/** Log skipped_not_due and similar verbose diagnostics (can be noisy). */
function isFakeOrdersAutomationVerbose() {
  return parseBoolEnv("FAKE_ORDERS_AUTOMATION_VERBOSE", false);
}

/** Secret for POST /api/internal/fake-orders/automation-tick (optional external cron). */
function getAutomationCronSecret() {
  const s = process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET;
  return s && String(s).trim().length >= 16 ? String(s).trim() : null;
}

module.exports = {
  isInProcessAutomationIntervalEnabled,
  getFakeOrdersTickMs,
  isFakeOrdersAutomationVerbose,
  getAutomationCronSecret,
};
