/**
 * Delete legacy fake_order_templates created before 2026-06-22 UTC.
 * Does NOT delete fake_orders, round items, or real orders.
 *
 * Dry-run (default):
 *   node scripts/deleteOldFakeOrderTemplatesBeforeJune22.js
 *
 * Execute (after dry-run review + backup):
 *   EXECUTE=true CONFIRM_DELETE_OLD_FAKE_ORDER_TEMPLATES=true node scripts/deleteOldFakeOrderTemplatesBeforeJune22.js
 *
 * If fake_orders reference old templates (detach template_id only):
 *   EXECUTE=true CONFIRM_DELETE_OLD_FAKE_ORDER_TEMPLATES=true CONFIRM_DETACH_OLD_TEMPLATE_REFERENCES=true node scripts/deleteOldFakeOrderTemplatesBeforeJune22.js
 *
 * Production (extra guard):
 *   CONFIRM_PRODUCTION_OLD_TEMPLATE_DELETE=true (required when NODE_ENV=production)
 */

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const { pool } = require("../src/config/db");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const fakeOrdersService = require("../src/services/fakeOrdersService");
const {
  envBool,
  getDatabaseTargetHint,
  resolveDestructiveScriptMode,
  printSafetyBanner,
  printDryRunExecuteHint,
} = require("./lib/destructiveScriptSafety");

const CUTOFF = "2026-06-22T00:00:00.000Z";

const SAFETY = resolveDestructiveScriptMode({
  scriptName: "deleteOldFakeOrderTemplatesBeforeJune22.js",
  specificExecuteVar: "DELETE_OLD_TEMPLATES_EXECUTE",
  confirmVar: "CONFIRM_DELETE_OLD_FAKE_ORDER_TEMPLATES",
  executeCommandExample:
    "EXECUTE=true CONFIRM_DELETE_OLD_FAKE_ORDER_TEMPLATES=true CONFIRM_DETACH_OLD_TEMPLATE_REFERENCES=true node scripts/deleteOldFakeOrderTemplatesBeforeJune22.js",
});

async function loadPlan(client) {
  const { rows: [counts] } = await client.query(
    `
    SELECT
      (SELECT COUNT(*)::int FROM fake_order_templates) AS total_templates,
      (SELECT COUNT(*)::int FROM fake_order_templates WHERE created_at >= $1::timestamptz) AS templates_to_keep,
      (SELECT COUNT(*)::int FROM fake_order_templates WHERE created_at < $1::timestamptz) AS templates_to_delete,
      (SELECT COUNT(*)::int FROM fake_orders) AS fake_orders_total,
      (SELECT COUNT(*)::int FROM orders) AS real_orders_total
    `,
    [CUTOFF],
  );

  const { rows: [oldestDelete] } = await client.query(
    `
    SELECT id, title, created_at
    FROM fake_order_templates
    WHERE created_at < $1::timestamptz
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1`,
    [CUTOFF],
  );

  const { rows: [newestDelete] } = await client.query(
    `
    SELECT id, title, created_at
    FROM fake_order_templates
    WHERE created_at < $1::timestamptz
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 1`,
    [CUTOFF],
  );

  const { rows: [oldestKeep] } = await client.query(
    `
    SELECT id, title, created_at
    FROM fake_order_templates
    WHERE created_at >= $1::timestamptz
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1`,
    [CUTOFF],
  );

  const { rows: [newestKeep] } = await client.query(
    `
    SELECT id, title, created_at
    FROM fake_order_templates
    WHERE created_at >= $1::timestamptz
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 1`,
    [CUTOFF],
  );

  const { rows: [refCount] } = await client.query(
    `
    SELECT COUNT(*)::int AS fake_orders_referencing_old_templates
    FROM fake_orders fo
    INNER JOIN fake_order_templates fot ON fot.id = fo.template_id
    WHERE fot.created_at < $1::timestamptz`,
    [CUTOFF],
  );

  const { rows: refSample } = await client.query(
    `
    SELECT fo.id, fo.title, fo.template_id, fot.created_at AS template_created_at
    FROM fake_orders fo
    INNER JOIN fake_order_templates fot ON fot.id = fo.template_id
    WHERE fot.created_at < $1::timestamptz
    ORDER BY fo.id DESC
    LIMIT 20`,
    [CUTOFF],
  );

  const { rows: activeRounds } = await client.query(
    `SELECT id, status, generated_count FROM fake_order_rounds WHERE status = 'active' ORDER BY id DESC`,
  );

  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
  const hero = await publicHomeOrderStatsService.queryHeroOrderCounts();
  const health = await fakeOrdersService.getFakeOrdersAutomationHealth();

  return {
    counts,
    oldestDelete: oldestDelete || null,
    newestDelete: newestDelete || null,
    oldestKeep: oldestKeep || null,
    newestKeep: newestKeep || null,
    fakeOrdersReferencingOldTemplates: Number(refCount.fake_orders_referencing_old_templates || 0),
    referenceSample: refSample,
    activeRounds,
    hero,
    health,
  };
}

async function main() {
  if (process.env.NODE_ENV === "production" && !envBool("CONFIRM_PRODUCTION_OLD_TEMPLATE_DELETE")) {
    console.error(
      "ABORT: NODE_ENV=production requires CONFIRM_PRODUCTION_OLD_TEMPLATE_DELETE=true",
    );
    process.exit(1);
  }

  const detachConfirmed = envBool("CONFIRM_DETACH_OLD_TEMPLATE_REFERENCES");
  printSafetyBanner(SAFETY);

  const client = await pool.connect();
  try {
    const before = await loadPlan(client);

    console.log("\n=== Cutoff ===");
    console.log(`UTC cutoff: ${CUTOFF}`);
    console.log(`Keep: created_at >= cutoff`);
    console.log(`Delete: created_at < cutoff`);

    console.log("\n=== Plan (before) ===");
    console.log(JSON.stringify(
      {
        total_templates: before.counts.total_templates,
        templates_to_keep: before.counts.templates_to_keep,
        templates_to_delete: before.counts.templates_to_delete,
        fake_orders_total: before.counts.fake_orders_total,
        real_orders_total: before.counts.real_orders_total,
        oldest_template_to_delete: before.oldestDelete,
        newest_template_to_delete: before.newestDelete,
        oldest_template_to_keep: before.oldestKeep,
        newest_template_to_keep: before.newestKeep,
        fake_orders_referencing_old_templates: before.fakeOrdersReferencingOldTemplates,
        reference_sample: before.referenceSample,
        detach_needed: before.fakeOrdersReferencingOldTemplates > 0,
        detach_confirmed: detachConfirmed,
        active_rounds: before.activeRounds,
        visible_training_orders: before.health.pool?.visibleAnyAudience,
        availableOrdersNow: before.hero.availableOrdersNow,
        completedOrders: before.hero.completedOrders,
      },
      null,
      2,
    ));

    if (SAFETY.dryRun) {
      if (before.fakeOrdersReferencingOldTemplates > 0) {
        console.log(
          `\nNOTE: ${before.fakeOrdersReferencingOldTemplates} fake_orders reference old templates. ` +
            "Execute requires CONFIRM_DETACH_OLD_TEMPLATE_REFERENCES=true to set template_id=NULL on those rows first.",
        );
      }
      printDryRunExecuteHint(SAFETY, "CONFIRM_DETACH_OLD_TEMPLATE_REFERENCES=true");
      return;
    }

    if (before.counts.templates_to_delete < 1) {
      console.log("\nNothing to delete. Exiting.");
      return;
    }

    if (before.fakeOrdersReferencingOldTemplates > 0 && !detachConfirmed) {
      console.error(
        `\nABORT: ${before.fakeOrdersReferencingOldTemplates} fake_orders reference old templates. ` +
          "Set CONFIRM_DETACH_OLD_TEMPLATE_REFERENCES=true to detach (template_id=NULL) before delete.",
      );
      process.exit(1);
    }

    let detachedCount = 0;
    let deletedCount = 0;

    await client.query("BEGIN");

    if (before.fakeOrdersReferencingOldTemplates > 0) {
      const detachRes = await client.query(
        `
        UPDATE fake_orders fo
        SET template_id = NULL
        WHERE fo.template_id IN (
          SELECT id FROM fake_order_templates WHERE created_at < $1::timestamptz
        )`,
        [CUTOFF],
      );
      detachedCount = detachRes.rowCount || 0;
    }

    const deleteRes = await client.query(
      `DELETE FROM fake_order_templates WHERE created_at < $1::timestamptz`,
      [CUTOFF],
    );
    deletedCount = deleteRes.rowCount || 0;

    await client.query("COMMIT");

    publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
    const after = await loadPlan(client);

    const { rows: [remainingOld] } = await client.query(
      `SELECT COUNT(*)::int AS c FROM fake_order_templates WHERE created_at < $1::timestamptz`,
      [CUTOFF],
    );

    console.log("\n=== Execution complete ===");
    console.log(
      JSON.stringify(
        {
          cutoff: CUTOFF,
          detached_fake_orders: detachedCount,
          deleted_templates: deletedCount,
          before: {
            fake_order_templates: before.counts.total_templates,
            fake_orders: before.counts.fake_orders_total,
            real_orders: before.counts.real_orders_total,
          },
          after: {
            fake_order_templates: after.counts.total_templates,
            fake_orders: after.counts.fake_orders_total,
            real_orders: after.counts.real_orders_total,
            templates_before_cutoff_remaining: remainingOld.c,
          },
          active_rounds: after.activeRounds,
          visible_training_orders: after.health.pool?.visibleAnyAudience,
          availableOrdersNow: after.hero.availableOrdersNow,
          completedOrders: after.hero.completedOrders,
          verification: {
            fake_orders_unchanged: after.counts.fake_orders_total === before.counts.fake_orders_total,
            real_orders_unchanged: after.counts.real_orders_total === before.counts.real_orders_total,
            no_old_templates_left: Number(remainingOld.c) === 0,
            active_round_unchanged:
              JSON.stringify(before.activeRounds) === JSON.stringify(after.activeRounds),
            visible_unchanged:
              before.health.pool?.visibleAnyAudience === after.health.pool?.visibleAnyAudience,
            availableOrdersNow_unchanged:
              before.hero.availableOrdersNow === after.hero.availableOrdersNow,
            completedOrders_unchanged:
              before.hero.completedOrders === after.hero.completedOrders,
          },
        },
        null,
        2,
      ),
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
