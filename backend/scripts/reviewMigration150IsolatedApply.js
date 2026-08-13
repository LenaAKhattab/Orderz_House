/**
 * Migration 150 final pre-apply review — isolated apply 149→150.
 * NEVER Production. Does not enable engines. Does not create economic rows.
 *
 * Usage: node scripts/reviewMigration150IsolatedApply.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "migration_150_review_pg_v1");
const PORT = 55462;
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
  const probe = classifyDatabaseUrl(process.env.DATABASE_URL || "");
  if (probe.isProduction) {
    throw new Error(`ISOLATED REVIEW REFUSED PRODUCTION: ${probe.maskedTarget}`);
  }

  const migDir = path.join(BACKEND_ROOT, "sql", "migrations");
  const sql150Path = path.join(migDir, "150_article_application_bid_credit_economics.sql");
  const raw150 = fs.readFileSync(sql150Path);
  const sha256 = crypto.createHash("sha256").update(raw150).digest("hex").toUpperCase();
  const stmts150 = splitSqlStatements(stripSqlLineComments(raw150.toString("utf8")));

  const report = {
    sha256,
    statementCount: stmts150.length,
    statementsPreview: stmts150.map((s) => s.trim().slice(0, 80).replace(/\s+/g, " ")),
  };

  const pg = await startEmbeddedPostgres();
  const client = new Client({ connectionString: buildUrl() });
  await client.connect();
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
      "149_marketplace_article_applications.sql",
    ];

    for (const file of chain) {
      // eslint-disable-next-line no-console
      console.log("[review-migrate]", file);
      // eslint-disable-next-line no-await-in-loop
      await execFile(client, path.join(migDir, file));
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [file.replace(/\.sql$/i, "")],
      );
    }

    const beforeLedger = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='marketplace_bid_credit_ledger_entries'
         AND c.conname='marketplace_bid_credit_ledger_entries_event_type_check'
    `);
    const beforeSource = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='marketplace_bid_credit_grants'
         AND c.conname='marketplace_bid_credit_grants_source_type_check'
    `);
    report.beforeLedgerCheck = beforeLedger.rows[0]?.def || null;
    report.beforeSourceCheck = beforeSource.rows[0]?.def || null;

    // eslint-disable-next-line no-console
    console.log("[review-migrate] 150_article_application_bid_credit_economics.sql");
    await execFile(client, sql150Path);

    const afterLedger = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='marketplace_bid_credit_ledger_entries'
         AND c.conname='marketplace_bid_credit_ledger_entries_event_type_check'
    `);
    const afterSource = await client.query(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='marketplace_bid_credit_grants'
         AND c.conname='marketplace_bid_credit_grants_source_type_check'
    `);
    report.afterLedgerCheck = afterLedger.rows[0]?.def || null;
    report.afterSourceCheck = afterSource.rows[0]?.def || null;

    report.econTable = (
      await client.query(
        `SELECT to_regclass('public.marketplace_article_application_bid_credit_economics') IS NOT NULL AS ok`,
      )
    ).rows[0].ok;
    report.econRows = (
      await client.query(
        `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics`,
      )
    ).rows[0].c;
    report.bidGrants = (
      await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)
    ).rows[0].c;
    report.bidLedger = (
      await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)
    ).rows[0].c;
    report.articleApps = (
      await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_article_applications`)
    ).rows[0].c;
    report.orderEconPreserved = (
      await client.query(
        `SELECT to_regclass('public.order_freelancer_bid_credit_economics') IS NOT NULL AS ok`,
      )
    ).rows[0].ok;

    const flags = await client.query(
      `SELECT article_applications_enabled, bid_credits_enabled,
              work_tokens_enabled, priority_application_boost_enabled
         FROM marketplace_economy_settings WHERE id = 1`,
    );
    report.flags = flags.rows[0];

    report.mig150Bookkeeping = (
      await client.query(
        `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='150_article_application_bid_credit_economics') AS ok`,
      )
    ).rows[0].ok;

    // Accept new + prior vocabulary via CHECK (dry insert/rollback probes)
    await client.query("BEGIN");
    const u = await client.query(
      `INSERT INTO users (account_id, email, role) VALUES ('R150U1','r150@ex.com','freelancer') RETURNING id`,
    );
    const uid = u.rows[0].id;
    const priorEvents = [
      "MEMBERSHIP_BID_GRANT",
      "ADMIN_BID_GRANT",
      "ADMIN_BID_ADJUSTMENT",
      "APPLICATION_BID_CONSUME",
      "BID_EXPIRED",
      "NORMAL_APPLICATION_BID_REFUND",
      "ARTICLE_APPLICATION_BID_CONSUME",
      "ARTICLE_APPLICATION_BID_REFUND",
    ];
    const priorSources = [
      "membership_daily_unlock",
      "admin_manual",
      "admin_adjustment",
      "normal_application_refund",
      "article_application_refund",
    ];
    report.eventAccept = {};
    for (const ev of priorEvents) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO marketplace_bid_credit_ledger_entries (
             freelancer_user_id, event_type, amount, direction, idempotency_key
           ) VALUES ($1, $2, 1, 1, $3)`,
          [uid, ev, `probe-ev-${ev}`],
        );
        report.eventAccept[ev] = true;
      } catch (err) {
        report.eventAccept[ev] = String(err.message || err);
      }
    }
    report.sourceAccept = {};
    for (const src of priorSources) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO marketplace_bid_credit_grants (
             freelancer_user_id, source_type, amount_granted, amount_consumed, amount_expired,
             status, granted_at, expires_at, idempotency_key
           ) VALUES ($1, $2, 1, 0, 0, 'active', NOW(), NOW() + interval '1 day', $3)`,
          [uid, src, `probe-src-${src}`],
        );
        report.sourceAccept[src] = true;
      } catch (err) {
        report.sourceAccept[src] = String(err.message || err);
      }
    }
    await client.query("ROLLBACK");

    // Cost CHECK rejects non-1
    await client.query("BEGIN");
    try {
      // minimal fake FKs not available — probe via table constraint only if apps exist;
      // instead check constraint definition
      const costChk = await client.query(`
        SELECT pg_get_constraintdef(c.oid) AS def
          FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname='marketplace_article_application_bid_credit_economics'
           AND c.conname='marketplace_article_app_bid_econ_cost_chk'
      `);
      report.costCheckDef = costChk.rows[0]?.def || null;
    } finally {
      await client.query("ROLLBACK");
    }

    // Rerun 150
    await execFile(client, sql150Path);
    report.rerunOk = true;
    report.econRowsAfterRerun = (
      await client.query(
        `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics`,
      )
    ).rows[0].c;

    const allEventsOk = Object.values(report.eventAccept).every((v) => v === true);
    const allSourcesOk = Object.values(report.sourceAccept).every((v) => v === true);
    report.MIGRATION_150_ISOLATED_APPLY =
      report.econTable &&
      report.econRows === 0 &&
      report.bidGrants === 0 &&
      report.bidLedger === 0 &&
      report.articleApps === 0 &&
      report.orderEconPreserved &&
      report.flags?.article_applications_enabled === false &&
      report.flags?.bid_credits_enabled === false &&
      report.mig150Bookkeeping &&
      allEventsOk &&
      allSourcesOk &&
      report.rerunOk &&
      report.econRowsAfterRerun === 0
        ? "PASS"
        : "FAIL";
  } finally {
    await client.end();
    try {
      await pg.stop();
    } catch {
      /* Windows EBUSY non-fatal */
    }
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
