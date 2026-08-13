/**
 * Migration 149 final pre-apply review — isolated apply 148→149 only.
 * NEVER Production. Does not enable engines. Does not create applications/economics.
 *
 * Usage: node scripts/reviewMigration149IsolatedApply.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "migration_149_review_pg_v2");
const PORT = 55461;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";

function buildUrl(database = DB_NAME) {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${database}`;
}

async function startEmbeddedPostgres() {
  let EmbeddedPostgres;
  ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
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

async function execFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const stmts = splitSqlStatements(stripSqlLineComments(raw));
  for (const stmt of stmts) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
  return stmts.length;
}

async function bootstrapBase(client) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      account_id VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT 'x',
      role VARCHAR(32) NOT NULL DEFAULT 'freelancer',
      first_name VARCHAR(80) NOT NULL DEFAULT '',
      father_name VARCHAR(80) NOT NULL DEFAULT '',
      family_name VARCHAR(80) NOT NULL DEFAULT '',
      phone VARCHAR(32) NOT NULL DEFAULT '',
      whatsapp VARCHAR(32) NOT NULL DEFAULT '',
      gender VARCHAR(20) NOT NULL DEFAULT 'ذكر',
      country VARCHAR(8) NOT NULL DEFAULT 'JO',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      terms_accepted BOOLEAN NOT NULL DEFAULT TRUE,
      email_verified BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      slug VARCHAR(80) UNIQUE,
      name VARCHAR(140) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS subcategories (
      id BIGSERIAL PRIMARY KEY,
      category_id BIGINT NOT NULL REFERENCES categories(id),
      slug VARCHAR(80) NOT NULL,
      name VARCHAR(140) NOT NULL,
      UNIQUE (category_id, slug)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_code VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL DEFAULT 'x',
      description TEXT NOT NULL DEFAULT 'x',
      category_id BIGINT NULL,
      project_type VARCHAR(20) NOT NULL DEFAULT 'bidding',
      budget NUMERIC(12,3) NULL,
      currency_code VARCHAR(3) NULL DEFAULT 'JOD',
      bid_budget_min NUMERIC(12,2) NULL DEFAULT 10,
      bid_budget_max NUMERIC(12,2) NULL DEFAULT 100,
      duration_value INT NOT NULL DEFAULT 7,
      duration_unit VARCHAR(10) NOT NULL DEFAULT 'days',
      created_by_user_id BIGINT NULL REFERENCES users(id),
      created_by_role VARCHAR(20) NOT NULL DEFAULT 'client',
      source_type VARCHAR(40) NOT NULL DEFAULT 'client_created',
      assigned_freelancer_id BIGINT NULL,
      accepted_freelancer_id BIGINT NULL,
      selected_bid_id BIGINT NULL,
      order_status VARCHAR(40) NOT NULL DEFAULT 'open_for_bids',
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      is_open_for_pool BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_freelancer_bids (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, freelancer_user_id)
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function main() {
  if (classifyDatabaseUrl(process.env.DATABASE_URL || "").isProduction) {
    throw new Error("REFUSED PRODUCTION");
  }

  const migDir = path.join(BACKEND_ROOT, "sql", "migrations");
  const sql149 = fs.readFileSync(path.join(migDir, "149_marketplace_article_applications.sql"));
  const checksum = crypto.createHash("sha256").update(sql149).digest("hex").toUpperCase();
  const stmtCount = splitSqlStatements(stripSqlLineComments(sql149.toString("utf8"))).length;

  const pg = await startEmbeddedPostgres();
  const client = new Client({ connectionString: buildUrl() });
  await client.connect();
  const report = { checksum, stmtCount, ok: true, errors: [] };

  try {
    await bootstrapBase(client);
    const chain = [
      "134_marketplace_membership_plans.sql",
      "135_marketplace_economy_settings.sql",
      "136_marketplace_membership_priority_bid.sql",
      "137_marketplace_memberships_cycles.sql",
      "138_marketplace_membership_phase3_1_hardening.sql",
      "139_marketplace_work_token_wallet_ledger.sql",
      "140_marketplace_normal_application_work_tokens.sql",
      "141_marketplace_priority_bid_auction.sql",
      "142_marketplace_fair_distribution.sql",
      "143_marketplace_elite_direct_orders.sql",
      "144_marketplace_membership_catalog_and_token_grants.sql",
      "145_marketplace_article_level_model.sql",
      "146_marketplace_bid_credits_foundation.sql",
      "147_normal_application_bid_credit_economics.sql",
      "148_priority_application_boost.sql",
    ];
    for (const file of chain) {
      // eslint-disable-next-line no-console
      console.log(`[review-migrate] ${file}`);
      // eslint-disable-next-line no-await-in-loop
      await execFile(client, path.join(migDir, file));
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [file.replace(/\.sql$/i, "")],
      );
    }

    // eslint-disable-next-line no-console
    console.log("[review-migrate] 149_marketplace_article_applications.sql");
    await execFile(client, path.join(migDir, "149_marketplace_article_applications.sql"));

    const flag = await client.query(
      `SELECT article_applications_enabled FROM marketplace_economy_settings WHERE id = 1`,
    );
    report.articleApplicationsEnabled = flag.rows[0]?.article_applications_enabled === true;
    if (report.articleApplicationsEnabled) report.errors.push("flag enabled");

    const apps = await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_article_applications`);
    report.applicationRows = apps.rows[0].c;
    if (report.applicationRows !== 0) report.errors.push("unexpected applications");

    const articles = await client.query(`SELECT to_regclass('public.marketplace_articles') AS t`);
    const boost = await client.query(
      `SELECT to_regclass('public.order_freelancer_priority_application_boosts') AS t`,
    );
    const bidEcon = await client.query(
      `SELECT to_regclass('public.order_freelancer_bid_credit_economics') AS t`,
    );
    const articleEcon = await client.query(
      `SELECT to_regclass('public.marketplace_article_bid_credit_economics') AS t`,
    );
    report.articlesTable = Boolean(articles.rows[0].t);
    report.boostTable = Boolean(boost.rows[0].t);
    report.bidEconTable = Boolean(bidEcon.rows[0].t);
    report.articleEconTable = Boolean(articleEcon.rows[0].t);
    if (report.articleEconTable) report.errors.push("article economics table created");

    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name='marketplace_article_applications' ORDER BY ordinal_position`,
    );
    report.columns = cols.rows.map((r) => r.column_name);
    if (report.columns.includes("bid_credit_cost")) report.errors.push("bid_credit_cost column");

    // Rerun 149
    await execFile(client, path.join(migDir, "149_marketplace_article_applications.sql"));
    const apps2 = await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_article_applications`);
    report.rerunApplicationRows = apps2.rows[0].c;

    const mig = await client.query(
      `SELECT 1 FROM schema_migrations WHERE version='149_marketplace_article_applications'`,
    );
    report.migrationBookkept = Boolean(mig.rows[0]);

    report.ok = report.errors.length === 0 && report.migrationBookkept;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    else console.log("MIGRATION_149_ISOLATED_APPLY = PASS");
  } finally {
    await client.end().catch(() => {});
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
