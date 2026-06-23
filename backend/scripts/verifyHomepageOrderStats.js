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

const { resolveHomepageTrainingCompletedCutoff } = require("../src/config/homepageTrainingCompletedCutoff");

const {

  trainingPoolVisibleFromSql,

  trainingPoolVisibleWhereSql,

} = require("../src/services/trainingPoolEligibility");

const {

  trainingRotationsCompletedSinceCutoffSql,

  TRAINING_ROTATIONS_COMPLETED_TOTAL_SQL,

} = require("../src/services/publicHomeOrderStatsService");



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



async function sqlBreakdown(cutoff) {

  const whereAny = trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis" });

  const params = [];

  let sinceCutoffSql = "SELECT 0::int";

  if (cutoff) {

    params.push(cutoff.toISOString());

    sinceCutoffSql = trainingRotationsCompletedSinceCutoffSql(1);

  }



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

      (${TRAINING_ROTATIONS_COMPLETED_TOTAL_SQL}) AS training_rotations_completed,

      (${sinceCutoffSql}) AS training_rotations_completed_since_cutoff

    `,

    params,

  );

  const row = rows[0] || {};

  const realCompleted = Number(row.real_completed) || 0;

  const trainingTotal = Number(row.training_rotations_completed) || 0;

  const trainingSinceCutoff = Number(row.training_rotations_completed_since_cutoff) || 0;

  return {

    availableReal: Number(row.available_real) || 0,

    availableTraining: Number(row.available_training) || 0,

    realCompleted,

    trainingRotationsCompletedTotal: trainingTotal,

    trainingRotationsCompletedSinceCutoff: trainingSinceCutoff,

    availableOrdersNow:

      (Number(row.available_real) || 0) + (Number(row.available_training) || 0),

    completedOrders: realCompleted + trainingSinceCutoff,

  };

}



async function main() {

  console.log("=== Homepage Order Stats — Verification ===\n");



  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();



  const cutoff = await resolveHomepageTrainingCompletedCutoff(pool);

  console.log(

    `Cutoff: ${cutoff ? cutoff.toISOString() : "(unset — since-cutoff training = 0)"}\n`,

  );



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

    sql = await sqlBreakdown(cutoff);

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

      "Service matches SQL trainingRotationsCompletedTotal",

      serviceCounts.trainingRotationsCompletedTotal === sql.trainingRotationsCompletedTotal,

      `service=${serviceCounts.trainingRotationsCompletedTotal} sql=${sql.trainingRotationsCompletedTotal}`,

    );

    check(

      "Service matches SQL trainingRotationsCompletedSinceCutoff",

      serviceCounts.trainingRotationsCompletedSinceCutoff === sql.trainingRotationsCompletedSinceCutoff,

      `service=${serviceCounts.trainingRotationsCompletedSinceCutoff} sql=${sql.trainingRotationsCompletedSinceCutoff}`,

    );

    check(

      "completedOrders = completedOrdersReal + trainingRotationsCompletedSinceCutoff",

      serviceCounts.completedOrders ===

        serviceCounts.completedOrdersReal + serviceCounts.trainingRotationsCompletedSinceCutoff,

      `display=${serviceCounts.completedOrders} real=${serviceCounts.completedOrdersReal} sinceCutoff=${serviceCounts.trainingRotationsCompletedSinceCutoff}`,

    );

    check(

      "old training total is not added to completedOrders",

      serviceCounts.trainingRotationsCompletedTotal === 0 ||

        serviceCounts.completedOrders !==

          serviceCounts.completedOrdersReal + serviceCounts.trainingRotationsCompletedTotal ||

        serviceCounts.trainingRotationsCompletedSinceCutoff === 0,

      `display=${serviceCounts.completedOrders} total=${serviceCounts.trainingRotationsCompletedTotal} sinceCutoff=${serviceCounts.trainingRotationsCompletedSinceCutoff}`,

    );

    check(

      "since-cutoff training does not exceed historical total",

      serviceCounts.trainingRotationsCompletedSinceCutoff <= serviceCounts.trainingRotationsCompletedTotal,

      `since=${serviceCounts.trainingRotationsCompletedSinceCutoff} total=${serviceCounts.trainingRotationsCompletedTotal}`,

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

        "API exposes trainingRotationsCompletedTotal breakdown",

        d.trainingRotationsCompletedTotal === serviceCounts.trainingRotationsCompletedTotal,

        `api=${d.trainingRotationsCompletedTotal} service=${serviceCounts.trainingRotationsCompletedTotal}`,

      );

      check(

        "API exposes trainingRotationsCompletedSinceCutoff breakdown",

        d.trainingRotationsCompletedSinceCutoff === serviceCounts.trainingRotationsCompletedSinceCutoff,

        `api=${d.trainingRotationsCompletedSinceCutoff} service=${serviceCounts.trainingRotationsCompletedSinceCutoff}`,

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

    console.log(

      `  breakdown — real: ${d.completedOrdersReal}, training total: ${d.trainingRotationsCompletedTotal}, training since cutoff: ${d.trainingRotationsCompletedSinceCutoff}`,

    );

    if (d.homepageTrainingCompletedCutoffAt) {

      console.log(`  cutoff: ${d.homepageTrainingCompletedCutoffAt}`);

    }

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

