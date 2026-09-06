/**
 * Isolated apply of 156_default_plan_catalog.sql. NEVER Production.
 * Review-only. Does not git add / deploy / change Production.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const { splitSqlStatements, stripSqlLineComments } = require("../scripts/lib/splitSqlStatements");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "migration_156_review_pg");
const PORT = 55472;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";
const EXPECTED_SHA =
  "19165232B16C0B4766AAE8B4EC2E66D88131C0BF13357255AAB779108CF0D720";

function buildUrl(database = DB_NAME) {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${database}`;
}

async function startEmbeddedPostgres() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: false,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB_NAME);
  return pg;
}

async function execSql(client, sql) {
  const stmts = splitSqlStatements(stripSqlLineComments(sql));
  for (const stmt of stmts) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
  return stmts.length;
}

async function main() {
  const probe = classifyDatabaseUrl(process.env.DATABASE_URL || "");
  if (probe.isProduction) {
    throw new Error(`ISOLATED REVIEW REFUSED PRODUCTION: ${probe.maskedTarget}`);
  }

  const sqlPath = path.join(BACKEND_ROOT, "sql", "migrations", "156_default_plan_catalog.sql");
  const raw = fs.readFileSync(sqlPath);
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase();
  if (sha256 !== EXPECTED_SHA) {
    throw new Error(`CHECKSUM_MISMATCH ${sha256}`);
  }

  const pg = await startEmbeddedPostgres();
  const client = new Client({ connectionString: buildUrl() });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL DEFAULT 'x@x.test'
      );
      CREATE TABLE schema_migrations (
        version VARCHAR(120) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NULL,
        updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE plans (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'sentinel',
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
      CREATE TABLE plan_pages (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'sentinel',
        page_type TEXT NOT NULL DEFAULT 'default'
      );
      CREATE TABLE marketplace_membership_plans (
        id BIGSERIAL PRIMARY KEY,
        tier_code TEXT NOT NULL DEFAULT 'starter',
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
      INSERT INTO plans (title) VALUES ('keep-me');
      INSERT INTO plan_pages (title) VALUES ('keep-me');
      INSERT INTO marketplace_membership_plans (tier_code) VALUES ('starter');
    `);

    const before = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM plans) AS plans,
        (SELECT COUNT(*)::int FROM plan_pages) AS plan_pages,
        (SELECT COUNT(*)::int FROM marketplace_membership_plans) AS membership_plans,
        (SELECT COUNT(*)::int FROM system_settings) AS settings,
        (SELECT COUNT(*)::int FROM schema_migrations) AS migrations
    `);

    const stmtCount = await execSql(client, raw.toString("utf8"));

    const afterFirst = await client.query(`
      SELECT key, value FROM system_settings WHERE key = 'default_plan_catalog'
    `);
    const migFirst = await client.query(`
      SELECT version FROM schema_migrations WHERE version = '156_default_plan_catalog'
    `);

    await execSql(client, raw.toString("utf8"));

    await client.query(`
      UPDATE system_settings SET value = 'page_plans' WHERE key = 'default_plan_catalog'
    `);
    await execSql(client, raw.toString("utf8"));

    const afterOwner = await client.query(`
      SELECT key, value FROM system_settings WHERE key = 'default_plan_catalog'
    `);
    const afterCounts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM plans) AS plans,
        (SELECT COUNT(*)::int FROM plan_pages) AS plan_pages,
        (SELECT COUNT(*)::int FROM marketplace_membership_plans) AS membership_plans,
        (SELECT COUNT(*)::int FROM system_settings) AS settings,
        (SELECT COUNT(*)::int FROM schema_migrations) AS migrations
    `);
    const tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const report = {
      isolated: true,
      sha256,
      shaMatch: true,
      statementCount: stmtCount,
      firstInsert: afterFirst.rows[0] || null,
      migrationRow: migFirst.rows[0] || null,
      afterOwnerPreserved: afterOwner.rows[0] || null,
      before: before.rows[0],
      after: afterCounts.rows[0],
      publicTables: tables.rows.map((r) => r.tablename),
      planRowsUnchanged: before.rows[0].plans === afterCounts.rows[0].plans,
      pageRowsUnchanged: before.rows[0].plan_pages === afterCounts.rows[0].plan_pages,
      membershipRowsUnchanged:
        before.rows[0].membership_plans === afterCounts.rows[0].membership_plans,
      ownerValueNotOverwritten: afterOwner.rows[0]?.value === "page_plans",
      firstValueMarketplace: afterFirst.rows[0]?.value === "marketplace_plans",
      settingsCountIsOne: afterCounts.rows[0].settings === 1,
      migrationRegistered: migFirst.rows.length === 1,
    };
    report.ok =
      report.firstValueMarketplace &&
      report.ownerValueNotOverwritten &&
      report.planRowsUnchanged &&
      report.pageRowsUnchanged &&
      report.membershipRowsUnchanged &&
      report.settingsCountIsOne &&
      report.migrationRegistered;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(2);
  } finally {
    await client.end().catch(() => {});
    await pg.stop().catch(() => {});
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
