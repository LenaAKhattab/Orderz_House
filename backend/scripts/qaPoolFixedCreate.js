/**
 * Dev-only final QA: Training Orders Pool fixed create + optional cleanup.
 * Usage: node scripts/qaPoolFixedCreate.js
 */
require("dotenv").config();

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("../src/services/trainingPoolEligibility");
const { assertMutatingScriptAllowed } = require("./lib/destructiveScriptSafety");

const CONFIRM_VAR = "CONFIRM_QA_POOL_FIXED_CREATE";

const QA_TITLE_PREFIX = "UI QA Fixed Pool Order";

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

async function pickCategoryHierarchy(client) {
  const { rows } = await client.query(
    `SELECT c.id AS category_id, sc.id AS subcategory_id, ssc.id AS sub_subcategory_id
     FROM categories c
     INNER JOIN subcategories sc ON sc.category_id = c.id AND sc.is_active = TRUE
     INNER JOIN sub_subcategories ssc ON ssc.subcategory_id = sc.id AND ssc.is_active = TRUE
     WHERE c.is_active = TRUE
     ORDER BY c.id, sc.id, ssc.id
     LIMIT 1`,
  );
  return rows[0] || null;
}

async function verifyRow(client, id) {
  const { rows } = await client.query(
    `SELECT fo.*,
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
     WHERE fo.id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function safeDeleteQaRow(client, row) {
  if (!row) return { deleted: false, reason: "row missing" };
  const checks = {
    adminCreated: row.source_type === "admin_created",
    templateNull: row.template_id == null,
    titleMatch: String(row.title).startsWith(QA_TITLE_PREFIX),
    notVisible: !row.currently_visible,
    noApps: Number(row.applications_count) === 0,
  };
  if (!Object.values(checks).every(Boolean)) {
    return { deleted: false, reason: "safety checks failed", checks };
  }
  await client.query("BEGIN");
  const { rowCount } = await client.query(
    `DELETE FROM fake_orders
     WHERE id = $1
       AND source_type = 'admin_created'
       AND template_id IS NULL
       AND title LIKE $2`,
    [Number(row.id), `${QA_TITLE_PREFIX}%`],
  );
  if (rowCount !== 1) {
    await client.query("ROLLBACK");
    return { deleted: false, reason: `expected 1 delete, got ${rowCount}` };
  }
  await client.query("COMMIT");
  return { deleted: true, id: String(row.id) };
}

async function main() {
  assertMutatingScriptAllowed({
    scriptName: "qaPoolFixedCreate.js",
    confirmVar: CONFIRM_VAR,
    requireConfirmAlways: true,
  });

  const client = await pool.connect();
  try {
    const before = await snapshot(client);
    const admin = await pool.query(
      `SELECT id FROM users WHERE role IN ('super_admin', 'admin') ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1`,
    );
    const actorUserId = admin.rows[0]?.id;
    if (!actorUserId) throw new Error("No admin user");

    const hierarchy = await pickCategoryHierarchy(client);
    if (!hierarchy) throw new Error("No category hierarchy for QA payload");

    const title = `${QA_TITLE_PREFIX} ${Date.now()}`;
    const payload = {
      title,
      description: "Final UI sanity QA fixed training order after budget constraint fix.",
      categoryId: hierarchy.category_id,
      subcategoryId: hierarchy.subcategory_id,
      subSubcategoryId: hierarchy.sub_subcategory_id,
      projectType: "fixed",
      budget: 150,
      durationValue: 10,
      durationUnit: "days",
      isActive: true,
    };

    const created = await fakeOrdersService.createFakeOrder({ actorUserId, payload });
    const dbRow = await verifyRow(client, Number(created.id));

    const list = await fakeOrdersService.listFakeOrders({
      actorUserId,
      page: 1,
      limit: 5,
    });

    const rowChecks = {
      exists: Boolean(dbRow),
      source_type_admin_created: dbRow?.source_type === "admin_created",
      template_id_null: dbRow?.template_id == null,
      project_type_fixed: dbRow?.project_type === "fixed",
      budget_set: dbRow?.budget != null,
      bid_min_null: dbRow?.bid_budget_min == null,
      bid_max_null: dbRow?.bid_budget_max == null,
      is_published: dbRow?.is_published === true,
      is_open_for_pool: dbRow?.is_open_for_pool === true,
      is_archived_false: dbRow?.is_archived === false,
      not_visible: !dbRow?.currently_visible,
    };

    const afterCreate = await snapshot(client);
    const topListId = list.fakeOrders?.[0]?.id;
    const uiFlow = {
      note: "UI modal/toast verified by code path; create uses same POST payload as AdminInternalOrderWizard fake-order mode",
      apiCreateSucceeded: Boolean(created?.id),
      listRefetchTopId: topListId != null ? String(topListId) : null,
      createdId: String(created.id),
      appearsAtTopOfList: String(topListId) === String(created.id),
      totalIncreasedByOne: afterCreate.fake_orders === before.fake_orders + 1,
      wizardSuccessToast: "AdminInternalOrderWizard pushes tpl(toast.createdTitle/createdMessage) on success",
      modalCloses: "TrainingOrderTemplatesPage onCreated closes modal + loadList()",
      noRawPgError: "rethrowFakeOrderBudgetConstraintError maps constraint to friendly 400",
    };

    const cleanup = await safeDeleteQaRow(client, dbRow);
    const afterCleanup = cleanup.deleted ? await snapshot(client) : afterCreate;

    console.log(
      JSON.stringify(
        {
          qa: "Training Orders Pool fixed create",
          environment: process.env.NODE_ENV || "development",
          countsBefore: before,
          payload,
          created: {
            id: String(created.id),
            projectType: created.projectType,
            title: created.title,
          },
          dbRow: dbRow
            ? {
                id: String(dbRow.id),
                title: dbRow.title,
                source_type: dbRow.source_type,
                template_id: dbRow.template_id,
                project_type: dbRow.project_type,
                budget: dbRow.budget,
                currency_code: dbRow.currency_code,
                bid_budget_min: dbRow.bid_budget_min,
                bid_budget_max: dbRow.bid_budget_max,
                is_published: dbRow.is_published,
                is_open_for_pool: dbRow.is_open_for_pool,
                is_archived: dbRow.is_archived,
                currently_visible: dbRow.currently_visible,
                applications_count: dbRow.applications_count,
              }
            : null,
          rowChecks,
          uiFlow,
          countsAfterCreate: afterCreate,
          deltasAfterCreate: {
            fake_orders: afterCreate.fake_orders - before.fake_orders,
            fake_order_templates: afterCreate.fake_order_templates - before.fake_order_templates,
            visible_training_orders: afterCreate.visible_training_orders - before.visible_training_orders,
            availableOrdersNow: afterCreate.availableOrdersNow - before.availableOrdersNow,
            completedOrders: afterCreate.completedOrders - before.completedOrders,
            activeRoundUnchanged: String(before.active_round_id) === String(afterCreate.active_round_id),
          },
          qaRowDisposition: cleanup.deleted ? "deleted after verification" : "kept",
          cleanup,
          countsAfterCleanup: afterCleanup,
          countsRestoredTo401: cleanup.deleted ? afterCleanup.fake_orders === 401 : null,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
