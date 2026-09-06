const { pool } = require("../config/db");
const { isProduction } = require("../config/env");
const { isInProcessAutomationIntervalEnabled } = require("../config/fakeOrdersAutomation");

function exposeRuntimeDiagnostics() {
  const raw = String(process.env.HEALTH_RUNTIME_DIAGNOSTICS || "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  // Local/dev: useful by default. Production: opt-in (set HEALTH_RUNTIME_DIAGNOSTICS=1 after deploy).
  return !isProduction();
}

const getHealthStatus = async () => {
  let database = "disconnected";

  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch (error) {
    database = "degraded";
  }

  const payload = {
    success: true,
    message: "API is running",
    status: "ok",
    database,
    timestamp: new Date().toISOString(),
  };

  // Pre-existing public field used by ops UI / checklist — booleans only, no secrets.
  try {
    const {
      isInstitutionalReleaseIntervalEnabled,
      getInstitutionalReleaseTickMs,
    } = require("../config/institutionalReleaseScheduler");
    payload.institutionalReleaseScheduler = {
      processEnabled: isInstitutionalReleaseIntervalEnabled(),
      tickMs: getInstitutionalReleaseTickMs(),
    };
  } catch {
    payload.institutionalReleaseScheduler = { processEnabled: null, tickMs: null };
  }

  if (exposeRuntimeDiagnostics()) {
    const nodeEnvRaw = process.env.NODE_ENV;
    const nodeEnv =
      nodeEnvRaw === undefined || nodeEnvRaw === null || String(nodeEnvRaw).trim() === ""
        ? "unset"
        : String(nodeEnvRaw).trim();
    payload.runtime = {
      nodeEnv,
      fakeOrdersInProcessScheduler: isInProcessAutomationIntervalEnabled(),
    };
  }

  return payload;
};

module.exports = {
  getHealthStatus,
  exposeRuntimeDiagnostics,
};
