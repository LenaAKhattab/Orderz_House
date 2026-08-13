/**
 * Phase E1 / Migration 153 — isolated DB gate (FINAL PRE-APPLY REVIEW).
 * Applies 152 → 153 on embedded Postgres ONLY.
 * NEVER Production. Does not git/deploy/enable engines/assign memberships.
 *
 * Usage: node scripts/runMarketplaceMembershipPhaseE1Gate.js
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const {
  splitSqlStatements,
  stripSqlLineComments,
} = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_membership_e1_pg");
const PORT = 55463;
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

async function applySqlFile(client, relPath) {
  const filePath = path.join(BACKEND_ROOT, relPath);
  const raw = fs.readFileSync(filePath, "utf8");
  const statements = splitSqlStatements(stripSqlLineComments(raw));
  for (const stmt of statements) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
  return statements.length;
}

async function bootstrapPre152(client) {
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
      subscription_activation_fee_paid_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO system_settings (key, value) VALUES
      ('subscription_activation_fee_enabled', 'false'),
      ('subscription_activation_fee_amount_minor', '25000');
    CREATE TABLE marketplace_economy_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      bid_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      bid_credit_purchases_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      article_applications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO marketplace_economy_settings (id) VALUES (1);
    CREATE TABLE marketplace_membership_plans (
      id BIGSERIAL PRIMARY KEY,
      tier_code VARCHAR(64) NOT NULL,
      name_ar VARCHAR(200) NOT NULL,
      name_en VARCHAR(200) NULL,
      slug VARCHAR(80) NULL,
      description_ar TEXT NULL,
      description_en TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      monthly_price_jod NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (monthly_price_jod >= 0),
      max_real_order_value_jod NUMERIC(12, 3) NULL,
      unlimited_real_order_value BOOLEAN NOT NULL DEFAULT FALSE,
      included_tokens_per_cycle INT NOT NULL DEFAULT 0 CHECK (included_tokens_per_cycle >= 0),
      monthly_bid_allowance INT NOT NULL DEFAULT 0,
      cash_allowed BOOLEAN NOT NULL DEFAULT FALSE,
      minimum_cash_months INT NOT NULL DEFAULT 1 CHECK (minimum_cash_months >= 1),
      maximum_prepaid_months INT NOT NULL DEFAULT 1 CHECK (maximum_prepaid_months >= 1),
      elite_direct_orders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      priority_bid_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      priority_bid_uses_per_cycle INT NOT NULL DEFAULT 0,
      article_access_level INT NOT NULL DEFAULT 1,
      sale_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      sale_percentage NUMERIC(5, 2) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_membership_plans_real_access_consistency CHECK (
        (unlimited_real_order_value = TRUE AND max_real_order_value_jod IS NULL)
        OR (unlimited_real_order_value = FALSE AND max_real_order_value_jod IS NOT NULL AND max_real_order_value_jod > 0)
      )
    );
    CREATE UNIQUE INDEX marketplace_membership_plans_tier_code_uidx ON marketplace_membership_plans (tier_code);
    INSERT INTO marketplace_membership_plans (
      tier_code, name_ar, name_en, slug, is_active, sort_order, monthly_price_jod,
      max_real_order_value_jod, unlimited_real_order_value, monthly_bid_allowance
    ) VALUES
      ('free', 'مجاني', 'Free', 'free', TRUE, 1, 0, 5, FALSE, 5),
      ('start', 'ستارت', 'Start', 'start', TRUE, 2, 9, 15, FALSE, 15),
      ('active', 'أكتيف', 'Active', 'active', TRUE, 3, 19, 30, FALSE, 40),
      ('pro', 'برو', 'Pro', 'pro', TRUE, 4, 29, 40, FALSE, 80),
      ('elite', 'إيليت', 'Elite', 'elite', TRUE, 5, 49, NULL, TRUE, 120),
      ('pay_as_you_work', 'ادفع', 'Pay', 'pay', TRUE, 6, 0, 5, FALSE, 0);
    CREATE TABLE freelancer_marketplace_memberships (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id) ON DELETE RESTRICT,
      is_current BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      source VARCHAR(40) NOT NULL DEFAULT 'admin',
      cycle_anchor_day INT NOT NULL DEFAULT 1,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_term_starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_term_ends_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ NULL,
      auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT NULL,
      created_by_user_id BIGINT NULL,
      updated_by_user_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
      status VARCHAR(20) NOT NULL DEFAULT 'active',
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
          'membership_daily_unlock','admin_manual','admin_adjustment',
          'normal_application_refund','article_application_refund',
          'package_purchase','admin_distribution_pool'
        )
      )
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
    CREATE TABLE course_assignments (
      id BIGSERIAL PRIMARY KEY,
      freelancer_id BIGINT NOT NULL REFERENCES users(id),
      course_id BIGINT NOT NULL,
      completed_at TIMESTAMPTZ NULL
    );
    CREATE TABLE subscription_activation_fee_payments (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      amount_minor BIGINT NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'JOD',
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source VARCHAR(40) NOT NULL DEFAULT 'stripe',
      stripe_session_id TEXT NULL,
      stripe_payment_intent_id TEXT NULL
    );
    INSERT INTO schema_migrations (version) VALUES
      ('151_bid_credit_package_purchases')
    ON CONFLICT DO NOTHING;
  `);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const probe = classifyDatabaseUrl(buildUrl());
  if (probe.isProduction) {
    throw new Error(`E1 GATE REFUSED PRODUCTION: ${probe.maskedTarget}`);
  }

  const pg = await startEmbeddedPostgres();
  const url = buildUrl();
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    console.log("[e1-gate] bootstrap pre-152 catalog");
    await bootstrapPre152(client);

    console.log("[e1-gate] apply migration 152");
    await applySqlFile(client, "sql/migrations/152_admin_bid_distribution_pools.sql");

    console.log("[e1-gate] apply migration 153");
    const stmtCount = await applySqlFile(
      client,
      "sql/migrations/153_marketplace_membership_e1_bid_rules.sql",
    );
    console.log(`[e1-gate] 153 statement_count=${stmtCount}`);

    const mig = await client.query(
      `SELECT version FROM schema_migrations WHERE version LIKE '15%' ORDER BY version`,
    );
    assert(
      mig.rows.some((r) => r.version === "152_admin_bid_distribution_pools"),
      "152 missing from schema_migrations",
    );
    assert(
      mig.rows.some((r) => r.version === "153_marketplace_membership_e1_bid_rules"),
      "153 missing from schema_migrations",
    );

    const active = await client.query(
      `SELECT tier_code, monthly_price_jod::float AS price,
              cycle_duration_days, monthly_bid_allowance, daily_bid_spend_limit,
              project_min_value_jod::float AS project_min,
              max_real_order_value_jod::float AS project_max,
              unlimited_real_order_value, withdrawal_enabled,
              starter_earnings_mode, bid_distribution_mode, is_one_time_starter
         FROM marketplace_membership_plans
        WHERE is_active = TRUE
        ORDER BY sort_order, id`,
    );
    const codes = active.rows.map((r) => r.tier_code);
    assert(JSON.stringify(codes) === JSON.stringify(["starter", "silver", "pro", "elite"]),
      `active plans mismatch: ${codes.join(",")}`);

    const by = Object.fromEntries(active.rows.map((r) => [r.tier_code, r]));
    assert(by.starter.price === 0 && by.starter.cycle_duration_days === 10
      && by.starter.monthly_bid_allowance === 20 && by.starter.daily_bid_spend_limit === 2
      && by.starter.project_min === 1 && by.starter.project_max === 10
      && by.starter.withdrawal_enabled === false && by.starter.starter_earnings_mode === "pending"
      && by.starter.bid_distribution_mode === "full_cycle" && by.starter.is_one_time_starter === true,
      "STARTER config mismatch");
    assert(by.silver.price === 19 && by.silver.cycle_duration_days === 30
      && by.silver.monthly_bid_allowance === 40 && by.silver.daily_bid_spend_limit === 3
      && by.silver.project_min === 1 && by.silver.project_max === 20
      && by.silver.withdrawal_enabled === true && by.silver.bid_distribution_mode === "full_cycle",
      "SILVER config mismatch");
    assert(by.pro.price === 39 && by.pro.cycle_duration_days === 30
      && by.pro.monthly_bid_allowance === 100 && by.pro.daily_bid_spend_limit === 7
      && by.pro.project_min === 1 && by.pro.project_max === 50
      && by.pro.withdrawal_enabled === true && by.pro.bid_distribution_mode === "full_cycle",
      "PRO config mismatch");
    assert(by.elite.price === 59 && by.elite.cycle_duration_days === 30
      && by.elite.monthly_bid_allowance === 150 && by.elite.daily_bid_spend_limit === 10
      && by.elite.project_min === 1 && by.elite.unlimited_real_order_value === true
      && by.elite.project_max == null && by.elite.withdrawal_enabled === true
      && by.elite.bid_distribution_mode === "full_cycle",
      "ELITE config mismatch");

    const inactive = await client.query(
      `SELECT tier_code FROM marketplace_membership_plans
        WHERE tier_code IN ('free','start','active','pay_as_you_work') AND is_active = TRUE`,
    );
    assert(inactive.rows.length === 0, "legacy tiers still active");

    const settings = await client.query(`
      SELECT bid_credits_enabled, article_applications_enabled,
             marketplace_membership_required_course_id AS course_id,
             marketplace_membership_business_timezone AS tz
        FROM marketplace_economy_settings WHERE id = 1`);
    const s = settings.rows[0];
    assert(s.bid_credits_enabled === false, "bid credits enabled by 153");
    assert(s.article_applications_enabled === false, "articles enabled by 153");
    assert(s.course_id == null, "course id should stay NULL");
    assert(s.tz === "Asia/Amman", `tz mismatch: ${s.tz}`);

    const zeros = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships,
        (SELECT COUNT(*)::int FROM marketplace_membership_activation_requests) AS requests,
        (SELECT COUNT(*)::int FROM marketplace_freelancer_daily_bid_spend) AS daily,
        (SELECT COUNT(*)::int FROM marketplace_bid_credit_grants) AS grants,
        (SELECT COUNT(*)::int FROM marketplace_bid_credit_ledger_entries) AS ledger,
        (SELECT COUNT(*)::int FROM marketplace_bid_distribution_pools) AS pools
    `);
    const z = zeros.rows[0];
    assert(z.memberships === 0 && z.requests === 0 && z.daily === 0
      && z.grants === 0 && z.ledger === 0 && z.pools === 0,
      `unexpected side-effect rows: ${JSON.stringify(z)}`);

    // Daily concurrency: Starter limit=2, 3 concurrent 1-Bid spends → 2 ok / 1 fail
    await client.query(
      `INSERT INTO users (account_id, email, role, email_verified)
       VALUES ('E100000001','e1_daily@example.com','freelancer', TRUE)`,
    );
    const uid = (await client.query(`SELECT id FROM users WHERE email='e1_daily@example.com'`))
      .rows[0].id;
    const starterPlanId = (await client.query(
      `SELECT id FROM marketplace_membership_plans WHERE tier_code='starter'`,
    )).rows[0].id;
    await client.query(
      `INSERT INTO freelancer_marketplace_memberships (
         freelancer_user_id, marketplace_plan_id, is_current, status, source,
         paid_term_ends_at
       ) VALUES ($1, $2, TRUE, 'active', 'system', NOW() + interval '10 days')`,
      [uid, starterPlanId],
    );

    process.env.DATABASE_URL = url;
    const dailySpend = require("../src/services/marketplaceMembershipDailyBidSpendService");
    const results = await Promise.allSettled(
      [1, 2, 3].map(async () => {
        const c = new Client({ connectionString: url });
        await c.connect();
        try {
          await c.query("BEGIN");
          const out = await dailySpend.assertAndConsumeDailyBidSpend({
            client: c,
            freelancerUserId: uid,
            amount: 1,
          });
          await c.query("COMMIT");
          return out;
        } catch (err) {
          try { await c.query("ROLLBACK"); } catch { /* ignore */ }
          throw err;
        } finally {
          await c.end();
        }
      }),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.filter((r) => r.status === "rejected").length;
    assert(ok === 2 && fail === 1, `concurrency expected 2/1 got ${ok}/${fail}`);
    const spent = await client.query(
      `SELECT amount_spent FROM marketplace_freelancer_daily_bid_spend WHERE freelancer_user_id=$1`,
      [uid],
    );
    assert(Number(spent.rows[0].amount_spent) === 2, "daily spend should be 2");
    console.log("DAILY_BID_LIMIT_CONCURRENCY=SAFE");

    // Training fail-closed
    const eligibility = require("../src/services/marketplaceMembershipEligibilityService");
    let trainingCode = null;
    try {
      await eligibility.assertPaidTrainingComplete(client, uid);
    } catch (err) {
      trainingCode = err.publicCode || err.code;
    }
    assert(
      trainingCode === "MEMBERSHIP_TRAINING_NOT_CONFIGURED",
      `expected FAIL_CLOSED training, got ${trainingCode}`,
    );
    console.log("MISSING_REQUIRED_COURSE_CONFIG_BEHAVIOR=FAIL_CLOSED");

    // Full verification: email missing blocks
    await client.query(
      `INSERT INTO users (account_id, email, role, email_verified, is_active)
       VALUES ('E100000002','e1_unver@example.com','freelancer', FALSE, TRUE)`,
    );
    const unver = (await client.query(`SELECT id FROM users WHERE email='e1_unver@example.com'`))
      .rows[0].id;
    let verCode = null;
    try {
      await eligibility.assertMarketplaceVerificationComplete(client, unver);
    } catch (err) {
      verCode = err.publicCode;
    }
    assert(verCode === "MEMBERSHIP_VERIFICATION_REQUIRED", `email gate got ${verCode}`);

    // Fee required when enabled
    await client.query(
      `UPDATE system_settings SET value='true' WHERE key='subscription_activation_fee_enabled'`,
    );
    await client.query(
      `UPDATE users SET email_verified=TRUE WHERE id=$1`,
      [unver],
    );
    let feeCode = null;
    try {
      await eligibility.assertMarketplaceVerificationComplete(client, unver);
    } catch (err) {
      feeCode = err.publicCode;
    }
    assert(feeCode === "MEMBERSHIP_VERIFICATION_FEE_REQUIRED", `fee gate got ${feeCode}`);
    console.log("MEMBERSHIP_ACTIVATION_REQUIRES_FULL_VERIFICATION=PASS");

    // Rerun 153 idempotent
    await applySqlFile(client, "sql/migrations/153_marketplace_membership_e1_bid_rules.sql");
    const active2 = await client.query(
      `SELECT tier_code FROM marketplace_membership_plans WHERE is_active=TRUE ORDER BY sort_order`,
    );
    assert(
      active2.rows.map((r) => r.tier_code).join(",") === "starter,silver,pro,elite",
      "rerun broke active catalog",
    );

    console.log("MIGRATION_153_ISOLATED_APPLY=PASS");
    console.log("E1_PLAN_CUTOVER=PASS");
    console.log("E1_PLAN_CONFIGURATION=PASS");
    console.log("BID_POOL_D1=PRESERVED");
  } finally {
    await client.end();
    try {
      await pg.stop();
    } catch {
      /* Windows EBUSY non-fatal */
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
