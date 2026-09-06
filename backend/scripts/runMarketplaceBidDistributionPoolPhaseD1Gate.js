/**
 * Phase D1 / Migration 152 — isolated DB gate (FINAL PRE-APPLY REVIEW).
 * Applies Bid Credit foundation + 152 on embedded Postgres ONLY.
 * NEVER Production. Does not git/deploy/enable engines.
 *
 * Usage: npm run test:marketplace-bid-distribution-pool-phase-d1-gate
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
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_bid_pool_d1_pg");
const PORT = 55462;
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

async function bootstrapThrough151(client) {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      account_id VARCHAR(32) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT 'x',
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
    CREATE TABLE marketplace_economy_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      bid_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      bid_credit_purchases_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO marketplace_economy_settings (id) VALUES (1);
    CREATE TABLE marketplace_membership_bid_distribution_months (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_bid_credit_packages (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      name_ar VARCHAR(200) NOT NULL,
      name_en VARCHAR(200) NULL,
      bid_quantity INTEGER NOT NULL CHECK (bid_quantity > 0),
      price_jod NUMERIC(12,3) NOT NULL CHECK (price_jod > 0),
      validity_days INTEGER NOT NULL CHECK (validity_days >= 1),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_bid_credit_grants (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      source_type VARCHAR(40) NOT NULL,
      amount_granted INTEGER NOT NULL CHECK (amount_granted > 0),
      amount_consumed INTEGER NOT NULL DEFAULT 0 CHECK (amount_consumed >= 0),
      amount_expired INTEGER NOT NULL DEFAULT 0 CHECK (amount_expired >= 0),
      amount_revoked INTEGER NOT NULL DEFAULT 0 CHECK (amount_revoked >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','exhausted','expired','revoked','frozen')),
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      exhausted_at TIMESTAMPTZ NULL,
      expired_at TIMESTAMPTZ NULL,
      revoked_at TIMESTAMPTZ NULL,
      frozen_at TIMESTAMPTZ NULL,
      freeze_reason VARCHAR(64) NULL,
      membership_id BIGINT NULL,
      cycle_id BIGINT NULL,
      distribution_month_id BIGINT NULL,
      reason TEXT NULL,
      internal_note TEXT NULL,
      actor_user_id BIGINT NULL,
      idempotency_key VARCHAR(180) NOT NULL UNIQUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_bid_credit_grants_source_type_check CHECK (
        source_type IN (
          'membership_daily_unlock',
          'admin_manual',
          'admin_adjustment',
          'normal_application_refund',
          'article_application_refund',
          'package_purchase'
        )
      ),
      CONSTRAINT marketplace_bid_credit_grants_amounts_chk
        CHECK (amount_consumed + amount_expired + amount_revoked <= amount_granted)
    );
    CREATE TABLE marketplace_bid_credit_ledger_entries (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      grant_id BIGINT NULL REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
      event_type VARCHAR(60) NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      direction SMALLINT NOT NULL CHECK (direction IN (-1, 1)),
      reference_type VARCHAR(80) NULL,
      reference_id VARCHAR(80) NULL,
      idempotency_key VARCHAR(180) NOT NULL UNIQUE,
      reason TEXT NULL,
      actor_user_id BIGINT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check CHECK (
        event_type IN (
          'MEMBERSHIP_BID_GRANT',
          'ADMIN_BID_GRANT',
          'ADMIN_BID_ADJUSTMENT',
          'APPLICATION_BID_CONSUME',
          'BID_EXPIRED',
          'NORMAL_APPLICATION_BID_REFUND',
          'ARTICLE_APPLICATION_BID_CONSUME',
          'ARTICLE_APPLICATION_BID_REFUND',
          'BID_PACKAGE_PURCHASE_GRANT',
          'BID_PACKAGE_PURCHASE_REVOKE'
        )
      )
    );
    CREATE TABLE notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_role VARCHAR(32) NULL,
      actor_user_id BIGINT NULL,
      type VARCHAR(80) NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type VARCHAR(80) NULL,
      entity_id BIGINT NULL,
      link TEXT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      dedupe_key VARCHAR(200) NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX notifications_dedupe_uidx ON notifications (dedupe_key)
      WHERE dedupe_key IS NOT NULL;
    CREATE TABLE roles (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(64) NOT NULL UNIQUE,
      display_name VARCHAR(120) NOT NULL DEFAULT '',
      description TEXT NULL,
      is_system BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE user_roles (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, role_id)
    );
    INSERT INTO roles (name, display_name, is_system) VALUES
      ('super_admin', 'Super Admin', TRUE),
      ('admin', 'Admin', TRUE),
      ('client', 'Client', TRUE),
      ('freelancer', 'Freelancer', TRUE)
    ON CONFLICT (name) DO NOTHING;
  `);
  await client.query(
    `INSERT INTO schema_migrations (version) VALUES ('151_bid_credit_package_purchases') ON CONFLICT DO NOTHING`,
  );
}

async function applyMigration152(client) {
  const filePath = path.join(
    BACKEND_ROOT,
    "sql",
    "migrations",
    "152_admin_bid_distribution_pools.sql",
  );
  const raw = fs.readFileSync(filePath, "utf8");
  const cleaned = stripSqlLineComments(raw);
  const statements = splitSqlStatements(cleaned);
  for (const stmt of statements) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
}

async function main() {
  const probe = classifyDatabaseUrl(buildUrl());
  if (probe.isProduction) {
    throw new Error(`D1 GATE REFUSED PRODUCTION: ${probe.maskedTarget}`);
  }

  const pg = await startEmbeddedPostgres();
  const url = buildUrl();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // eslint-disable-next-line no-console
    console.log("[d1-gate] bootstrap through 151 vocabulary");
    await bootstrapThrough151(client);
    // eslint-disable-next-line no-console
    console.log("[d1-gate] apply migration 152");
    await applyMigration152(client);

    const tables = await client.query(`
      SELECT to_regclass('public.marketplace_bid_distribution_pools') AS pools,
             to_regclass('public.marketplace_bid_distribution_batches') AS batches,
             to_regclass('public.marketplace_bid_distribution_allocations') AS allocs,
             to_regclass('public.marketplace_bid_distribution_pool_events') AS events
    `);
    const t = tables.rows[0];
    if (!t.pools || !t.batches || !t.allocs || !t.events) {
      throw new Error("D1 tables missing after 152");
    }
    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pools) AS pools,
        (SELECT COUNT(*)::int FROM marketplace_bid_distribution_batches) AS batches,
        (SELECT COUNT(*)::int FROM marketplace_bid_distribution_allocations) AS allocs,
        (SELECT COUNT(*)::int FROM marketplace_bid_credit_grants) AS grants,
        (SELECT COUNT(*)::int FROM marketplace_bid_credit_ledger_entries) AS ledger
    `);
    const c = counts.rows[0];
    if (c.pools !== 0 || c.batches !== 0 || c.allocs !== 0 || c.grants !== 0 || c.ledger !== 0) {
      throw new Error(`152 seeded data unexpectedly: ${JSON.stringify(c)}`);
    }
    const flags = await client.query(
      `SELECT bid_credits_enabled FROM marketplace_economy_settings WHERE id=1`,
    );
    if (flags.rows[0].bid_credits_enabled !== false) {
      throw new Error("152 enabled bid credits");
    }
    // B1-B6 vocab still accepted
    await client.query(`
      INSERT INTO users (account_id, email, role)
      VALUES ('T000000001','gate_vocab@example.com','freelancer')
    `);
    const uid = (await client.query(`SELECT id FROM users LIMIT 1`)).rows[0].id;
    await client.query(
      `INSERT INTO marketplace_bid_credit_grants (
         freelancer_user_id, source_type, amount_granted, expires_at, idempotency_key
       ) VALUES ($1,'package_purchase',5,NOW()+interval '7 days','gate_pkg_src')`,
      [uid],
    );
    await client.query(`DELETE FROM marketplace_bid_credit_grants`);
    await client.query(
      `INSERT INTO marketplace_bid_credit_grants (
         freelancer_user_id, source_type, amount_granted, expires_at, idempotency_key
       ) VALUES ($1,'admin_distribution_pool',5,NOW()+interval '7 days','gate_pool_src')`,
      [uid],
    );
    await client.query(`DELETE FROM marketplace_bid_credit_grants`);
    await client.query(`DELETE FROM users`);

    // Rerun 152 statements (IF NOT EXISTS / DROP IF EXISTS) — should not fail
    await applyMigration152(client);
    // eslint-disable-next-line no-console
    console.log("MIGRATION_152_ISOLATED_APPLY=PASS");
  } finally {
    await client.end();
  }

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--test", "test/marketplaceBidDistributionPoolPhaseD1Gate.test.js"],
      {
        cwd: BACKEND_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: url,
          ORDERZ_GATE_ISOLATED_DB: "1",
          JWT_SECRET: process.env.JWT_SECRET || "marketplace-bid-pool-d1-gate-secret",
        },
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`D1 gate tests failed with code ${code}`));
    });
  });

  try {
    await pg.stop();
  } catch {
    /* Windows EBUSY cleanup non-fatal */
  }
  // eslint-disable-next-line no-console
  console.log("ADMIN_BID_POOL_D1_MIGRATION_152_GATE_PASS");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
