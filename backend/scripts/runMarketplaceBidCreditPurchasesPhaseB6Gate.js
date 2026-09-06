/**
 * Phase B6 — Bid package payment reversal DB gate (isolated).
 * Applies a minimal schema matching Migration 151 purchase/grant reversal fields.
 * NEVER Production. Does not apply 151 to Production / git / deploy.
 *
 * Usage: npm run test:marketplace-bid-credit-purchases-phase-b6-gate
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_bid_pkg_purchases_b6_pg");
const PORT = 55456;
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
      idempotency_key VARCHAR(180) NOT NULL UNIQUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_bid_credit_purchases (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      package_id BIGINT NOT NULL REFERENCES marketplace_bid_credit_packages(id) ON DELETE RESTRICT,
      package_code_snapshot VARCHAR(64) NOT NULL,
      bid_quantity_snapshot INTEGER NOT NULL,
      price_jod_snapshot NUMERIC(12,3) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'JOD',
      validity_days_snapshot INTEGER NOT NULL,
      expected_amount_minor INTEGER NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'fulfilled',
      provider VARCHAR(32) NOT NULL DEFAULT 'stripe',
      stripe_checkout_session_id VARCHAR(255) UNIQUE,
      stripe_payment_intent_id VARCHAR(255),
      stripe_event_id VARCHAR(255),
      stripe_refund_id VARCHAR(255),
      stripe_dispute_id VARCHAR(255),
      fulfilled_grant_id BIGINT NULL REFERENCES marketplace_bid_credit_grants(id) ON DELETE RESTRICT,
      idempotency_key VARCHAR(200) NOT NULL UNIQUE,
      grant_idempotency_key VARCHAR(200) UNIQUE,
      revoke_idempotency_key VARCHAR(200) UNIQUE,
      checkout_created_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      fulfilled_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      failed_at TIMESTAMPTZ,
      failure_reason TEXT,
      payment_reversal_status VARCHAR(48) NOT NULL DEFAULT 'none',
      provider_refund_recorded_at TIMESTAMPTZ,
      provider_dispute_recorded_at TIMESTAMPTZ,
      provider_dispute_resolved_at TIMESTAMPTZ,
      provider_refund_status VARCHAR(40),
      provider_dispute_status VARCHAR(40),
      provider_refund_amount_minor INTEGER,
      consumed_before_reversal INTEGER,
      unused_revoked_amount INTEGER NOT NULL DEFAULT 0,
      unused_frozen_amount INTEGER NOT NULL DEFAULT 0,
      manual_review_required BOOLEAN NOT NULL DEFAULT FALSE,
      manual_review_resolved_at TIMESTAMPTZ,
      manual_review_resolution VARCHAR(40),
      manual_review_actor_user_id BIGINT,
      manual_review_note TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function main() {
  const probe = classifyDatabaseUrl(buildUrl());
  if (probe.isProduction) {
    throw new Error(`B6 GATE REFUSED PRODUCTION: ${probe.maskedTarget}`);
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
      ["--test", "test/marketplaceBidCreditPurchasesPhaseB6Gate.test.js"],
      {
        cwd: BACKEND_ROOT,
        env: {
          ...process.env,
          DATABASE_URL: url,
          ORDERZ_GATE_ISOLATED_DB: "1",
          JWT_SECRET: process.env.JWT_SECRET || "marketplace-bid-pkg-b6-gate-secret",
        },
        stdio: "inherit",
      },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`B6 gate tests failed with code ${code}`));
    });
  });

  try {
    await pg.stop();
  } catch {
    /* Windows EBUSY cleanup non-fatal */
  }
  // eslint-disable-next-line no-console
  console.log("BID_COMMERCIAL_PHASE_B6_REVERSAL_GATE_PASS");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
