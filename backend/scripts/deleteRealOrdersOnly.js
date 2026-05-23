/**
 * Delete ALL rows from `orders` (real marketplace/client orders) and dependent data.
 * Preserves: fake_orders, fake_order_*, plans, users, subscriptions, settings.
 *
 * Dry-run:
 *   node scripts/deleteRealOrdersOnly.js --dry-run
 *
 * Execute:
 *   CONFIRM_DELETE_REAL_ORDERS=true node scripts/deleteRealOrdersOnly.js
 */

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const isDryRun = process.argv.includes("--dry-run") || process.argv.includes("-n");

const REAL_ORDER_CHILD_TABLES = [
  "order_revision_requests",
  "order_submissions",
  "order_freelancer_bids",
  "order_claims",
  "client_order_payments",
  "freelancer_reviews",
  "order_files",
  "order_skills",
  "fake_order_interactions",
];

const PRESERVE_TABLES = [
  "fake_orders",
  "fake_order_templates",
  "fake_order_rounds",
  "fake_order_round_items",
  "fake_order_applications",
  "fake_order_settings",
  "fake_order_settings_plans",
  "fake_order_round_plans",
  "fake_order_automation_logs",
  "plans",
  "freelancer_subscriptions",
  "users",
  "fake_order_settings",
];

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return rows.length > 0;
}

async function countTable(client, tableName, where = "") {
  if (!(await tableExists(client, tableName))) return { exists: false, n: null };
  const w = where ? ` WHERE ${where}` : "";
  const { rows } = await client.query(`SELECT COUNT(*)::bigint AS n FROM "${tableName}"${w}`);
  return { exists: true, n: Number(rows[0].n) };
}

async function fkRefsToOrders(client) {
  const { rows } = await client.query(
    `SELECT
       tc.table_name,
       kcu.column_name,
       rc.delete_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name = 'orders'
     ORDER BY tc.table_name, kcu.column_name`,
  );
  return rows;
}

async function printPlan(client) {
  // eslint-disable-next-line no-console
  console.log("\n=== Exclusion: fake / training (NOT deleted) ===");
  for (const t of PRESERVE_TABLES) {
    const c = await countTable(client, t);
    // eslint-disable-next-line no-console
    console.log(`  KEEP ${t}: ${c.exists ? c.n : "— missing —"}`);
  }

  // eslint-disable-next-line no-console
  console.log("\n=== Real orders: tables affected (DELETE orders → CASCADE / SET NULL) ===");
  const fks = await fkRefsToOrders(client);
  for (const fk of fks) {
    const c = await countTable(client, fk.table_name);
    // eslint-disable-next-line no-console
    console.log(
      `  ${fk.table_name}.${fk.column_name} → orders (${fk.delete_rule})${c.exists ? `, rows now: ${c.n}` : ""}`,
    );
  }

  const orders = await countTable(client, "orders");
  // eslint-disable-next-line no-console
  console.log(`\n  orders (DELETE ALL): ${orders.n}`);

  const notif = await countTable(client, "notifications", `entity_type = 'order'`);
  // eslint-disable-next-line no-console
  console.log(`  notifications (entity_type=order, explicit DELETE): ${notif.exists ? notif.n : "—"}`);

  const claims = await countTable(
    client,
    "financial_claims",
    `project_id IS NOT NULL AND project_id IN (SELECT id FROM orders)`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `  financial_claims.project_id → SET NULL on order delete (linked now: ${claims.exists ? claims.n : "—"})`,
  );

  const overlap = await client.query(
    `SELECT COUNT(*)::int AS n FROM orders o INNER JOIN fake_orders fo ON fo.id = o.id`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `\n=== Integrity: id overlap orders ∩ fake_orders (must be 0 before delete) ===\n  overlap: ${overlap.rows[0].n}`,
  );
  if (Number(overlap.rows[0].n) > 0) {
    throw new Error("Refusing: same id exists in orders and fake_orders. Resolve manually first.");
  }
}

async function runDelete(client) {
  const before = {};
  for (const t of ["orders", ...REAL_ORDER_CHILD_TABLES, "notifications"]) {
    if (t === "notifications") {
      before[t] = await countTable(client, t, `entity_type = 'order'`);
    } else {
      before[t] = await countTable(client, t);
    }
  }
  before.fake_orders = await countTable(client, "fake_orders");
  before.fake_order_applications = await countTable(client, "fake_order_applications");
  before.fake_order_templates = await countTable(client, "fake_order_templates");

  if (await tableExists(client, "notifications")) {
    const delNotif = await client.query(`DELETE FROM notifications WHERE entity_type = 'order'`);
    before.notificationsDeleted = delNotif.rowCount;
  }

  const delOrders = await client.query(`DELETE FROM orders`);
  before.ordersDeleted = delOrders.rowCount;

  return before;
}

async function printAfter(client, before) {
  // eslint-disable-next-line no-console
  console.log("\n=== Deletion summary ===");
  // eslint-disable-next-line no-console
  console.log(`  orders deleted: ${before.ordersDeleted}`);
  if (before.notificationsDeleted != null) {
    // eslint-disable-next-line no-console
    console.log(`  order notifications deleted: ${before.notificationsDeleted}`);
  }

  // eslint-disable-next-line no-console
  console.log("\n=== After counts (integrity) ===");
  const orders = await countTable(client, "orders");
  // eslint-disable-next-line no-console
  console.log(`  orders: ${orders.n} (expect 0)`);
  const fo = await countTable(client, "fake_orders");
  // eslint-disable-next-line no-console
  console.log(
    `  fake_orders: ${fo.n} (was ${before.fake_orders?.n ?? "?"}, expect unchanged)`,
  );
  const apps = await countTable(client, "fake_order_applications");
  // eslint-disable-next-line no-console
  console.log(
    `  fake_order_applications: ${apps.n} (was ${before.fake_order_applications?.n ?? "?"})`,
  );
  const tpl = await countTable(client, "fake_order_templates");
  // eslint-disable-next-line no-console
  console.log(`  fake_order_templates: ${tpl.n} (was ${before.fake_order_templates?.n ?? "?"})`);

  for (const t of REAL_ORDER_CHILD_TABLES) {
    const c = await countTable(client, t);
    if (c.exists) {
      // eslint-disable-next-line no-console
      console.log(`  ${t}: ${c.n} (was ${before[t]?.n ?? "?"})`);
    }
  }

  const notif = await countTable(client, "notifications", `entity_type = 'order'`);
  // eslint-disable-next-line no-console
  console.log(`  notifications (order): ${notif.exists ? notif.n : "—"} (expect 0)`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in backend/.env");
  }

  // eslint-disable-next-line no-console
  console.warn(
    "\n*** deleteRealOrdersOnly — removes ALL rows from `orders` only.\n    Preserves fake_orders, templates, rounds, applications, settings, users, plans, subscriptions.\n",
  );

  const { pool } = require("../src/config/db");
  const client = await pool.connect();
  try {
    await printPlan(client);

    if (isDryRun) {
      // eslint-disable-next-line no-console
      console.log("\nDry-run complete. No changes made.");
      // eslint-disable-next-line no-console
      console.log("Execute: CONFIRM_DELETE_REAL_ORDERS=true node scripts/deleteRealOrdersOnly.js\n");
      return;
    }

    if (process.env.CONFIRM_DELETE_REAL_ORDERS !== "true") {
      throw new Error("Set CONFIRM_DELETE_REAL_ORDERS=true to execute (after backup + dry-run).");
    }

    await client.query("BEGIN");
    const summary = await runDelete(client);
    await client.query("COMMIT");
    await printAfter(client, summary);
    // eslint-disable-next-line no-console
    console.log("\nTransaction committed.\n");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message || err);
  process.exit(1);
});
