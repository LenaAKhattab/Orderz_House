/**
 * Verify RBAC + plans + subscriptions tables exist after migration.
 * Usage (from backend/): npm run db:verify-schema
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");

const REQUIRED = [
  "schema_migrations",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "plans",
  "freelancer_subscriptions",
  "subcategories",
  "sub_subcategories",
  "skills",
  "orders",
  "order_skills",
  "order_files",
];

async function main() {
  const client = await pool.connect();
  try {
    for (const t of REQUIRED) {
      const { rows } = await client.query(
        `SELECT to_regclass($1) AS reg`,
        [`public.${t}`],
      );
      const ok = rows[0]?.reg;
      if (!ok) {
        console.error(`MISSING TABLE: ${t}`);
        process.exit(1);
      }
      console.log(`OK table: ${t}`);
    }

    const { rows: mig } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["001_rbac_subscriptions_plans"],
    );
    if (!mig[0]) {
      console.warn("WARN: schema_migrations has no row for 001 (migration may not have completed insert step).");
    } else {
      console.log(`OK migration record: ${mig[0].version} @ ${mig[0].applied_at}`);
    }

    const { rows: mig2 } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["002_orders_internal"],
    );
    if (!mig2[0]) {
      console.warn("WARN: schema_migrations has no row for 002_orders_internal (orders migration may not have run yet).");
    } else {
      console.log(`OK migration record: ${mig2[0].version} @ ${mig2[0].applied_at}`);
    }

    const { rows: mig3 } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["003_categories_level3_programming_seed"],
    );
    if (!mig3[0]) {
      console.warn("WARN: schema_migrations has no row for 003_categories_level3_programming_seed (categories L3 migration may not have run yet).");
    } else {
      console.log(`OK migration record: ${mig3[0].version} @ ${mig3[0].applied_at}`);
    }

    const { rows: mig4 } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["004_bidding_budget_nullable"],
    );
    if (!mig4[0]) {
      console.warn("WARN: schema_migrations has no row for 004_bidding_budget_nullable (budget rule migration may not have run yet).");
    } else {
      console.log(`OK migration record: ${mig4[0].version} @ ${mig4[0].applied_at}`);
    }

    const { rows: mig5 } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["005_seed_services_from_doc"],
    );
    if (!mig5[0]) {
      console.warn("WARN: schema_migrations has no row for 005_seed_services_from_doc (services seed may not have run yet).");
    } else {
      console.log(`OK migration record: ${mig5[0].version} @ ${mig5[0].applied_at}`);
    }

    const { rows: mig6 } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["006_orders_currency"],
    );
    if (!mig6[0]) {
      console.warn("WARN: schema_migrations has no row for 006_orders_currency (currency migration may not have run yet).");
    } else {
      console.log(`OK migration record: ${mig6[0].version} @ ${mig6[0].applied_at}`);
    }

    const { rows: mig7 } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["007_orders_archive"],
    );
    if (!mig7[0]) {
      console.warn("WARN: schema_migrations has no row for 007_orders_archive (archive migration may not have run yet).");
    } else {
      console.log(`OK migration record: ${mig7[0].version} @ ${mig7[0].applied_at}`);
    }

    const { rows: mig8 } = await client.query(
      `SELECT version, applied_at FROM schema_migrations WHERE version = $1`,
      ["008_orders_extra_categories"],
    );
    if (!mig8[0]) {
      console.warn("WARN: schema_migrations has no row for 008_orders_extra_categories (extra categories migration may not have run yet).");
    } else {
      console.log(`OK migration record: ${mig8[0].version} @ ${mig8[0].applied_at}`);
    }

    const { rows: counts } = await client.query(`
      SELECT
        (SELECT count(*)::int FROM roles) AS roles,
        (SELECT count(*)::int FROM permissions) AS permissions,
        (SELECT count(*)::int FROM user_roles) AS user_roles,
        (SELECT count(*)::int FROM plans WHERE deleted_at IS NULL) AS plans,
        (SELECT count(*)::int FROM orders) AS orders,
        (SELECT count(*)::int FROM sub_subcategories) AS sub_subcategories,
        (SELECT count(*)::int FROM subcategories) AS subcategories,
        (SELECT count(*)::int FROM categories) AS categories
    `);
    console.log("Counts:", counts[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
