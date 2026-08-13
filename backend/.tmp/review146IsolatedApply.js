/**
 * One-shot isolated review: apply marketplace chain 134..146 and verify Bid Credits foundation.
 * NOT Production. NOT a permanent gate. Safe to delete.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("../scripts/lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_bid_credits_146_review_pg");
const PORT = 55446;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";
const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;

async function execSqlFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const stmts = splitSqlStatements(stripSqlLineComments(raw));
  for (const stmt of stmts) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
}

async function bootstrap(client) {
  await execSqlFile(client, path.join(BACKEND_ROOT, "sql", "init.sql"));
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
    CREATE TABLE IF NOT EXISTS roles (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(64) NOT NULL UNIQUE,
      display_name VARCHAR(120) NOT NULL,
      description TEXT NULL,
      is_system BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_roles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, role_id)
    );
    INSERT INTO roles (name, display_name, description, is_system)
    VALUES
      ('super_admin', 'سوبر أدمن', 'x', TRUE),
      ('admin', 'أدمن', 'x', TRUE),
      ('client', 'عميل', 'x', TRUE),
      ('freelancer', 'مستقل', 'x', TRUE)
    ON CONFLICT (name) DO NOTHING;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      title VARCHAR(200) NOT NULL DEFAULT 'gate',
      description TEXT NOT NULL DEFAULT 'gate',
      category_id BIGINT NULL,
      project_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
      budget NUMERIC(12,3) NULL,
      currency_code VARCHAR(3) NULL,
      bid_budget_min NUMERIC(12,2) NULL,
      bid_budget_max NUMERIC(12,2) NULL,
      duration_value INT NOT NULL DEFAULT 7,
      duration_unit VARCHAR(10) NOT NULL DEFAULT 'days',
      created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_by_role VARCHAR(20) NOT NULL DEFAULT 'super_admin',
      source_type VARCHAR(40) NOT NULL DEFAULT 'admin',
      assigned_freelancer_id BIGINT NULL,
      accepted_freelancer_id BIGINT NULL,
      selected_bid_id BIGINT NULL,
      received_at TIMESTAMPTZ NULL,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      is_open_for_pool BOOLEAN NOT NULL DEFAULT TRUE,
      payment_required BOOLEAN NOT NULL DEFAULT FALSE,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
      order_status VARCHAR(40) NOT NULL DEFAULT 'open_for_bids',
      visibility_scope VARCHAR(20) NOT NULL DEFAULT 'public',
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS subcategory_id BIGINT NULL;
    CREATE TABLE IF NOT EXISTS order_freelancer_bids (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      is_fake_bid BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, freelancer_user_id)
    );
  `);
}

(async () => {
  if (classifyDatabaseUrl(url).isProduction) throw new Error("refusing production");
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
  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  try {
    await bootstrap(client);
    const files = [
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
    ];
    const dir = path.join(BACKEND_ROOT, "sql", "migrations");
    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");
      const exists = await client.query(
        `SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1`,
        [version],
      );
      if (exists.rows[0]) continue;
      console.log("[apply]", file);
      await execSqlFile(client, path.join(dir, file));
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [version],
      );
    }

    const q = async (sql, label) => {
      const r = await client.query(sql);
      console.log(label, JSON.stringify(r.rows[0] ?? r.rows));
      return r.rows[0];
    };
    await q(
      `SELECT count(*)::int AS c FROM schema_migrations WHERE version='146_marketplace_bid_credits_foundation'`,
      "SM146",
    );
    await q(
      `SELECT count(*)::int AS c FROM schema_migrations WHERE version='145_marketplace_article_level_model'`,
      "SM145",
    );
    await q(`SELECT to_regclass('public.marketplace_bid_credit_grants') IS NOT NULL AS ok`, "GRANTS");
    await q(`SELECT to_regclass('public.marketplace_bid_credit_ledger_entries') IS NOT NULL AS ok`, "LEDGER");
    await q(`SELECT to_regclass('public.marketplace_bid_credit_packages') IS NOT NULL AS ok`, "PACKAGES");
    await q(
      `SELECT to_regclass('public.marketplace_membership_bid_distribution_months') IS NOT NULL AS ok`,
      "DIST",
    );
    await q(`SELECT to_regclass('public.freelancer_work_token_wallets') IS NOT NULL AS ok`, "WT_WALLETS");
    await q(`SELECT to_regclass('public.work_token_ledger_entries') IS NOT NULL AS ok`, "WT_LEDGER");
    await q(`SELECT to_regclass('public.work_token_reservations') IS NOT NULL AS ok`, "WT_RES");
    await q(`SELECT to_regclass('public.marketplace_articles') IS NOT NULL AS ok`, "ARTICLES");
    await q(`SELECT bid_credits_enabled FROM marketplace_economy_settings LIMIT 1`, "BID_FLAG");
    await q(
      `SELECT count(*)::int AS nonzero FROM marketplace_membership_plans WHERE monthly_bid_allowance <> 0`,
      "BID_ALLOW_NONZERO",
    );
    await q(
      `SELECT count(*)::int AS nonzero FROM marketplace_membership_plans WHERE included_tokens_per_cycle <> 0`,
      "TOKENS_NONZERO",
    );
    await q(`SELECT count(*)::int AS c FROM marketplace_bid_credit_grants`, "GRANT_ROWS");
    await q(`SELECT count(*)::int AS c FROM marketplace_bid_credit_ledger_entries`, "LEDGER_ROWS");
    await q(`SELECT count(*)::int AS c FROM marketplace_bid_credit_packages`, "PACKAGE_ROWS");
    await q(
      `SELECT count(*)::int AS c FROM marketplace_membership_bid_distribution_months`,
      "DIST_ROWS",
    );
    await q(
      `SELECT work_tokens_enabled, priority_bidding_enabled, fair_work_distribution_enabled, elite_engine_enabled FROM marketplace_economy_settings LIMIT 1`,
      "FLAGS",
    );
    console.log("MIGRATION_146_ISOLATED_APPLY = PASS");
  } finally {
    await client.end().catch(() => {});
    await pg.stop();
  }
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
