/**
 * Destructive cleanup: orders, courses, subscriptions-related operational data.
 *
 * NEVER auto-run. Requires explicit confirmation env vars.
 *
 * Dry-run (counts only, no writes):
 *   npm run db:cleanup:test-data -- --dry-run
 *
 * Execute (non-production):
 *   CONFIRM_DB_CLEANUP=true npm run db:cleanup:test-data
 *
 * Execute (production — extra guard):
 *   CONFIRM_DB_CLEANUP=true ALLOW_PRODUCTION_DB_CLEANUP=true NODE_ENV=production npm run db:cleanup:test-data
 *
 * Before running: pg_dump or cloud backup. Run dry-run first and verify listed tables.
 */

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const isDryRun = process.argv.includes("--dry-run") || process.argv.includes("-n");

/** Tables/views we report counts for when present (information_schema). */
const COUNT_TARGETS = [
  { label: "notifications (scoped entity types)", table: "notifications", where: `entity_type IN ('order','course','subscription','financial_claim')` },
  { label: "stripe_webhook_events", table: "stripe_webhook_events" },
  { label: "financial_freelancer_payment_allocations", table: "financial_freelancer_payment_allocations" },
  { label: "financial_freelancer_payments", table: "financial_freelancer_payments" },
  { label: "financial_claim_status_history", table: "financial_claim_status_history" },
  { label: "financial_claims", table: "financial_claims" },
  { label: "freelancer_subscriptions", table: "freelancer_subscriptions" },
  { label: "course_lesson_progress", table: "course_lesson_progress" },
  { label: "course_assignments", table: "course_assignments" },
  { label: "course_lessons", table: "course_lessons" },
  { label: "courses", table: "courses" },
  { label: "fake_order_automation_logs", table: "fake_order_automation_logs" },
  { label: "fake_order_interactions", table: "fake_order_interactions" },
  { label: "fake_order_applications", table: "fake_order_applications" },
  { label: "fake_order_round_items", table: "fake_order_round_items" },
  { label: "fake_orders", table: "fake_orders" },
  { label: "fake_order_round_plans", table: "fake_order_round_plans" },
  { label: "fake_order_rounds", table: "fake_order_rounds" },
  { label: "fake_order_templates", table: "fake_order_templates" },
  { label: "fake_order_settings_plans", table: "fake_order_settings_plans" },
  { label: "orders_backup_before_fake_split", table: "orders_backup_before_fake_split" },
  { label: "orders (real)", table: "orders" },
  { label: "order_claims", table: "order_claims" },
  { label: "order_freelancer_bids", table: "order_freelancer_bids" },
  { label: "order_files", table: "order_files" },
  { label: "order_skills", table: "order_skills" },
  { label: "client_order_payments", table: "client_order_payments" },
  { label: "order_revision_requests", table: "order_revision_requests" },
  { label: "order_submissions", table: "order_submissions" },
];

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return rows.length > 0;
}

async function countFor(client, spec) {
  const exists = await tableExists(client, spec.table);
  if (!exists) return { table: spec.table, label: spec.label, exists: false, n: null };
  const where = spec.where ? ` WHERE ${spec.where}` : "";
  const { rows } = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${quoteIdent(spec.table)}${where}`);
  return { table: spec.table, label: spec.label, exists: true, n: Number(rows[0].n) };
}

function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

async function printCounts(client, title) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${title} ===`);
  for (const spec of COUNT_TARGETS) {
    const row = await countFor(client, spec);
    if (!row.exists) {
      // eslint-disable-next-line no-console
      console.log(`[skip] ${spec.table} — not present`);
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(`${row.label}: ${row.n}`);
  }
}

function assertMayExecuteDestructive() {
  if (isDryRun) return;
  if (process.env.CONFIRM_DB_CLEANUP !== "true") {
    throw new Error(
      "Refusing to modify data: set CONFIRM_DB_CLEANUP=true (after backup and dry-run review).",
    );
  }
  if (process.env.NODE_ENV === "production") {
    if (process.env.ALLOW_PRODUCTION_DB_CLEANUP !== "true") {
      throw new Error(
        "Refusing production mutation: set ALLOW_PRODUCTION_DB_CLEANUP=true only after verified backup.",
      );
    }
  }
}

async function runCleanup(client) {
  // 1) Notifications tied to cleaned domains
  if (await tableExists(client, "notifications")) {
    await client.query(
      `DELETE FROM notifications WHERE entity_type IN ('order','course','subscription','financial_claim')`,
    );
  }

  // 2) Stripe webhook idempotency store (order + subscription webhooks)
  if (await tableExists(client, "stripe_webhook_events")) {
    await client.query(`TRUNCATE TABLE stripe_webhook_events RESTART IDENTITY`);
  }

  // 3) Subscription rows (plans catalog preserved)
  if (await tableExists(client, "freelancer_subscriptions")) {
    await client.query(`DELETE FROM freelancer_subscriptions`);
  }

  // 4) Financial claims / payouts
  if (await tableExists(client, "financial_freelancer_payment_allocations")) {
    await client.query(`DELETE FROM financial_freelancer_payment_allocations`);
  }
  if (await tableExists(client, "financial_freelancer_payments")) {
    await client.query(`DELETE FROM financial_freelancer_payments`);
  }
  if (await tableExists(client, "financial_claim_status_history")) {
    await client.query(`DELETE FROM financial_claim_status_history`);
  }
  if (await tableExists(client, "financial_claims")) {
    await client.query(`DELETE FROM financial_claims`);
  }

  // 5) Courses (FK order: progress → assignments / lessons → courses)
  if (await tableExists(client, "course_lesson_progress")) {
    await client.query(`DELETE FROM course_lesson_progress`);
  }
  if (await tableExists(client, "course_assignments")) {
    await client.query(`DELETE FROM course_assignments`);
  }
  if (await tableExists(client, "course_lessons")) {
    await client.query(`DELETE FROM course_lessons`);
  }
  if (await tableExists(client, "courses")) {
    await client.query(`DELETE FROM courses`);
  }

  // 6) Training / fake orders ecosystem (children before parents where needed)
  if (await tableExists(client, "fake_order_automation_logs")) {
    await client.query(`DELETE FROM fake_order_automation_logs`);
  }
  if (await tableExists(client, "fake_order_interactions")) {
    await client.query(`DELETE FROM fake_order_interactions`);
  }
  if (await tableExists(client, "fake_order_applications")) {
    await client.query(`DELETE FROM fake_order_applications`);
  }
  if (await tableExists(client, "fake_order_round_items")) {
    await client.query(`DELETE FROM fake_order_round_items`);
  }
  if (await tableExists(client, "fake_orders")) {
    await client.query(`DELETE FROM fake_orders`);
  }
  if (await tableExists(client, "fake_order_round_plans")) {
    await client.query(`DELETE FROM fake_order_round_plans`);
  }
  if (await tableExists(client, "fake_order_rounds")) {
    await client.query(`DELETE FROM fake_order_rounds`);
  }
  if (await tableExists(client, "fake_order_templates")) {
    await client.query(`DELETE FROM fake_order_templates`);
  }
  if (await tableExists(client, "fake_order_settings_plans")) {
    await client.query(`DELETE FROM fake_order_settings_plans`);
  }

  // 7) Legacy backup snapshot from migration 034 (if created)
  if (await tableExists(client, "orders_backup_before_fake_split")) {
    await client.query(`TRUNCATE TABLE orders_backup_before_fake_split`);
  }

  // 8) Real marketplace orders — cascades to order_files, order_skills, order_claims, order_freelancer_bids, client_order_payments
  if (await tableExists(client, "orders")) {
    await client.query(`DELETE FROM orders`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing (configure backend/.env).");
  }

  // eslint-disable-next-line no-console
  console.warn(
    "\n*** WARNING: Database cleanup — deletes orders, courses, subscription assignments, claims, and related operational rows.\n    Preserved: users, roles, permissions, categories/subcategories, plans (catalog), fake_order_settings (automation toggles), schema_migrations.\n",
  );

  const { pool } = require("../src/config/db");

  const client = await pool.connect();
  try {
    await printCounts(client, isDryRun ? "Dry-run — row counts (before)" : "Before cleanup");

    if (isDryRun) {
      // eslint-disable-next-line no-console
      console.log("\nDry-run only; no changes made. Run without --dry-run after backup + CONFIRM_DB_CLEANUP=true.\n");
      return;
    }

    assertMayExecuteDestructive();

    await client.query("BEGIN");
    await runCleanup(client);
    await client.query("COMMIT");

    await printCounts(client, "After cleanup");

    // eslint-disable-next-line no-console
    console.log("\nCleanup transaction committed.\n");
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

/*
 * --- Post-cleanup verification (run in psql / Neon SQL editor) ---
 *
 * SELECT 'orders' AS table_name, COUNT(*)::bigint AS rows FROM orders
 * UNION ALL SELECT 'fake_orders', COUNT(*) FROM fake_orders
 * UNION ALL SELECT 'freelancer_subscriptions', COUNT(*) FROM freelancer_subscriptions
 * UNION ALL SELECT 'courses', COUNT(*) FROM courses
 * UNION ALL SELECT 'financial_claims', COUNT(*) FROM financial_claims
 * UNION ALL SELECT 'notifications_scoped', COUNT(*) FROM notifications
 *   WHERE entity_type IN ('order','course','subscription','financial_claim')
 * UNION ALL SELECT 'users_kept', COUNT(*) FROM users;
 *
 * Expect scoped notifications = 0 after cleanup (script deletes those rows).
 * Expect users_kept unchanged vs pre-run backup row count.
 */
