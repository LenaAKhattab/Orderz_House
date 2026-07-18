const { pool } = require("../config/db");

const getHealthStatus = async () => {
  let database = "disconnected";

  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch (error) {
    database = "degraded";
  }

  let institutionalReleaseScheduler = null;
  try {
    const {
      isInstitutionalReleaseIntervalEnabled,
      getInstitutionalReleaseTickMs,
    } = require("../config/institutionalReleaseScheduler");
    institutionalReleaseScheduler = {
      processEnabled: isInstitutionalReleaseIntervalEnabled(),
      tickMs: getInstitutionalReleaseTickMs(),
    };
  } catch {
    institutionalReleaseScheduler = { processEnabled: null, tickMs: null };
  }

  return {
    success: true,
    message: "API is running",
    status: "ok",
    database,
    institutionalReleaseScheduler,
    timestamp: new Date().toISOString(),
  };
};

module.exports = {
  getHealthStatus,
};
