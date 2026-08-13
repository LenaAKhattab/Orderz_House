/**
 * Marketplace Bid Credits Phase B3 — isolated DB gate.
 *
 * Usage (from backend/):
 *   npm run test:marketplace-bid-credits-phase-b3-gate
 *
 * NEVER points at Production. Does not git add/commit/deploy/migrate Production.
 * Applies migrations through 147 on the isolated gate DB only.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");
const {
  splitSqlStatements,
  stripSqlLineComments,
} = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_bid_credits_phase_b3_pg");
const PORT = 55448;
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
  } catch (err) {
    throw new Error(
      "embedded-postgres is required for the Phase B3 gate. Install with: npm install --no-save embedded-postgres@18.4.0-beta.17",
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

async function execSqlFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const cleaned = stripSqlLineComments(raw);
  const statements = splitSqlStatements(cleaned);
  for (const stmt of statements) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
}

async function ensureOrdersMinimalSchema(client) {
  const cats = await client.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  if (!cats.rows[0]) {
    await client.query(`
      INSERT INTO categories (slug, name, description)
      VALUES ('programming', 'Programming', 'Phase A1 gate category')
      ON CONFLICT DO NOTHING
    `).catch(async () => {
      await client.query(`
        INSERT INTO categories (name) VALUES ('Programming') ON CONFLICT DO NOTHING
      `);
    });
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_code VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL DEFAULT 'PhaseA1 Order',
      description TEXT NOT NULL DEFAULT 'Phase A1 gate order description.',
      category_id BIGINT NULL REFERENCES categories(id) ON DELETE SET NULL,
      project_type VARCHAR(20) NOT NULL CHECK (project_type IN ('fixed','bidding')),
      budget NUMERIC(12,3) NULL,
      currency_code VARCHAR(3) NULL,
      bid_budget_min NUMERIC(12,2) NULL,
      bid_budget_max NUMERIC(12,2) NULL,
      duration_value INT NOT NULL DEFAULT 7,
      duration_unit VARCHAR(10) NOT NULL DEFAULT 'days',
      created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_by_role VARCHAR(20) NOT NULL DEFAULT 'super_admin',
      source_type VARCHAR(40) NOT NULL,
      assigned_freelancer_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
      accepted_freelancer_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
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
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_by_project_type_chk;
    ALTER TABLE orders
      ADD CONSTRAINT orders_currency_by_project_type_chk
      CHECK (
        (
          project_type = 'fixed'
          AND currency_code IS NOT NULL
          AND char_length(currency_code) = 3
          AND budget IS NOT NULL
          AND budget > 0
          AND bid_budget_min IS NULL
          AND bid_budget_max IS NULL
        )
        OR
        (
          project_type = 'bidding'
          AND budget IS NULL
          AND (
            (
              currency_code IS NULL
              AND bid_budget_min IS NULL
              AND bid_budget_max IS NULL
            )
            OR
            (
              currency_code IS NOT NULL
              AND char_length(currency_code) = 3
              AND bid_budget_min IS NOT NULL
              AND bid_budget_max IS NOT NULL
              AND bid_budget_min > 0
              AND bid_budget_max >= bid_budget_min
            )
          )
        )
      );

    CREATE TABLE IF NOT EXISTS order_freelancer_bids (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      is_fake_bid BOOLEAN NOT NULL DEFAULT FALSE,
      fake_round_id BIGINT NULL,
      proposal_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, freelancer_user_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_role VARCHAR(40) NULL,
      actor_user_id BIGINT NULL,
      type VARCHAR(80) NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type VARCHAR(40) NULL,
      entity_id BIGINT NULL,
      link TEXT NULL,
      priority VARCHAR(20) NULL,
      metadata_json JSONB NULL,
      dedupe_key VARCHAR(191) NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uidx
      ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
  `);
}

async function applyInitAndMigrations(databaseUrl) {
  const classification = classifyDatabaseUrl(databaseUrl);
  if (classification.isProduction) {
    throw new Error(`Refusing gate migrate on PRODUCTION: ${classification.maskedTarget}`);
  }

  const client = new Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  try {
    await execSqlFile(client, path.join(BACKEND_ROOT, "sql", "init.sql"));
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE
    `);
    await client.query(`
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
        ('super_admin', 'سوبر أدمن', 'صلاحيات كاملة على النظام.', TRUE),
        ('admin', 'أدمن', 'صلاحيات تشغيلية حسب الصلاحيات الممنوحة.', TRUE),
        ('client', 'عميل', 'مستخدم عميل بقدرات محدودة.', TRUE),
        ('freelancer', 'مستقل', 'مستخدم مستقل بقدرات محدودة.', TRUE)
      ON CONFLICT (name) DO NOTHING;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(120) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await ensureOrdersMinimalSchema(client);

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
      "146_marketplace_bid_credits_foundation.sql",
      "147_normal_application_bid_credit_economics.sql",
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
      const cleaned = stripSqlLineComments(raw);
      const statements = splitSqlStatements(cleaned);
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

    const must = await client.query(
      `SELECT 1 FROM schema_migrations WHERE version = '147_normal_application_bid_credit_economics'`,
    );
    if (!must.rows[0]) throw new Error("Migration 147 missing after gate bootstrap");
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_name = 'marketplace_membership_plans'
          AND column_name = 'monthly_bid_allowance'`,
    );
    if (!col.rows[0]) throw new Error("monthly_bid_allowance missing after 146");
    const econ = await client.query(
      `SELECT to_regclass('public.order_freelancer_bid_credit_economics') AS t`,
    );
    if (!econ.rows[0].t) throw new Error("order_freelancer_bid_credit_economics missing after 147");
  } finally {
    await client.end();
  }
}

function runGateTests(databaseUrl) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_ENV: "test",
      NODE_ENV: "development",
      JWT_SECRET: process.env.JWT_SECRET || "marketplace-bid-credits-phase-b3-gate-secret",
      CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
      MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED: "0",
      PRIORITY_AUCTION_RESOLVE_ENABLED: "0",
      ELITE_DIRECT_OFFER_EXPIRE_ENABLED: "0",
      ORDERZ_GATE_ISOLATED_DB: "1",
    };
    delete env.STRIPE_SECRET_KEY;
    delete env.STRIPE_WEBHOOK_SECRET;

    const child = spawn(
      process.execPath,
      ["--test", "test/marketplaceBidCreditsPhaseB3Gate.test.js"],
      { cwd: BACKEND_ROOT, env, stdio: "inherit" },
    );
    child.on("exit", (code) => resolve(code == null ? 1 : code));
  });
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("=== Marketplace Bid Credits Phase B3 GATE ===");
  let pg;
  try {
    pg = await startEmbeddedPostgres();
    const url = buildUrl();
    await applyInitAndMigrations(url);
    const code = await runGateTests(url);
    process.exitCode = code;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    if (pg) {
      try {
        await pg.stop();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("embedded-postgres stop:", e && e.message ? e.message : e);
      }
    }
  }
}

main();
