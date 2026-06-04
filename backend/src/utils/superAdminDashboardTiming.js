function shouldLogDashboardTiming() {
  const flag = String(process.env.SUPERADMIN_DASHBOARD_TIMING || "").trim();
  if (flag === "1" || flag === "true") return true;
  if (flag === "0" || flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function logDashboard(line) {
  if (shouldLogDashboardTiming()) {
    console.info(`[superadmin-dashboard] ${line}`);
  }
}

/**
 * @param {string} endpoint
 * @param {string} sectionName
 * @param {() => Promise<T>} fn
 * @param {{ cache?: "hit" | "miss" }} [opts]
 * @returns {Promise<T>}
 */
async function timedDashboardSection(endpoint, sectionName, fn, opts = {}) {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const cachePart = opts.cache ? ` cache=${opts.cache}` : "";
    logDashboard(
      `endpoint=${endpoint} section=${sectionName} duration=${Date.now() - start}ms${cachePart}`,
    );
  }
}

/**
 * @param {string} endpoint
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function timedDashboardEndpoint(endpoint, fn) {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    logDashboard(`endpoint=${endpoint} total=${Date.now() - start}ms`);
  }
}

module.exports = {
  shouldLogDashboardTiming,
  logDashboard,
  timedDashboardSection,
  timedDashboardEndpoint,
};
