/**
 * Force training round rotation: stop active round(s), start a fresh pool-based round now.
 *
 * Dry-run (default):
 *   node scripts/rotateFakeOrdersNow.js
 *   npm run db:rotate-fake-orders-now
 *
 * Execute (requires execute flag + confirmation):
 *   ROTATE_FAKE_ORDERS_EXECUTE=true CONFIRM_ROTATE_FAKE_ORDERS_NOW=true node scripts/rotateFakeOrdersNow.js
 *
 * Backward compatible:
 *   EXECUTE=true CONFIRM_ROTATE_FAKE_ORDERS_NOW=true node scripts/rotateFakeOrdersNow.js
 */

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const { pool } = require("../src/config/db");
const {
  buildRotateTrainingRoundPlan,
  rotateTrainingRoundNow,
  resolveRoundOrderBounds,
} = require("../src/services/fakeOrdersService");
const {
  resolveDestructiveScriptMode,
  printSafetyBanner,
  printDryRunExecuteHint,
} = require("./lib/destructiveScriptSafety");

const SAFETY = resolveDestructiveScriptMode({
  scriptName: "rotateFakeOrdersNow.js",
  specificExecuteVar: "ROTATE_FAKE_ORDERS_EXECUTE",
  confirmVar: "CONFIRM_ROTATE_FAKE_ORDERS_NOW",
  executeCommandExample:
    "ROTATE_FAKE_ORDERS_EXECUTE=true CONFIRM_ROTATE_FAKE_ORDERS_NOW=true node scripts/rotateFakeOrdersNow.js",
});

const { dryRun, execute } = SAFETY;

function printPlan(plan, heroEstimate) {
  // eslint-disable-next-line no-console
  console.log("\n=== Fake training round rotation plan ===");
  // eslint-disable-next-line no-console
  console.log(`Mode: ${dryRun ? "DRY_RUN" : "EXECUTE"}`);
  // eslint-disable-next-line no-console
  console.log(`Active round(s): ${plan.activeRounds.map((r) => r.id).join(", ") || "—"}`);
  // eslint-disable-next-line no-console
  console.log(`Current visible items: ${plan.coverage.visibleCount}`);
  // eslint-disable-next-line no-console
  console.log(`Items to expire/supersede: ${plan.visibleItemsToExpire}`);
  // eslint-disable-next-line no-console
  console.log(`Round size range: ${plan.minOrders}–${plan.maxOrders}`);
  // eslint-disable-next-line no-console
  console.log(`Selected random target count: ${plan.requestedCount} → using ${plan.targetCount}`);
  // eslint-disable-next-line no-console
  console.log(`Eligible fake_orders pool: ${plan.eligiblePoolSize}`);
  // eslint-disable-next-line no-console
  console.log(`Preview fake_order_ids (first 20): ${plan.previewFakeOrderIds.slice(0, 20).join(", ")}${plan.previewFakeOrderIds.length > 20 ? "…" : ""}`);
  // eslint-disable-next-line no-console
  console.log(`Sufficient pool (>= min): ${plan.sufficientPool ? "yes" : "NO"}`);
  if (heroEstimate) {
    const avail =
      heroEstimate.homepageBefore?.availableOrdersNow ??
      heroEstimate.availableOrdersNow ??
      "—";
    const est =
      heroEstimate.estimatedAvailableOrdersNow ??
      heroEstimate.homepageAfter?.availableOrdersNow ??
      "—";
    // eslint-disable-next-line no-console
    console.log(`availableOrdersNow (current): ${avail}`);
    // eslint-disable-next-line no-console
    console.log(`estimated availableOrdersNow after: ${est}`);
  }
}

async function main() {
  printSafetyBanner(SAFETY);

  const client = await pool.connect();
  try {
    const plan = await buildRotateTrainingRoundPlan(client);
    const { rows: sRows } = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
    const bounds = resolveRoundOrderBounds(sRows[0] || {});
    if (bounds.minOrders !== plan.minOrders || bounds.maxOrders !== plan.maxOrders) {
      // eslint-disable-next-line no-console
      console.warn("Bounds mismatch — using resolved settings bounds.");
    }

    if (!execute) {
      const report = await rotateTrainingRoundNow({ dryRun: true });
      printPlan(plan, report);
      printDryRunExecuteHint(SAFETY);
      if (!plan.sufficientPool) process.exitCode = 1;
      return;
    }

    if (!plan.sufficientPool) {
      // eslint-disable-next-line no-console
      console.error(`Blocked: eligible pool ${plan.eligiblePoolSize} < min ${plan.minOrders}.`);
      process.exitCode = 1;
      return;
    }

    const result = await rotateTrainingRoundNow({ dryRun: false });
    printPlan(plan, null);
    // eslint-disable-next-line no-console
    console.log("\n=== Execution result ===");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));

    if (!result.visibleAfter || result.visibleAfter < 1) {
      // eslint-disable-next-line no-console
      console.error("FAIL: marketplace has no visible training orders after rotation.");
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  try {
    await pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
