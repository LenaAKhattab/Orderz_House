/**
 * Marketplace Article Applications Phase B5 — isolated DB gate.
 *
 * Usage (from backend/):
 *   npm run test:marketplace-article-applications-phase-b5-gate
 *
 * NEVER Production. Does not apply migration to Production / git / deploy.
 * Applies marketplace migrations through 150 on isolated gate DB only.
 * NEVER Production. Does not apply migration to Production / git / deploy.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_article_applications_b5_pg_v4");
const PORT = 55455;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";

function buildUrl(database = DB_NAME) {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${database}`;
}

async function startEmbeddedPostgres() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch {
    throw new Error(
      "embedded-postgres required. Install: npm install --no-save embedded-postgres@18.4.0-beta.17",
    );
  }
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

async function bootstrap(client) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      account_id VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(32) NOT NULL,
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
      description TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS subcategories (
      id BIGSERIAL PRIMARY KEY,
      category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      slug VARCHAR(80) NOT NULL,
      name VARCHAR(140) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (category_id, slug)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_code VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL DEFAULT 'B5 Order',
      description TEXT NOT NULL DEFAULT 'B5 gate',
      category_id BIGINT NULL REFERENCES categories(id) ON DELETE SET NULL,
      project_type VARCHAR(20) NOT NULL DEFAULT 'bidding',
      budget NUMERIC(12,3) NULL,
      currency_code VARCHAR(3) NULL DEFAULT 'JOD',
      bid_budget_min NUMERIC(12,2) NULL DEFAULT 10,
      bid_budget_max NUMERIC(12,2) NULL DEFAULT 100,
      duration_value INT NOT NULL DEFAULT 7,
      duration_unit VARCHAR(10) NOT NULL DEFAULT 'days',
      created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
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
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      message TEXT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, freelancer_user_id)
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const marketplaceMigrations = [
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
    "149_marketplace_article_applications.sql",
    "150_article_application_bid_credit_economics.sql",
  ];

  const migrationsDir = path.join(BACKEND_ROOT, "sql", "migrations");
  for (const file of marketplaceMigrations) {
    const version = file.replace(/\.sql$/i, "");
    // eslint-disable-next-line no-await-in-loop
    const exists = await client.query(
      `SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1`,
      [version],
    );
    if (exists.rows[0]) continue;
    const raw = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const statements = splitSqlStatements(stripSqlLineComments(raw));
    // eslint-disable-next-line no-console
    console.log(`[gate-migrate] ${file}`);
    for (const stmt of statements) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(stmt);
    }
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
      [version],
    );
  }

  const must149 = await client.query(
    `SELECT 1 FROM schema_migrations WHERE version = '149_marketplace_article_applications'`,
  );
  if (!must149.rows[0]) throw new Error("Migration 149 missing after gate bootstrap");
  const must150 = await client.query(
    `SELECT 1 FROM schema_migrations WHERE version = '150_article_application_bid_credit_economics'`,
  );
  if (!must150.rows[0]) throw new Error("Migration 150 missing after gate bootstrap");
  const econ = await client.query(
    `SELECT to_regclass('public.marketplace_article_application_bid_credit_economics') AS t`,
  );
  if (!econ.rows[0]?.t) throw new Error("Article Bid economics table missing after gate bootstrap");
}

async function main() {
  const probe = classifyDatabaseUrl(process.env.DATABASE_URL || "");
  if (probe.isProduction) {
    throw new Error(`B5 GATE REFUSED PRODUCTION: ${probe.maskedTarget}`);
  }

  const pg = await startEmbeddedPostgres();
  const url = buildUrl();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await bootstrap(client);
  } finally {
    await client.end();
  }

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "test/marketplaceArticleApplicationsPhaseB5Gate.test.js"],
      {
        cwd: BACKEND_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: url,
          ORDERZ_GATE_ISOLATED_DB: "1",
          JWT_SECRET: process.env.JWT_SECRET || "marketplace-article-applications-b5-gate-secret",
        },
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`B5 gate tests failed with code ${code}`));
    });
  });

  try {
    await pg.stop();
  } catch {
    /* Windows EBUSY on data dir cleanup is non-fatal after tests pass */
  }
  // eslint-disable-next-line no-console
  console.log("ARTICLE_PHASE_B5_GATE_PASS");
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
