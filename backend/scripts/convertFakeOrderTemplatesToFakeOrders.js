/**
 * Convert fake_order_templates rows into pool fake_orders (template_id NULL, source_type template_converted).
 *
 * Dry-run (default):
 *   node scripts/convertFakeOrderTemplatesToFakeOrders.js
 *
 * Step A — convert only:
 *   EXECUTE=true CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS=true node scripts/convertFakeOrderTemplatesToFakeOrders.js
 *
 * Step B — delete converted templates (after verification):
 *   EXECUTE=true CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS=true CONFIRM_DELETE_TEMPLATES_AFTER_CONVERSION=true node scripts/convertFakeOrderTemplatesToFakeOrders.js
 *
 * Production (extra guard):
 *   CONFIRM_PRODUCTION_TEMPLATE_CONVERSION=true
 *
 * Requires migration 094_fake_order_template_conversions.sql applied first.
 */

const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  envBool,
  getDatabaseTargetHint,
  resolveDestructiveScriptMode,
  printSafetyBanner,
  printDryRunExecuteHint,
} = require("./lib/destructiveScriptSafety");

const BATCH_SIZE = Number(process.env.TEMPLATE_CONVERSION_BATCH_SIZE || 250);

const SAFETY = resolveDestructiveScriptMode({
  scriptName: "convertFakeOrderTemplatesToFakeOrders.js",
  specificExecuteVar: "CONVERT_TEMPLATES_EXECUTE",
  confirmVar: "CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS",
  executeCommandExample:
    "EXECUTE=true CONFIRM_CONVERT_TEMPLATES_TO_FAKE_ORDERS=true node scripts/convertFakeOrderTemplatesToFakeOrders.js",
});

const DELETE_CONFIRMED = envBool("CONFIRM_DELETE_TEMPLATES_AFTER_CONVERSION");

async function ensureConversionSchema(client) {
  const { rows } = await client.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fake_order_template_conversions'
    ) AS ok`,
  );
  if (!rows[0]?.ok) {
    throw new Error(
      "Missing table fake_order_template_conversions. Run migration 094_fake_order_template_conversions.sql first.",
    );
  }
}

async function loadSnapshot() {
  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
  const [
    countsRes,
    convertedRes,
    linkedRes,
    invalidRes,
    activeRoundsRes,
    roundItemsRes,
    hero,
    health,
    readiness,
  ] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM fake_orders) AS fake_orders,
        (SELECT COUNT(*)::int FROM fake_order_templates) AS templates,
        (SELECT COUNT(*)::int FROM orders) AS real_orders,
        (SELECT COUNT(*)::int FROM fake_orders WHERE source_type = 'template_converted') AS template_converted,
        (SELECT COUNT(*)::int FROM fake_orders WHERE source_type = 'admin_created') AS admin_created,
        (SELECT COUNT(*)::int FROM fake_orders
         WHERE is_published = TRUE AND is_open_for_pool = TRUE AND COALESCE(is_archived, FALSE) = FALSE) AS pool_eligible
    `),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_template_conversions`),
    pool.query(`
      SELECT COUNT(DISTINCT t.id)::int AS c
      FROM fake_order_templates t
      INNER JOIN fake_orders fo ON fo.template_id = t.id
    `),
    pool.query(`
      SELECT t.id, t.title
      FROM fake_order_templates t
      LEFT JOIN categories c ON c.id = t.category_id AND c.is_active = TRUE
      WHERE TRIM(COALESCE(t.title, '')) = ''
         OR LENGTH(TRIM(COALESCE(t.title, ''))) < 2
         OR TRIM(COALESCE(t.description, '')) = ''
         OR LENGTH(TRIM(COALESCE(t.description, ''))) < 2
         OR t.category_id IS NULL
         OR c.id IS NULL
         OR t.min_budget IS NULL OR t.max_budget IS NULL
         OR t.min_budget <= 0 OR t.max_budget < t.min_budget
         OR t.min_duration IS NULL OR t.max_duration IS NULL
         OR t.min_duration < 1 OR t.max_duration < t.min_duration
      ORDER BY t.id
      LIMIT 50
    `),
    pool.query(`SELECT id, status, generated_count FROM fake_order_rounds WHERE status = 'active' ORDER BY id DESC`),
    pool.query(`
      SELECT COUNT(*)::int AS visible_active_items
      FROM fake_order_round_items ri
      INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
      WHERE fr.status = 'active'
        AND ri.status = 'active'
        AND ri.visible_from <= NOW()
        AND ri.visible_until > NOW()
    `),
    publicHomeOrderStatsService.queryHeroOrderCounts(),
    fakeOrdersService.getFakeOrdersAutomationHealth(),
    fakeOrdersService.getTrainingOrdersReadiness(),
  ]);

  const { rows: pendingRows } = await pool.query(`
    SELECT t.*
    FROM fake_order_templates t
    WHERE NOT EXISTS (
      SELECT 1 FROM fake_order_template_conversions c WHERE c.template_id = t.id
    )
    ORDER BY t.id ASC
  `);

  const validation = { valid: [], invalid: [] };
  for (const template of pendingRows) {
    const built = fakeOrdersService.buildFakeOrderRowFromTemplateForPoolConversion(template);
    if (built.ok) validation.valid.push(template);
    else validation.invalid.push({ templateId: template.id, reason: built.reason });
  }

  const alreadyConverted = Number(convertedRes.rows[0]?.c || 0);
  const linkedMaterialized = Number(linkedRes.rows[0]?.c || 0);

  return {
    counts: countsRes.rows[0],
    alreadyTrackedConversions: alreadyConverted,
    linkedMaterializedTemplates: linkedMaterialized,
    invalidSqlSample: invalidRes.rows,
    pendingTemplates: pendingRows,
    validation,
    activeRounds: activeRoundsRes.rows,
    visibleActiveRoundItems: Number(roundItemsRes.rows[0]?.visible_active_items || 0),
    hero,
    health,
    readiness,
  };
}

function printDryRunReport(snap) {
  const fakeBefore = Number(snap.counts.fake_orders || 0);
  const templatesTotal = Number(snap.counts.templates || 0);
  const toConvert = snap.validation.valid.length;
  const invalid = snap.validation.invalid.length;
  const expectedAfter = fakeBefore + toConvert;

  console.log("\n=== Template → fake_orders conversion plan ===");
  console.log(
    JSON.stringify(
      {
        nodeEnv: process.env.NODE_ENV || "(unset)",
        database: getDatabaseTargetHint(),
        fake_orders_before: fakeBefore,
        fake_order_templates_total: templatesTotal,
        already_tracked_conversions: snap.alreadyTrackedConversions,
        linked_via_template_id_skip: snap.linkedMaterializedTemplates,
        pending_not_yet_converted: snap.pendingTemplates.length,
        valid_for_conversion: toConvert,
        invalid_mapping: invalid,
        invalid_samples: snap.validation.invalid.slice(0, 20),
        sql_invalid_sample: snap.invalidSqlSample,
        expected_fake_orders_after: expectedAfter,
        delete_templates_after: DELETE_CONFIRMED,
        active_rounds: snap.activeRounds,
        visible_active_round_items: snap.visibleActiveRoundItems,
        visible_training_orders: snap.health.pool?.visibleAnyAudience,
        availableOrdersNow: snap.hero.availableOrdersNow,
        completedOrders: snap.hero.completedOrders,
        real_orders: snap.counts.real_orders,
        eligibleForNextRound_before: snap.readiness.eligibleForNextRound,
        canCreateNextRound: snap.readiness.canCreateNextRound,
      },
      null,
      2,
    ),
  );

  console.log("\n=== Recommendation ===");
  if (invalid > 0) {
    console.log(`Review ${invalid} invalid template(s) before execute.`);
  }
  if (DELETE_CONFIRMED) {
    console.log("DELETE flag is set — templates with conversion records will be removed after conversion.");
  } else {
    console.log("Step A: convert only (no template delete). Re-run with CONFIRM_DELETE_TEMPLATES_AFTER_CONVERSION=true after verification.");
  }
}

async function convertBatch(client, templates, actorUserId, batchId) {
  const results = { converted: 0, failed: [] };
  for (const template of templates) {
  // eslint-disable-next-line no-await-in-loop
    const out = await fakeOrdersService.insertConvertedTemplateAsFakeOrder(client, {
      template,
      actorUserId,
      conversionBatchId: batchId,
    });
    if (out.ok) {
      results.converted += 1;
    } else {
      results.failed.push({ templateId: template.id, reason: out.reason });
      throw new Error(`Conversion failed for template ${template.id}: ${out.reason}`);
    }
  }
  return results;
}

async function deleteConvertedTemplates(client) {
  const res = await client.query(`
    DELETE FROM fake_order_templates t
    WHERE EXISTS (
      SELECT 1 FROM fake_order_template_conversions c WHERE c.template_id = t.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM fake_orders fo WHERE fo.template_id = t.id
    )
  `);
  return res.rowCount || 0;
}

async function main() {
  if (process.env.NODE_ENV === "production" && !envBool("CONFIRM_PRODUCTION_TEMPLATE_CONVERSION")) {
    console.error("ABORT: NODE_ENV=production requires CONFIRM_PRODUCTION_TEMPLATE_CONVERSION=true");
    process.exit(1);
  }

  printSafetyBanner(SAFETY);

  const client = await pool.connect();
  const batchId = `tpl_conv_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${crypto.randomBytes(3).toString("hex")}`;

  try {
    await ensureConversionSchema(client);
    const before = await loadSnapshot();
    printDryRunReport(before);

    if (SAFETY.dryRun) {
      printDryRunExecuteHint(
        SAFETY,
        "CONFIRM_PRODUCTION_TEMPLATE_CONVERSION=true (production only)",
      );
      return;
    }

    const actorRes = await client.query(
      `SELECT id FROM users WHERE is_active = TRUE AND role IN ('super_admin', 'admin') ORDER BY id LIMIT 1`,
    );
    const actorUserId = actorRes.rows[0]?.id;
    if (!actorUserId) throw new Error("No active admin user found for created_by_user_id fallback.");

    const detachRes = await pool.query(`UPDATE fake_orders SET template_id = NULL WHERE template_id IS NOT NULL`);
    if (detachRes.rowCount > 0) {
      console.log(`\nDetached template_id from ${detachRes.rowCount} fake_orders row(s).`);
    }

    const executePlan = await loadSnapshot();
    const templates = executePlan.validation.valid;
    if (templates.length < 1 && !DELETE_CONFIRMED) {
      console.log("\nNo templates to convert. Exiting.");
      return;
    }

    if (templates.length < 1 && DELETE_CONFIRMED) {
      console.log("\nNo new templates to convert; running template delete only.");
    }

    let convertedTotal = 0;
    let failedTotal = 0;
    const failed = [];

    if (templates.length > 0) {
      for (let i = 0; i < templates.length; i += BATCH_SIZE) {
        const chunk = templates.slice(i, i + BATCH_SIZE);
        // eslint-disable-next-line no-await-in-loop
        await client.query("BEGIN");
        try {
          // eslint-disable-next-line no-await-in-loop
          const batchResult = await convertBatch(client, chunk, actorUserId, batchId);
          convertedTotal += batchResult.converted;
          // eslint-disable-next-line no-await-in-loop
          await client.query("COMMIT");
          console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: converted ${batchResult.converted}`);
        } catch (err) {
          // eslint-disable-next-line no-await-in-loop
          await client.query("ROLLBACK");
          failedTotal += chunk.length;
          failed.push({ batchStart: i, error: err?.message || String(err) });
          console.error(`Batch rollback at offset ${i}:`, err?.message || err);
          break;
        }
      }
    }

    let deletedTemplates = 0;
    if (DELETE_CONFIRMED && failed.length === 0) {
      await client.query("BEGIN");
      try {
        deletedTemplates = await deleteConvertedTemplates(client);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
    const after = await loadSnapshot();

    console.log("\n=== Execution complete ===");
    console.log(
      JSON.stringify(
        {
          conversion_batch_id: batchId,
          converted: convertedTotal,
          failed_batches: failed,
          deleted_templates: deletedTemplates,
          before: {
            fake_orders: before.counts.fake_orders,
            templates: before.counts.templates,
            template_converted: before.counts.template_converted,
            visible_training_orders: before.health.pool?.visibleAnyAudience,
            visible_active_round_items: before.visibleActiveRoundItems,
            availableOrdersNow: before.hero.availableOrdersNow,
            completedOrders: before.hero.completedOrders,
            eligibleForNextRound: before.readiness.eligibleForNextRound,
          },
          after: {
            fake_orders: after.counts.fake_orders,
            templates: after.counts.templates,
            template_converted: after.counts.template_converted,
            admin_created: after.counts.admin_created,
            pool_eligible: after.counts.pool_eligible,
            visible_training_orders: after.health.pool?.visibleAnyAudience,
            visible_active_round_items: after.visibleActiveRoundItems,
            availableOrdersNow: after.hero.availableOrdersNow,
            completedOrders: after.hero.completedOrders,
            eligibleForNextRound: after.readiness.eligibleForNextRound,
          },
          verification: {
            fake_orders_increased_by_converted: Number(after.counts.fake_orders) === Number(before.counts.fake_orders) + convertedTotal,
            templates_unchanged_unless_delete: DELETE_CONFIRMED
              ? Number(after.counts.templates) <= Number(before.counts.templates)
              : Number(after.counts.templates) === Number(before.counts.templates),
            active_round_unchanged: JSON.stringify(before.activeRounds) === JSON.stringify(after.activeRounds),
            visible_round_items_unchanged: before.visibleActiveRoundItems === after.visibleActiveRoundItems,
            visible_training_unchanged:
              before.health.pool?.visibleAnyAudience === after.health.pool?.visibleAnyAudience,
            availableOrdersNow_unchanged: before.hero.availableOrdersNow === after.hero.availableOrdersNow,
            completedOrders_unchanged: before.hero.completedOrders === after.hero.completedOrders,
            real_orders_unchanged: before.counts.real_orders === after.counts.real_orders,
          },
        },
        null,
        2,
      ),
    );

    if (failed.length > 0) process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
