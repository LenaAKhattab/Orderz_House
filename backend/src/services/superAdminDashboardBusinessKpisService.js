/**
 * Re-export for route layer clarity.
 */
const businessMetrics = require("./superAdminBusinessMetricsService");

module.exports = {
  getDashboardBusinessKpis: businessMetrics.getDashboardBusinessKpis,
};
