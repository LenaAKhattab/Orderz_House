/**
 * Dev-only: delete investigation probe fake_orders (ids 2216, 2219).
 * Usage: node scripts/cleanupProbeFakeOrders.js
 */
require("dotenv").config();

const { pool } = require("../src/config/db");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("../src/services/trainingPoolEligibility");
const { assertMutatingScriptAllowed } = require("./lib/destructiveScriptSafety");

const CONFIRM_VAR = "CONFIRM_CLEANUP_PROBE_FAKE_ORDERS";

const TARGETS = [
  { id: 2216, title: "INVESTIGATION_PROBE_ORDER_DELETE_ME" },
  { id: 2219, titlePrefix: "QA Fixed Pool Order" },
];

async function countVisibleTraining(client) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT fo.id)::int AS c
     ${trainingPoolVisibleFromSql()}
     WHERE ${trainingPoolVisibleWhereSql({ anyAudience: true })}`,
  );
  return rows[0].c;
}

async function snapshot(client) {
  publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
  const hero = await publicHomeOrderStatsService.queryHeroOrderCounts();
  const [fakeOrders, templates, activeRound, visible] = await Promise.all([
    client.query(`SELECT COUNT(*)::int AS c FROM fake_orders`),
    client.query(`SELECT COUNT(*)::int AS c FROM fake_order_templates`),
    client.query(
      `SELECT id, status FROM fake_order_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1`,
    ),
    countVisibleTraining(client),
  ]);
  return {
    fake_orders: fakeOrders.rows[0].c,
    fake_order_templates: templates.rows[0].c,
    active_round_id: activeRound.rows[0]?.id ?? null,
    active_round_status: activeRound.rows[0]?.status ?? null,
    visible_training_orders: visible,
    availableOrdersNow: hero.availableOrdersNow,
    completedOrders: hero.completedOrders,
  };
}

async function loadTargetRows(client) {
  const { rows } = await client.query(
    `SELECT fo.id, fo.title, fo.source_type, fo.template_id, fo.fake_round_id,
            EXISTS (
              SELECT 1 FROM fake_order_round_items ri
              INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
              WHERE ri.fake_order_id = fo.id
                AND ri.status = 'active'
                AND fr.status = 'active'
                AND ri.visible_from <= NOW()
                AND ri.visible_until > NOW()
            ) AS currently_visible,
            (SELECT COUNT(*)::int FROM fake_order_applications fa WHERE fa.fake_order_id = fo.id) AS applications_count
     FROM fake_orders fo
     WHERE fo.id = ANY($1::bigint[])`,
    [TARGETS.map((t) => t.id)],
  );
  return rows;
}

function validateTargets(rows) {
  const checks = {
    bothExist: rows.length === 2,
    allAdminCreated: rows.every((r) => r.source_type === "admin_created"),
    allTemplateIdNull: rows.every((r) => r.template_id == null),
    noneVisible: rows.every((r) => !r.currently_visible),
    noApplications: rows.every((r) => Number(r.applications_count) === 0),
    titlesMatch: false,
    notInActiveRound319: rows.every(
      (r) => r.fake_round_id == null || Number(r.fake_round_id) !== 319,
    ),
  };

  const byId = Object.fromEntries(rows.map((r) => [String(r.id), r]));
  const t2216 = byId["2216"];
  const t2219 = byId["2219"];
  checks.titlesMatch =
    Boolean(t2216) &&
    t2216.title === "INVESTIGATION_PROBE_ORDER_DELETE_ME" &&
    Boolean(t2219) &&
    String(t2219.title).startsWith("QA Fixed Pool Order");

  checks.safeToDelete =
    checks.bothExist &&
    checks.allAdminCreated &&
    checks.allTemplateIdNull &&
    checks.noneVisible &&
    checks.noApplications &&
    checks.titlesMatch;

  return { checks, rows, byId };
}

async function main() {
  assertMutatingScriptAllowed({
    scriptName: "cleanupProbeFakeOrders.js",
    confirmVar: CONFIRM_VAR,
    requireConfirmAlways: true,
  });

  const client = await pool.connect();
  try {
    const before = await snapshot(client);
    const targetRows = await loadTargetRows(client);
    const { checks, rows } = validateTargets(targetRows);

    const safety = {
      environment: process.env.NODE_ENV || "development",
      targets: TARGETS,
      foundRows: rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        source_type: r.source_type,
        template_id: r.template_id,
        fake_round_id: r.fake_round_id,
        currently_visible: r.currently_visible,
        applications_count: r.applications_count,
      })),
      checks,
    };

    console.log(JSON.stringify({ phase: "before", safety, counts: before }, null, 2));

    if (!checks.safeToDelete) {
      console.error("Safety checks failed — no rows deleted.");
      process.exit(1);
    }

    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `DELETE FROM fake_orders
       WHERE id = ANY($1::bigint[])
         AND source_type = 'admin_created'
         AND template_id IS NULL
         AND (
           (id = 2216 AND title = 'INVESTIGATION_PROBE_ORDER_DELETE_ME')
           OR (id = 2219 AND title LIKE 'QA Fixed Pool Order%')
         )`,
      [TARGETS.map((t) => t.id)],
    );
    if (rowCount !== 2) {
      await client.query("ROLLBACK");
      throw new Error(`Expected to delete 2 rows, deleted ${rowCount}`);
    }
    await client.query("COMMIT");

    const after = await snapshot(client);
    const deleted = targetRows.map((r) => ({ id: String(r.id), title: r.title }));

    console.log(
      JSON.stringify(
        {
          phase: "after",
          deleted,
          countsBefore: before,
          countsAfter: after,
          deltas: {
            fake_orders: after.fake_orders - before.fake_orders,
            fake_order_templates: after.fake_order_templates - before.fake_order_templates,
            visible_training_orders: after.visible_training_orders - before.visible_training_orders,
            availableOrdersNow: after.availableOrdersNow - before.availableOrdersNow,
            completedOrders: after.completedOrders - before.completedOrders,
          },
          activeRoundUnchanged: String(before.active_round_id) === String(after.active_round_id),
          productionTouched: false,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
