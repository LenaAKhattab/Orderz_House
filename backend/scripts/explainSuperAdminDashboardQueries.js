/**
 * Dev-only EXPLAIN ANALYZE helper for Super Admin dashboard hot queries.
 * Does not modify data. Read-only.
 *
 * Usage (from backend/):
 *   node scripts/explainSuperAdminDashboardQueries.js
 *   node scripts/explainSuperAdminDashboardQueries.js --section=executiveKpis
 *
 * Requires DATABASE_URL in backend/.env
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const SECTIONS = Object.freeze({
  executiveKpis: "getExecutiveKpiComparison",
  ordersIntelligence: "getOrdersIntelligence",
  freelancersIntelligence: "getFreelancersIntelligence",
  coursesIntelligence: "getCoursesIntelligence",
  attentionIntelligence: "getAttentionIntelligence",
});

async function explainQuery(pool, label, sql, params = []) {
  console.log(`\n=== EXPLAIN ANALYZE: ${label} ===\n`);
  const wrapped = `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`;
  const { rows } = await pool.query(wrapped, params);
  for (const row of rows) {
    console.log(row["QUERY PLAN"]);
  }
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--section="));
  const only = arg ? arg.split("=")[1] : null;

  const { pool } = require("../src/config/db");
  const intelligence = require("../src/services/superAdminDashboardIntelligenceService");
  const { CLAIM_STATUSES } = require("../src/services/financialClaimsService");
  const { SUBSCRIPTION_ACTIVATION_STATUSES } = require("../src/services/subscriptionsService");

  try {
    if (!only || only === "executiveKpis") {
      await explainQuery(
        pool,
        "executiveKpis",
        `WITH user_stats AS (
           SELECT COUNT(*)::int AS total_users FROM users
         ) SELECT * FROM user_stats`,
      );
      console.log("(Run full query via service — inspect getExecutiveKpiComparison in intelligence service.)");
      await intelligence.getExecutiveKpiComparison();
      console.log("Service call completed (no EXPLAIN on full ORM path). Re-run with copied SQL from service file.");
    }

    if (!only || only === "ordersIntelligence") {
      await intelligence.getOrdersIntelligence();
      console.log("\nordersIntelligence service call completed — add EXPLAIN wrappers per query in service for detail.");
    }

    if (!only || only === "freelancersIntelligence") {
      await intelligence.getFreelancersIntelligence();
      console.log("\nfreelancersIntelligence service call completed.");
    }

    if (!only || only === "coursesIntelligence") {
      await intelligence.getCoursesIntelligence();
      console.log("\ncoursesIntelligence service call completed.");
    }

    if (!only || only === "attentionIntelligence") {
      await explainQuery(
        pool,
        "attention base counts",
        `SELECT
          (SELECT COUNT(*)::int FROM freelancer_subscriptions WHERE is_current = TRUE AND activation_status = $1) AS pending_activations,
          (SELECT COUNT(*)::int FROM financial_claims WHERE status = 'pending') AS pending_claims_review`,
        [SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING],
      );
      await intelligence.getAttentionIntelligence();
    }

    console.log("\nTip: set SUPERADMIN_DASHBOARD_TIMING=1 and load the dashboard to compare wall-clock vs EXPLAIN.");
    console.log("Sections available:", Object.keys(SECTIONS).join(", "));
    void CLAIM_STATUSES;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
