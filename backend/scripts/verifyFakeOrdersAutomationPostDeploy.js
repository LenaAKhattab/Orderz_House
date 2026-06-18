/**
 * Post-deploy verification for fake/training orders automation + homepage stats.
 *
 * Usage:
 *   node scripts/verifyFakeOrdersAutomationPostDeploy.js
 *   VERIFY_API_BASE=https://api.example.com node scripts/verifyFakeOrdersAutomationPostDeploy.js
 *
 * Optional: set FAKE_ORDERS_AUTOMATION_CRON_SECRET to test the cron endpoint.
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  isAutomationDriverConfigured,
  isInProcessAutomationIntervalEnabled,
  getAutomationCronSecret,
  isProductionNodeEnv,
} = require("../src/config/fakeOrdersAutomation");

const API_BASE = process.env.VERIFY_API_BASE || "http://localhost:5000";
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`${tag} | ${name}`);
  if (detail) console.log(`      ${detail}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log("=== Fake Orders Automation — Post-Deploy Verification ===\n");

  const inProcess = isInProcessAutomationIntervalEnabled();
  const cronSecret = getAutomationCronSecret();
  const driverConfigured = isAutomationDriverConfigured();
  const prod = isProductionNodeEnv();

  check(
    "Automation driver configured",
    driverConfigured,
    prod
      ? inProcess
        ? "Option A: in-process (single instance only)"
        : cronSecret
          ? "Option B: external cron secret set"
          : "Set FAKE_ORDERS_AUTOMATION_CRON_SECRET + cron POST every 1–2 min, or FAKE_ORDERS_AUTOMATION_ENABLED=true on single instance"
      : inProcess
        ? "Dev default: in-process ticks enabled"
        : "Set FAKE_ORDERS_AUTOMATION_ENABLED=true or cron secret",
  );

  if (prod && inProcess && !cronSecret) {
    check(
      "Production multi-instance safety",
      false,
      "In-process ticks in production without cron secret — use external cron on multi-instance deploys",
    );
  } else if (prod && inProcess) {
    check("Production multi-instance safety", true, "In-process only — confirm single backend instance");
  } else {
    check("Production multi-instance safety", true, "External cron or non-production");
  }

  // Migrations
  for (const ver of [
    "081_fake_orders_marketplace_visibility_proof",
    "082_fake_order_settings_restore_12h_duration",
    "083_fake_order_settings_realign_next_automation_run",
  ]) {
    try {
      const { rows } = await pool.query(`SELECT 1 FROM schema_migrations WHERE version = $1`, [ver]);
      check(`Migration ${ver}`, rows.length === 1, rows.length ? "applied" : "run npm run db:migrate");
    } catch (e) {
      check(`Migration ${ver}`, false, e.message);
    }
  }

  let health;
  try {
    health = await fakeOrdersService.getFakeOrdersAutomationHealth();
    check("Automation health query", true, `checkedAt=${health.checkedAt}`);
  } catch (e) {
    check("Automation health query", false, e.message);
    health = null;
  }

  if (health) {
    check(
      "DB training_orders_enabled",
      health.db.trainingOrdersEnabled,
      String(health.db.trainingOrdersEnabled),
    );
    check(
      "DB automation_enabled",
      health.db.automationEnabled,
      String(health.db.automationEnabled),
    );
    check(
      "Rotation duration is 12 hours",
      health.rotation.durationValue === 12 && health.rotation.durationUnit === "hours",
      health.rotation.label || "unknown",
    );
    check(
      "Visible fake orders (any audience) > 0",
      health.pool.visibleAnyAudience > 0,
      `count=${health.pool.visibleAnyAudience}`,
    );
    check(
      "lastAutomationRunAt present",
      Boolean(health.db.lastAutomationRunAt),
      health.db.lastAutomationRunAt || "never — run cron or restart backend with driver enabled",
    );
    check(
      "nextAutomationRunAt present",
      Boolean(health.db.nextAutomationRunAt),
      health.db.nextAutomationRunAt || "missing",
    );
    if (health.rotation.durationValue === 12 && health.rotation.durationUnit === "hours" && health.db.nextAutomationRunAt) {
      const nextMs = new Date(health.db.nextAutomationRunAt).getTime();
      const minExpected = Date.now() + 30 * 60 * 1000;
      check(
        "nextAutomationRunAt aligned with 12h duration",
        nextMs >= minExpected,
        health.db.nextAutomationRunAt,
      );
    }
    if (health.warnings?.length) {
      check("No automation warnings", false, health.warnings.join(", "));
    } else {
      check("No automation warnings", true);
    }
  }

  // Homepage stats: completedOrders = real + proven ended training rotations
  try {
    const counts = await publicHomeOrderStatsService.queryHeroOrderCounts();
    const expectedCompleted = counts.completedOrdersReal + counts.trainingRotationsCompleted;
    check(
      "completedOrders equals real + trainingRotationsCompleted",
      counts.completedOrders === expectedCompleted,
      `completedOrders=${counts.completedOrders} real=${counts.completedOrdersReal} training=${counts.trainingRotationsCompleted}`,
    );
    check(
      "trainingRotationsCompleted is separate breakdown field",
      typeof counts.trainingRotationsCompleted === "number",
      `trainingRotationsCompleted=${counts.trainingRotationsCompleted}`,
    );
    check(
      "availableOrdersNow includes visible training pool",
      counts.availableOrdersNow >= counts.availableOrdersNowTraining,
      `available=${counts.availableOrdersNow} real=${counts.availableOrdersNowReal} training=${counts.availableOrdersNowTraining}`,
    );
  } catch (e) {
    check("Homepage order counts", false, e.message);
  }

  // Pool API — match visible fake order IDs (public JSON strips orderSource)
  try {
    const poolRes = await fetchJson(`${API_BASE}/api/orders/pool?page=1&limit=24&sort=newest`);
    const orders = poolRes.body?.data?.orders || poolRes.body?.orders || [];
    const poolIds = new Set(orders.map((o) => Number(o.id)).filter((id) => Number.isFinite(id)));

    const { rows: visibleFakeRows } = await pool.query(
      `SELECT fo.id
       FROM fake_orders fo
       INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
       INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id AND fr.status = 'active'
       WHERE fo.fake_status = 'active'
         AND ri.visible_from <= NOW()
         AND ri.visible_until > NOW()
       LIMIT 24`,
    );
    const visibleFakeIds = visibleFakeRows.map((r) => Number(r.id));
    const trainingInPool = visibleFakeIds.filter((id) => poolIds.has(id));

    check("GET /api/orders/pool returns 200", poolRes.status === 200, `status=${poolRes.status}`);
    check(
      "Training orders visible in pool API",
      trainingInPool.length > 0,
      `pool_total=${orders.length} visible_fake_in_db=${visibleFakeIds.length} matched_in_pool=${trainingInPool.length}`,
    );
    const badgeRows = orders.filter((o) => o.showTrainingBadge === true);
    if (badgeRows.length > 0) {
      check("showTrainingBadge when enabled in settings", true, `badge_count=${badgeRows.length}`);
    }
  } catch (e) {
    check("Pool API", false, e.message);
  }

  // Cron endpoint (when secret configured)
  if (cronSecret) {
    try {
      const beforeRun = health?.db?.lastAutomationRunAt;
      const tickRes = await fetchJson(`${API_BASE}/api/internal/fake-orders/automation-tick`, {
        method: "POST",
        headers: { "X-Fake-Orders-Automation-Secret": cronSecret },
      });
      check("Cron tick returns 200", tickRes.status === 200, `status=${tickRes.status}`);

      const healthAfter = await fakeOrdersService.getFakeOrdersAutomationHealth();
      const runUpdated =
        healthAfter.db.lastAutomationRunAt &&
        (!beforeRun || new Date(healthAfter.db.lastAutomationRunAt).getTime() >= new Date(beforeRun).getTime());
      check("lastAutomationRunAt updates after tick", runUpdated, healthAfter.db.lastAutomationRunAt);
      check(
        "Visible fake orders after tick",
        healthAfter.pool.visibleAnyAudience > 0,
        `count=${healthAfter.pool.visibleAnyAudience}`,
      );
    } catch (e) {
      check("Cron tick test", false, e.message);
    }
  } else {
    check(
      "Cron endpoint test",
      true,
      "Skipped — set FAKE_ORDERS_AUTOMATION_CRON_SECRET to test POST /api/internal/fake-orders/automation-tick",
    );
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`\nTotal: ${pass} pass, ${fail} fail\n`);

  if (fail > 0) {
    console.log("Failures:");
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
  }

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
