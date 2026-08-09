/**
 * Dev QA: admin create goes to fake_orders only (not fake_order_templates).
 * Run: node scripts/qaAdminFakeOrderCreateOnly.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: true });

const { guardQaOrSeed } = require("./lib/assertScriptDatabaseAllowed");
guardQaOrSeed(require("path").basename(__filename));

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");

async function main() {
  const before = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM fake_orders) AS fake_orders,
      (SELECT COUNT(*)::int FROM fake_order_templates) AS templates
  `);
  const fakeBefore = before.rows[0].fake_orders;
  const templatesBefore = before.rows[0].templates;
  console.log("BEFORE", { fake_orders: fakeBefore, fake_order_templates: templatesBefore });

  const adminRes = await pool.query(
    `SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  const adminId = adminRes.rows[0]?.id;
  if (!adminId) throw new Error("No active admin user found");

  const catRes = await pool.query(`SELECT id FROM categories WHERE is_active = TRUE ORDER BY id LIMIT 1`);
  const categoryId = catRes.rows[0]?.id;
  if (!categoryId) throw new Error("No active category found");

  const created = await fakeOrdersService.createFakeOrder({
    actorUserId: adminId,
    payload: {
      title: `QA admin pool order ${Date.now()}`,
      description: "QA verify admin create inserts fake_orders only",
      categoryId,
      projectType: "fixed",
      budget: 99,
      durationValue: 3,
      durationUnit: "days",
    },
  });

  const after = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM fake_orders) AS fake_orders,
      (SELECT COUNT(*)::int FROM fake_order_templates) AS templates
  `);
  const fakeAfter = after.rows[0].fake_orders;
  const templatesAfter = after.rows[0].templates;

  const rowRes = await pool.query(
    `SELECT id, template_id, source_type, title FROM fake_orders WHERE id = $1`,
    [created.id],
  );
  const row = rowRes.rows[0];

  console.log("CREATED", { id: row.id, template_id: row.template_id, source_type: row.source_type, title: row.title });
  console.log("AFTER", { fake_orders: fakeAfter, fake_order_templates: templatesAfter });

  const checks = {
    fakeOrdersIncreased: fakeAfter === fakeBefore + 1,
    templatesUnchanged: templatesAfter === templatesBefore,
    templateIdNull: row.template_id == null,
    sourceAdminCreated: row.source_type === "admin_created",
  };
  console.log("CHECKS", checks);

  const visibleRes = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM fake_order_round_items ri
      WHERE ri.fake_order_id = $1 AND ri.status = 'active' AND ri.visible_until > NOW()
    ) AS visible`,
    [row.id],
  );
  const appsRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM fake_order_applications WHERE fake_order_id = $1`,
    [row.id],
  );
  const visible = Boolean(visibleRes.rows[0]?.visible);
  const apps = Number(appsRes.rows[0]?.c || 0);
  const safeToDelete = !visible && apps === 0 && row.source_type === "admin_created" && row.template_id == null;

  if (safeToDelete) {
    await fakeOrdersService.deleteFakeOrder({ actorUserId: adminId, id: row.id });
    const final = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM fake_orders) AS fake_orders,
        (SELECT COUNT(*)::int FROM fake_order_templates) AS templates
    `);
    console.log("DELETED_QA_ROW", { id: row.id });
    console.log("FINAL", { fake_orders: final.rows[0].fake_orders, fake_order_templates: final.rows[0].templates });
    console.log("RESTORED", {
      fake_orders: final.rows[0].fake_orders === fakeBefore,
      templates: final.rows[0].templates === templatesBefore,
    });
  } else {
    console.log("SKIP_DELETE", { visible, apps, id: row.id });
  }

  const ok = Object.values(checks).every(Boolean);
  if (!ok) process.exitCode = 1;
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
