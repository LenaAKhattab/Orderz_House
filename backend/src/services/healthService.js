const { pool } = require("../config/db");

const getHealthStatus = async () => {
  let database = "disconnected";

  try {
    await pool.query("SELECT 1");
    database = "connected";
  } catch (error) {
    database = "degraded";
  }

  return {
    success: true,
    message: "API is running",
    status: "ok",
    database,
    timestamp: new Date().toISOString(),
  };
};

module.exports = {
  getHealthStatus,
};
