/**
 * Manual QA for fake/training order automation gap fix.
 *
 * Mutates local/dev DB (visible_until, min_orders, fake_order_settings).
 * Do NOT run against production.
 *
 * Usage:
 *   node scripts/qaFakeOrdersAutomationGap.js near-expiry
 *   node scripts/qaFakeOrdersAutomationGap.js overlap
 *   node scripts/qaFakeOrdersAutomationGap.js replenish
 *   node scripts/qaFakeOrdersAutomationGap.js poll-ui [--ms=150] [--duration=30000]
 *
 * Requires: backend/.env with DATABASE_URL; optional VERIFY_API_BASE (default http://localhost:5000).
 */
require("dotenv").config();
const fakeOrdersService = require("../src/services/fakeOrdersService");
const { pool } = require("../src/config/db");

const API_BASE = process.env.VERIFY_API_BASE || "http://localhost:5000";
const mode = String(process.argv[2] || "near-expiry").toLowerCase();

function parseArg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function poolApiSnapshot() {
  try {
    const res = await fetch(`${API_BASE}/api/orders/pool?page=1&limit=24`);
    const body = await res.json();
    const orders = body?.data?.orders || body?.orders || [];
    return { ok: true, total: orders.length, orders };
  } catch (e) {
    return { ok: false, total: null, error: String(e?.message || e) };
  }
}

async function visibleDbCount() {
  const cov = await fakeOrdersService.getTrainingPoolCoverage(pool);
  return cov.visibleCount;
}

async function printHealth(label) {
  const health = await fakeOrdersService.getFakeOrdersAutomationHealth();
  console.log(`\n=== ${label} ===`);
  console.log(
    JSON.stringify(
      {
        visibleCount: health.pool.visibleAnyAudience,
        activeRounds: health.pool.activeRounds,
        earliestVisibleUntil: health.pool.earliestVisibleUntil,
        nextAutomationRunAt: health.db.nextAutomationRunAt,
        overlapMs: health.rotation?.overlapMs,
        minVisibleOrders: health.rotation?.minVisibleOrders,
        driverActive: health.driver.anyDriverActive,
        warnings: health.warnings,
      },
      null,
      2,
    ),
  );
  return health;
}

async function nearExpiry() {
  await printHealth("HEALTH (before)");
  const beforeApi = await poolApiSnapshot();
  console.log("Pool API (before):", beforeApi.ok ? { total: beforeApi.total } : beforeApi);

  await pool.query(
    `UPDATE fake_order_round_items
     SET visible_until = NOW() + INTERVAL '3 minutes', updated_at = NOW()
     WHERE status = 'active'`,
  );

  console.log("\nForced active items to visible_until = NOW()+3min; running tick...");
  await fakeOrdersService.runAutomationTick();

  const health = await printHealth("HEALTH (after tick)");
  const afterApi = await poolApiSnapshot();
  console.log("Pool API (after):", afterApi.ok ? { total: afterApi.total } : afterApi);

  const pass = health.pool.visibleAnyAudience > 0 && (!afterApi.ok || afterApi.total > 0);
  console.log(`\nNEAR_EXPIRY: ${pass ? "PASS" : "FAIL"}`);
  return pass;
}

async function overlap() {
  await pool.query(
    `UPDATE fake_order_round_items
     SET visible_until = NOW() + INTERVAL '2 minutes', updated_at = NOW()
     WHERE status = 'active'`,
  );
  const before = await visibleDbCount();
  console.log("Visible (before tick):", before);
  await fakeOrdersService.runAutomationTick();
  const after = await visibleDbCount();
  const health = await printHealth("HEALTH (after)");
  const pass = after > 0;
  console.log(`\nOVERLAP: ${pass ? "PASS" : "FAIL"} (visible ${before} -> ${after})`);
  return pass;
}

async function replenish() {
  const healthBefore = await fakeOrdersService.getFakeOrdersAutomationHealth();
  const min = healthBefore.rotation?.minVisibleOrders || 3;
  const { rows } = await pool.query(
    `SELECT ri.id FROM fake_order_round_items ri
     WHERE ri.status = 'active' AND ri.visible_until > NOW()
     ORDER BY ri.visible_until ASC LIMIT 3`,
  );
  if (rows.length) {
    await pool.query(
      `UPDATE fake_order_round_items
       SET visible_until = NOW() - INTERVAL '1 minute', updated_at = NOW()
       WHERE id = ANY($1::bigint[])`,
      [rows.map((r) => Number(r.id))],
    );
  }
  const visibleBefore = await visibleDbCount();
  console.log(`Shrunk visible to ~${visibleBefore}; min_orders=${min}`);
  await fakeOrdersService.runAutomationTick();
  const visibleAfter = await visibleDbCount();
  await printHealth("HEALTH (after)");
  const pass = visibleAfter >= min;
  console.log(`\nREPLENISH: ${pass ? "PASS" : "FAIL"} (visible ${visibleBefore} -> ${visibleAfter})`);
  return pass;
}

/**
 * Poll pool API during tick — proxies UI empty-state risk (OpenOrdersMarketplace uses same endpoint).
 * UI shows empty only when orders.length===0 && !busy; background refresh replaces atomically.
 */
async function pollUi() {
  const pollMs = parseArg("ms", 150);
  const durationMs = parseArg("duration", 30_000);
  const samples = [];
  let timer = null;

  const poll = async () => {
    const api = await poolApiSnapshot();
    const dbVisible = await visibleDbCount();
    samples.push({
      at: new Date().toISOString(),
      apiTotal: api.ok ? api.total : null,
      dbVisible,
    });
  };

  await poll();
  timer = setInterval(() => {
    void poll();
  }, pollMs);

  await pool.query(
    `UPDATE fake_order_round_items
     SET visible_until = NOW() + INTERVAL '2 minutes', updated_at = NOW()
     WHERE status = 'active'`,
  );

  const tickPromise = fakeOrdersService.runAutomationTick();
  await new Promise((r) => setTimeout(r, durationMs));
  await tickPromise;
  clearInterval(timer);
  await poll();

  const apiZeros = samples.filter((s) => s.apiTotal === 0);
  const dbZeros = samples.filter((s) => s.dbVisible === 0);
  console.log(JSON.stringify({ pollMs, sampleCount: samples.length, samples }, null, 2));
  const pass = dbZeros.length === 0 && apiZeros.length === 0;
  console.log(`\nPOLL_UI: ${pass ? "PASS" : "FAIL"} (api zero samples: ${apiZeros.length}, db zero: ${dbZeros.length})`);
  if (!pass) {
    console.log(
      "If API returned orders but UI flashed empty, check client busy/refetch behavior separately.",
    );
  }
  return pass;
}

async function main() {
  let pass = false;
  if (mode === "near-expiry" || mode === "near_expiry") pass = await nearExpiry();
  else if (mode === "overlap") pass = await overlap();
  else if (mode === "replenish") pass = await replenish();
  else if (mode === "poll-ui" || mode === "poll_ui") pass = await pollUi();
  else {
    console.error(`Unknown mode: ${mode}. Use: near-expiry | overlap | replenish | poll-ui`);
    pass = false;
  }
  await pool.end();
  process.exit(pass ? 0 : 1);
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
