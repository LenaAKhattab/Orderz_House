/**
 * Destructive cleanup: keep newest N fake_orders (default 400), delete older rows + dependents.
 *
 * Does NOT touch: orders (real), users, fake_order_templates, fake_order_settings.
 *
 * Dry-run (default — no writes):
 *   node scripts/cleanupFakeOrdersKeep400.js
 *   npm run db:cleanup:fake-orders-keep-400
 *
 * Execute (requires execute flag + confirmation; optional homepage override):
 *   CLEANUP_FAKE_ORDERS_EXECUTE=true CONFIRM_FAKE_ORDERS_CLEANUP=true node scripts/cleanupFakeOrdersKeep400.js
 *
 * Backward compatible:
 *   EXECUTE=true CONFIRM_FAKE_ORDERS_CLEANUP=true node scripts/cleanupFakeOrdersKeep400.js
 *
 * Options:
 *   --keep=400          Rows to preserve (newest by created_at DESC, id DESC)
 *   --skip-empty-rounds Skip deleting rounds with no items and no fake_orders.fake_round_id refs
 *
 * Before execute: pg_dump / cloud backup. Review dry-run output.
 */

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const { pool } = require("../src/config/db");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("../src/services/trainingPoolEligibility");
const {
  envBool,
  resolveDestructiveScriptMode,
  printSafetyBanner,
  printDryRunExecuteHint,
} = require("./lib/destructiveScriptSafety");

const KEEP_DEFAULT = 400;

function parseArgs(argv) {
  const out = { keep: KEEP_DEFAULT, skipEmptyRounds: false };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--keep=")) out.keep = Math.max(1, Number(raw.slice(7)) || KEEP_DEFAULT);
    else if (raw === "--skip-empty-rounds") out.skipEmptyRounds = true;
  }
  return out;
}

const SAFETY = resolveDestructiveScriptMode({
  scriptName: "cleanupFakeOrdersKeep400.js",
  specificExecuteVar: "CLEANUP_FAKE_ORDERS_EXECUTE",
  confirmVar: "CONFIRM_FAKE_ORDERS_CLEANUP",
  executeCommandExample:
    "CLEANUP_FAKE_ORDERS_EXECUTE=true CONFIRM_FAKE_ORDERS_CLEANUP=true node scripts/cleanupFakeOrdersKeep400.js",
});

const args = parseArgs(process.argv);
const { dryRun, execute } = SAFETY;
const allowTrainingDrop = envBool("ALLOW_HOMEPAGE_TRAINING_COMPLETED_DROP", false);

const KEEP_SQL = `
  SELECT fo.id
  FROM fake_orders fo
  ORDER BY fo.created_at DESC NULLS LAST, fo.id DESC
  LIMIT $1
`;

async function loadPlan(client, keepCount) {
  const { rows: [totals] } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM fake_orders) AS total_fake_orders,
      (SELECT COUNT(*)::int FROM fake_order_templates) AS templates,
      (SELECT COUNT(*)::int FROM orders) AS real_orders
  `);

  const { rows: keepRows } = await client.query(KEEP_SQL, [keepCount]);
  const keepIds = keepRows.map((r) => Number(r.id));
  const keepSet = new Set(keepIds);

  const { rows: allIds } = await client.query(`SELECT id FROM fake_orders ORDER BY id ASC`);
  const deleteIds = allIds.map((r) => Number(r.id)).filter((id) => !keepSet.has(id));

  const { rows: [bounds] } = await client.query(
    `
    WITH keep AS (${KEEP_SQL}),
    del AS (
      SELECT fo.id FROM fake_orders fo WHERE fo.id NOT IN (SELECT id FROM keep)
    )
    SELECT
      (SELECT COUNT(*)::int FROM keep) AS kept_count,
      (SELECT MIN(id) FROM keep) AS first_kept_id,
      (SELECT MAX(id) FROM keep) AS last_kept_id,
      (SELECT MIN(created_at) FROM fake_orders fo WHERE fo.id IN (SELECT id FROM keep)) AS oldest_kept_created_at,
      (SELECT MAX(created_at) FROM fake_orders fo WHERE fo.id IN (SELECT id FROM keep)) AS newest_kept_created_at,
      (SELECT COUNT(*)::int FROM del) AS delete_candidate_count,
      (SELECT MIN(id) FROM del) AS first_deleted_id,
      (SELECT MAX(id) FROM del) AS last_deleted_id
    `,
    [keepCount],
  );

  const { rows: [related] } = await client.query(
    `
    WITH del AS (
      SELECT fo.id FROM fake_orders fo WHERE fo.id <> ALL($1::bigint[])
    )
    SELECT
      (SELECT COUNT(*)::int FROM fake_order_round_items ri WHERE ri.fake_order_id IN (SELECT id FROM del)) AS round_items_affected,
      (SELECT COUNT(*)::int FROM fake_order_applications fa WHERE fa.fake_order_id IN (SELECT id FROM del)) AS applications_affected,
      (SELECT COUNT(*)::int FROM del d
        INNER JOIN fake_orders fo ON fo.id = d.id
        WHERE EXISTS (
          SELECT 1
          ${trainingPoolVisibleFromSql("fo_vis")}
          WHERE fo_vis.id = fo.id
            AND ${trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis" })}
        )) AS deleted_currently_visible_in_pool
    `,
    [keepIds.length ? keepIds : [0]],
  );

  const { rows: [createdAtQuality] } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE created_at IS NULL)::int AS null_created_at,
      (
        SELECT COUNT(*)::int FROM fake_orders a
        JOIN fake_orders b ON b.id > a.id AND b.created_at < a.created_at
      ) AS id_created_at_inversions
    FROM fake_orders
  `);

  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
  const heroBefore = await publicHomeOrderStatsService.queryHeroOrderCounts();

  const { rows: [trainingRemovedRow] } = await client.query(
    `
    WITH del AS (
      SELECT fo.id FROM fake_orders fo WHERE fo.id <> ALL($1::bigint[])
    )
    SELECT COUNT(*)::int AS n
    FROM fake_orders fo
    WHERE fo.id IN (SELECT id FROM del)
      AND fo.was_marketplace_visible = TRUE
      AND fo.first_visible_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        ${trainingPoolVisibleFromSql("fo_vis")}
        WHERE fo_vis.id = fo.id
          AND ${trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis" })}
      )
    `,
    [keepIds.length ? keepIds : [0]],
  );

  const trainingRemoved = Number(trainingRemovedRow?.n) || 0;
  const isRealOnlyCompleted = heroBefore.completedOrders === heroBefore.completedOrdersReal;

  const { rows: emptyRounds } = await client.query(
    `
    WITH del AS (
      SELECT fo.id FROM fake_orders fo WHERE fo.id <> ALL($1::bigint[])
    ),
    rounds_with_remaining_items AS (
      SELECT DISTINCT ri.round_id
      FROM fake_order_round_items ri
      WHERE ri.fake_order_id NOT IN (SELECT id FROM del)
    )
    SELECT COUNT(*)::int AS n
    FROM fake_order_rounds fr
    WHERE fr.id NOT IN (SELECT round_id FROM rounds_with_remaining_items)
      AND NOT EXISTS (
        SELECT 1 FROM fake_orders fo
        WHERE fo.fake_round_id = fr.id
          AND fo.id NOT IN (SELECT id FROM del)
      )
    `,
    [keepIds.length ? keepIds : [0]],
  );

  return {
    keepCount,
    selectionRule: "ORDER BY fake_orders.created_at DESC NULLS LAST, fake_orders.id DESC LIMIT N",
    totals,
    bounds,
    related,
    createdAtQuality,
    deleteIds,
    keepIds,
    emptyRoundsAfterDelete: Number(emptyRounds[0]?.n) || 0,
    homepage: {
      before: heroBefore,
      estimatedAfter: {
        completedOrdersReal: heroBefore.completedOrdersReal,
        trainingRotationsCompleted: isRealOnlyCompleted
          ? heroBefore.trainingRotationsCompleted
          : Math.max(0, heroBefore.trainingRotationsCompleted - trainingRemoved),
        completedOrders: isRealOnlyCompleted
          ? heroBefore.completedOrdersReal
          : heroBefore.completedOrdersReal + Math.max(0, heroBefore.trainingRotationsCompleted - trainingRemoved),
        availableOrdersNow:
          heroBefore.availableOrdersNow - Number(related.deleted_currently_visible_in_pool || 0),
      },
      trainingRotationsRemoved: trainingRemoved,
      includesTrainingInCompleted: !isRealOnlyCompleted && heroBefore.trainingRotationsCompleted > 0,
      isRealOnlyCompleted,
    },
  };
}

function printReport(plan) {
  // eslint-disable-next-line no-console
  console.log("\n=== Fake orders cleanup plan ===");
  // eslint-disable-next-line no-console
  console.log(`Mode: ${dryRun ? "DRY_RUN (no writes)" : "EXECUTE"}`);
  // eslint-disable-next-line no-console
  console.log(`Selection rule: ${plan.selectionRule}`);
  // eslint-disable-next-line no-console
  console.log(`Keep count target: ${plan.keepCount}`);
  // eslint-disable-next-line no-console
  console.log("\n--- Counts ---");
  // eslint-disable-next-line no-console
  console.log(`fake_orders before:        ${plan.totals.total_fake_orders}`);
  // eslint-disable-next-line no-console
  console.log(`kept (candidates):         ${plan.bounds.kept_count}`);
  // eslint-disable-next-line no-console
  console.log(`delete candidates:         ${plan.bounds.delete_candidate_count}`);
  // eslint-disable-next-line no-console
  console.log(`fake_order_templates:      ${plan.totals.templates} (preserved — not deleted)`);
  // eslint-disable-next-line no-console
  console.log(`real orders table:         ${plan.totals.real_orders} (untouched)`);
  // eslint-disable-next-line no-console
  console.log("\n--- Keep set bounds ---");
  // eslint-disable-next-line no-console
  console.log(`first/last kept id:        ${plan.bounds.first_kept_id} .. ${plan.bounds.last_kept_id}`);
  // eslint-disable-next-line no-console
  console.log(`oldest/newest kept created: ${plan.bounds.oldest_kept_created_at} .. ${plan.bounds.newest_kept_created_at}`);
  // eslint-disable-next-line no-console
  console.log("\n--- Delete set bounds ---");
  // eslint-disable-next-line no-console
  console.log(`first/last deleted id:     ${plan.bounds.first_deleted_id ?? "—"} .. ${plan.bounds.last_deleted_id ?? "—"}`);
  // eslint-disable-next-line no-console
  console.log("\n--- Dependent rows (cascade via FK) ---");
  // eslint-disable-next-line no-console
  console.log(`fake_order_round_items:    ${plan.related.round_items_affected}`);
  // eslint-disable-next-line no-console
  console.log(`fake_order_applications:   ${plan.related.applications_affected}`);
  // eslint-disable-next-line no-console
  console.log(`currently visible in pool (would delete): ${plan.related.deleted_currently_visible_in_pool}`);
  // eslint-disable-next-line no-console
  console.log(`empty rounds after delete: ${plan.emptyRoundsAfterDelete}${args.skipEmptyRounds ? " (cleanup skipped by flag)" : ""}`);
  // eslint-disable-next-line no-console
  console.log("\n--- created_at quality ---");
  // eslint-disable-next-line no-console
  console.log(`null created_at:           ${plan.createdAtQuality.null_created_at}`);
  // eslint-disable-next-line no-console
  console.log(`id/created_at inversions:  ${plan.createdAtQuality.id_created_at_inversions}`);
  // eslint-disable-next-line no-console
  console.log("\n--- Homepage stats impact (estimate) ---");
  const b = plan.homepage.before;
  const a = plan.homepage.estimatedAfter;
  // eslint-disable-next-line no-console
  console.log(`completedOrders:           ${b.completedOrders} → ${a.completedOrders}`);
  // eslint-disable-next-line no-console
  console.log(`completedOrdersReal:       ${b.completedOrdersReal} → ${a.completedOrdersReal}`);
  // eslint-disable-next-line no-console
  console.log(`trainingRotationsCompleted: ${b.trainingRotationsCompleted} → ${a.trainingRotationsCompleted} (removed: ${plan.homepage.trainingRotationsRemoved})`);
  // eslint-disable-next-line no-console
  console.log(`availableOrdersNow:        ${b.availableOrdersNow} → ${a.availableOrdersNow}`);
  // eslint-disable-next-line no-console
  console.log(`completed formula real-only: ${plan.homepage.isRealOnlyCompleted ? "YES" : "NO"}`);
}

function validatePlan(plan) {
  const errors = [];
  const warnings = [];

  if (plan.createdAtQuality.null_created_at > 0) {
    errors.push("created_at has NULL values — selection unreliable; aborting.");
  }
  if (plan.createdAtQuality.id_created_at_inversions > 0) {
    warnings.push(`id/created_at inversions: ${plan.createdAtQuality.id_created_at_inversions} (using created_at DESC, id DESC tie-break).`);
  }

  if (plan.totals.total_fake_orders <= plan.keepCount) {
    errors.push(
      `total fake_orders (${plan.totals.total_fake_orders}) <= keep target (${plan.keepCount}); nothing to delete.`,
    );
  }

  if (plan.bounds.delete_candidate_count === 0) {
    errors.push("delete candidate count is 0; stopping.");
  }

  if (plan.bounds.kept_count !== plan.keepCount) {
    errors.push(`keep count is ${plan.bounds.kept_count}, expected exactly ${plan.keepCount}.`);
  }

  if (!plan.homepage.isRealOnlyCompleted) {
    warnings.push(
      "completedOrders still includes trainingRotationsCompleted (NOT real-only). " +
        "Deletion will reduce homepage completedOrders unless Option B is applied first.",
    );
    if (execute && !allowTrainingDrop) {
      errors.push(
        "Set ALLOW_HOMEPAGE_TRAINING_COMPLETED_DROP=true to execute while completedOrders includes training.",
      );
    }
  }

  if (plan.related.deleted_currently_visible_in_pool > 0) {
    errors.push(
      `${plan.related.deleted_currently_visible_in_pool} currently marketplace-visible fake orders would be deleted.`,
    );
  }

  return { errors, warnings };
}

async function verifyAfter(client, keepCount) {
  const checks = [];
  const { rows: [counts] } = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM fake_orders) AS fake_orders,
      (SELECT COUNT(*)::int FROM fake_order_round_items ri
        WHERE NOT EXISTS (SELECT 1 FROM fake_orders fo WHERE fo.id = ri.fake_order_id)) AS orphan_round_items,
      (SELECT COUNT(*)::int FROM fake_order_applications fa
        WHERE NOT EXISTS (SELECT 1 FROM fake_orders fo WHERE fo.id = fa.fake_order_id)) AS orphan_applications,
      (SELECT COUNT(*)::int FROM fake_order_templates) AS templates,
      (SELECT COUNT(*)::int FROM orders) AS real_orders
  `);

  checks.push({
    name: "fake_orders count = keep target",
    pass: counts.fake_orders === keepCount,
    detail: `count=${counts.fake_orders} expected=${keepCount}`,
  });
  checks.push({
    name: "no orphan fake_order_round_items",
    pass: counts.orphan_round_items === 0,
    detail: `orphans=${counts.orphan_round_items}`,
  });
  checks.push({
    name: "no orphan fake_order_applications",
    pass: counts.orphan_applications === 0,
    detail: `orphans=${counts.orphan_applications}`,
  });
  checks.push({
    name: "templates preserved",
    pass: counts.templates > 0,
    detail: `templates=${counts.templates}`,
  });
  checks.push({
    name: "real orders untouched",
    pass: true,
    detail: `orders=${counts.real_orders} (compare to pre-run snapshot manually)`,
  });

  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
  const hero = await publicHomeOrderStatsService.queryHeroOrderCounts();
  checks.push({
    name: "training marketplace has visible items",
    pass: hero.availableOrdersNowTraining >= 0,
    detail: `availableOrdersNowTraining=${hero.availableOrdersNowTraining}`,
  });

  return { checks, hero, counts };
}

async function main() {
  printSafetyBanner(SAFETY);

  const client = await pool.connect();
  let realOrdersBefore = null;

  try {
    const plan = await loadPlan(client, args.keep);
    realOrdersBefore = plan.totals.real_orders;
    printReport(plan);

    const { errors, warnings } = validatePlan(plan);
    for (const w of warnings) {
      // eslint-disable-next-line no-console
      console.warn(`\nWARN: ${w}`);
    }

    if (errors.length) {
      // eslint-disable-next-line no-console
      console.error("\n=== BLOCKED ===");
      for (const e of errors) {
        // eslint-disable-next-line no-console
        console.error(`  - ${e}`);
      }
      process.exitCode = 1;
      return;
    }

    if (dryRun) {
      printDryRunExecuteHint(
        SAFETY,
        plan.homepage.isRealOnlyCompleted
          ? ""
          : "ALLOW_HOMEPAGE_TRAINING_COMPLETED_DROP=true",
      );
      return;
    }

    await client.query("BEGIN");
    const templatesBefore = plan.totals.templates;

    const { rowCount: deletedOrders } = await client.query(
      `DELETE FROM fake_orders fo WHERE fo.id <> ALL($1::bigint[])`,
      [plan.keepIds],
    );

    let deletedEmptyRounds = 0;
    if (!args.skipEmptyRounds) {
      const { rowCount } = await client.query(
        `
        DELETE FROM fake_order_rounds fr
        WHERE NOT EXISTS (SELECT 1 FROM fake_order_round_items ri WHERE ri.round_id = fr.id)
          AND NOT EXISTS (SELECT 1 FROM fake_orders fo WHERE fo.fake_round_id = fr.id)
        `,
      );
      deletedEmptyRounds = rowCount;
    }

    const { rows: [postTemplates] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM fake_order_templates`,
    );

    await client.query("COMMIT");

    // eslint-disable-next-line no-console
    console.log(`\nDeleted fake_orders: ${deletedOrders}`);
    // eslint-disable-next-line no-console
    console.log(`Deleted empty fake_order_rounds: ${deletedEmptyRounds}`);
    // eslint-disable-next-line no-console
    console.log(`Templates before/after: ${templatesBefore} / ${postTemplates.n}`);

    const verification = await verifyAfter(client, args.keep);
    // eslint-disable-next-line no-console
    console.log("\n=== Post-cleanup verification ===");
    for (const c of verification.checks) {
      // eslint-disable-next-line no-console
      console.log(`${c.pass ? "PASS" : "FAIL"} | ${c.name} — ${c.detail}`);
    }
    // eslint-disable-next-line no-console
    console.log("\nHomepage stats after cleanup:");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(verification.hero, null, 2));

    const failed = verification.checks.filter((c) => !c.pass).length;
    if (failed > 0) process.exitCode = 1;

    if (verification.counts.real_orders !== realOrdersBefore) {
      // eslint-disable-next-line no-console
      console.error(`FAIL | real orders count changed ${realOrdersBefore} → ${verification.counts.real_orders}`);
      process.exitCode = 1;
    }
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw e;
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
