/**
 * Isolated apply review for Migration 148 (NOT Production).
 * Uses embedded-postgres. Applies 134..148, verifies schema, re-runs 148.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("../scripts/lib/splitSqlStatements");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_priority_148_review_pg");
const PORT = 55450;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";
const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;

async function startEmbeddedPostgres() {
  let EmbeddedPostgres;
  try {
    ({ default: EmbeddedPostgres } = await import("embedded-postgres"));
  } catch (err) {
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

async function execSqlFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const stmts = splitSqlStatements(stripSqlLineComments(raw));
  for (const stmt of stmts) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
  return stmts.length;
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
      order_status VARCHAR(40) NOT NULL DEFAULT 'draft',
      source_type VARCHAR(40) NOT NULL DEFAULT 'admin_created',
      visibility_scope VARCHAR(40) NOT NULL DEFAULT 'public',
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      is_open_for_pool BOOLEAN NOT NULL DEFAULT FALSE,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      assigned_freelancer_id BIGINT NULL,
      accepted_freelancer_id BIGINT NULL,
      selected_bid_id BIGINT NULL,
      received_at TIMESTAMPTZ NULL,
      created_by_user_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_freelancer_bids (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12,2) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      is_fake_bid BOOLEAN NOT NULL DEFAULT FALSE,
      fake_round_id BIGINT NULL,
      proposal_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, freelancer_user_id)
    );
  `);
}

async function main() {
  const pg = await startEmbeddedPostgres();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await bootstrap(client);
    const files = fs
      .readdirSync(path.join(BACKEND_ROOT, "sql", "migrations"))
      .filter((f) => /^\d+_.*\.sql$/i.test(f))
      .sort()
      .filter((f) => {
        const n = Number(f.slice(0, 3));
        return n >= 134 && n <= 148;
      })
      .map((f) => path.join(BACKEND_ROOT, "sql", "migrations", f));

    const applied = [];
    for (const file of files) {
      const stmtCount = await execSqlFile(client, file);
      applied.push({ file: path.basename(file), stmtCount });
    }

    const stmt148Again = await execSqlFile(
      client,
      path.join(BACKEND_ROOT, "sql", "migrations", "148_priority_application_boost.sql"),
    );

    const flag = await client.query(
      `SELECT priority_application_boost_enabled FROM marketplace_economy_settings WHERE id = 1`,
    );
    const boosts = await client.query(
      `SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts`,
    );
    const auctions = await client.query(`SELECT to_regclass('public.priority_bid_auctions') AS t`);
    const auctionBids = await client.query(`SELECT to_regclass('public.priority_auction_bids') AS t`);
    const bidEcon = await client.query(
      `SELECT to_regclass('public.order_freelancer_bid_credit_economics') AS t`,
    );
    const mig = await client.query(
      `SELECT version FROM schema_migrations WHERE version LIKE '148%'`,
    );
    const constraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
       WHERE conrelid = 'order_freelancer_priority_application_boosts'::regclass
         AND contype IN ('u','c','f')
       ORDER BY conname`);
    const indexes = await client.query(`
      SELECT indexname FROM pg_indexes
       WHERE tablename = 'order_freelancer_priority_application_boosts'
       ORDER BY indexname`);
    const engines = await client.query(`
      SELECT bid_credits_enabled, priority_bidding_enabled, work_tokens_enabled,
             priority_application_boost_enabled, fair_work_distribution_enabled,
             elite_engine_enabled
        FROM marketplace_economy_settings WHERE id=1`);

    // Ensure no DML side effects on engines
    const enginesOff =
      engines.rows[0].bid_credits_enabled === false &&
      engines.rows[0].priority_bidding_enabled === false &&
      engines.rows[0].work_tokens_enabled === false &&
      engines.rows[0].priority_application_boost_enabled === false;

    console.log(
      JSON.stringify(
        {
          ok: true,
          MIGRATION_148_ISOLATED_APPLY: enginesOff && boosts.rows[0].c === 0 ? "PASS" : "FAIL",
          applied,
          stmt148Again,
          flag: flag.rows[0],
          boostRowCount: boosts.rows[0].c,
          legacyAuctionsPreserved: Boolean(auctions.rows[0].t),
          legacyAuctionBidsPreserved: Boolean(auctionBids.rows[0].t),
          bidCreditEconomicsPreserved: Boolean(bidEcon.rows[0].t),
          schemaMigration148: mig.rows,
          constraints: constraints.rows,
          indexes: indexes.rows,
          engines: engines.rows[0],
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end().catch(() => {});
    await pg.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
