/**
 * Post-deploy verification for homepage hero order stats.
 *
 * Usage:
 *   node scripts/verifyHomepageOrderStats.js
 *   VERIFY_API_BASE=http://localhost:5000 node scripts/verifyHomepageOrderStats.js
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("../src/services/trainingPoolEligibility");

const API_BASE = process.env.VERIFY_API_BASE || "http://localhost:5000";
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}`);
  if (detail) console.log(`      ${detail}`);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function sqlBreakdown() {
  const whereAny = trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis" });
  const { rows } = await pool.query(
    `
    SELECT
      (
        SELECT COUNT(*)::int FROM orders o
        WHERE o.order_status = 'open_for_freelancers'
          AND o.is_published = TRUE AND o.is_open_for_pool = TRUE
          AND COALESCE(o.is_archived, FALSE) = FALSE
      ) + (
        SELECT COUNT(*)::int FROM orders o
        WHERE o.order_status = 'open_for_bids'
          AND o.is_published = TRUE AND o.is_open_for_pool = TRUE
          AND COALESCE(o.is_archived, FALSE) = FALSE
      ) AS available_real,
      (
        SELECT COUNT(DISTINCT fo.id)::int
        ${trainingPoolVisibleFromSql("fo")}
        WHERE ${trainingPoolVisibleWhereSql({ publicAudienceOnly: true, alias: "fo" })}
      ) AS available_training,
      (
        SELECT COUNT(*)::int FROM orders
        WHERE order_status = 'completed' AND COALESCE(is_archived, FALSE) = FALSE
      ) AS real_completed,
      (
        SELECT COUNT(*)::int
        FROM fake_orders fo
        WHERE fo.was_marketplace_visible = TRUE
          AND fo.first_visible_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            ${trainingPoolVisibleFromSql("fo_vis")}
            WHERE fo_vis.id = fo.id
              AND ${whereAny}
          )
      ) AS training_rotations_completed
    `,
  );
  const row = rows[0] || {};
  return {
    availableReal: Number(row.available_real) || 0,
    availableTraining: Number(row.available_training) || 0,
    realCompleted: Number(row.real_completed) || 0,
    trainingRotationsCompleted: Number(row.training_rotations_completed) || 0,
    availableOrdersNow:
      (Number(row.available_real) || 0) + (Number(row.available_training) || 0),
    completedOrders:
      (Number(row.real_completed) || 0) + (Number(row.training_rotations_completed) || 0),
  };
}

async function main() {
  console.log("=== Homepage Order Stats — Verification ===\n");

  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();

  let serviceCounts;
  try {
    serviceCounts = await publicHomeOrderStatsService.queryHeroOrderCounts();
    check("Service queryHeroOrderCounts", true);
  } catch (e) {
    check("Service queryHeroOrderCounts", false, e.message);
    serviceCounts = null;
  }

  let sql;
  try {
    sql = await sqlBreakdown();
    check("Read-only SQL breakdown", true);
  } catch (e) {
    check("Read-only SQL breakdown", false, e.message);
    sql = null;
  }

  if (serviceCounts && sql) {
    check(
      "Service matches SQL availableOrdersNow",
      serviceCounts.availableOrdersNow === sql.availableOrdersNow,
      `service=${serviceCounts.availableOrdersNow} sql=${sql.availableOrdersNow}`,
    );
    check(
      "Service matches SQL completedOrders",
      serviceCounts.completedOrders === sql.completedOrders,
      `service=${serviceCounts.completedOrders} sql=${sql.completedOrders}`,
    );
    check(
      "Service matches SQL trainingRotationsCompleted",
      serviceCounts.trainingRotationsCompleted === sql.trainingRotationsCompleted,
      `service=${serviceCounts.trainingRotationsCompleted} sql=${sql.trainingRotationsCompleted}`,
    );
    check(
      "completedOrders = completedOrdersReal + trainingRotationsCompleted",
      serviceCounts.completedOrders ===
        serviceCounts.completedOrdersReal + serviceCounts.trainingRotationsCompleted,
      `display=${serviceCounts.completedOrders} real=${serviceCounts.completedOrdersReal} training=${serviceCounts.trainingRotationsCompleted}`,
    );
  }

  try {
    const api = await fetchJson(`${API_BASE}/api/public/home-stats`);
    const d = api.body?.data || {};
    check("GET /api/public/home-stats returns 200", api.status === 200, `status=${api.status}`);

    if (serviceCounts) {
      check(
        "API availableOrdersNow matches service",
        d.availableOrdersNow === serviceCounts.availableOrdersNow,
        `api=${d.availableOrdersNow} service=${serviceCounts.availableOrdersNow}`,
      );
      check(
        "API completedOrders matches service (display number)",
        d.completedOrders === serviceCounts.completedOrders,
        `api=${d.completedOrders} service=${serviceCounts.completedOrders}`,
      );
      check(
        "API exposes trainingRotationsCompleted breakdown",
        d.trainingRotationsCompleted === serviceCounts.trainingRotationsCompleted,
        `api=${d.trainingRotationsCompleted} service=${serviceCounts.trainingRotationsCompleted}`,
      );
      check(
        "API exposes completedOrdersReal breakdown",
        d.completedOrdersReal === serviceCounts.completedOrdersReal,
        `api=${d.completedOrdersReal} service=${serviceCounts.completedOrdersReal}`,
      );
    }

    console.log("\n--- Homepage display values ---");
    console.log(`الطلبات المتاحة الآن (availableOrdersNow): ${d.availableOrdersNow}`);
    console.log(`الطلبات المنجزة (completedOrders): ${d.completedOrders}`);
    console.log(`  breakdown — real: ${d.completedOrdersReal}, training: ${d.trainingRotationsCompleted}`);
  } catch (e) {
    check("Homepage API", false, e.message);
  }

  const fail = results.filter((r) => !r.pass).length;
  console.log(`\nTotal: ${results.length - fail} pass, ${fail} fail\n`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
