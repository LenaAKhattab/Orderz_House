/**
 * Institutional order storage release scheduler (independent from fake-order rotation).
 */
const {
  isProductionNodeEnv,
} = require("../config/fakeOrdersAutomation");

function parseBoolEnv(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return defaultValue;
}

function isInstitutionalReleaseIntervalEnabled() {
  const raw = process.env.INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED;
  if (raw !== undefined && String(raw).trim() !== "") {
    return parseBoolEnv("INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED", false);
  }
  return !isProductionNodeEnv();
}

function getInstitutionalReleaseTickMs() {
  return Math.max(15_000, Number(process.env.INSTITUTIONAL_RELEASE_TICK_MS) || 60_000);
}

let intervalId = null;

function startInstitutionalReleaseScheduler() {
  const tickMs = getInstitutionalReleaseTickMs();
  if (!isInstitutionalReleaseIntervalEnabled()) {
    return { enabled: false, tickMs };
  }
  if (intervalId) {
    return { enabled: true, alreadyRunning: true, tickMs };
  }

  const storedOrdersService = require("../services/institutionalStoredOrdersService");
  const runTick = () => {
    storedOrdersService
      .processDueReleaseBatches({ limit: 10 })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[institutionalRelease] tick failed:", err?.message || err);
      });
  };

  setTimeout(runTick, 5000);
  intervalId = setInterval(runTick, tickMs);
  return { enabled: true, tickMs };
}

function isInstitutionalReleaseProcessRunning() {
  return Boolean(intervalId);
}

module.exports = {
  isInstitutionalReleaseIntervalEnabled,
  getInstitutionalReleaseTickMs,
  startInstitutionalReleaseScheduler,
  isInstitutionalReleaseProcessRunning,
};
