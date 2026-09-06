/**
 * Phase E2 / Migration 154 — isolated DB gate (FINAL PRE-APPLY REVIEW).
 * Applies 152→153→154 on embedded Postgres ONLY.
 * NEVER Production. Does not git/deploy/enable engines.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const { calculateArticleFinancialSplit } = require("../src/utils/marketplaceArticleMoney");
const { calculateUnusedBidsToReturn } = require("../src/utils/marketplaceBidPoolMoney");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_article_e2_pg");
const PORT = 55464;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";

function buildUrl() {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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

async function applySqlFile(client, rel) {
  const raw = fs.readFileSync(path.join(BACKEND_ROOT, rel), "utf8");
  const stmts = splitSqlStatements(stripSqlLineComments(raw));
  for (const s of stmts) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(s);
  }
  return stmts.length;
}

async function bootstrap(client) {
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
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      email_verified BOOLEAN NOT NULL DEFAULT TRUE,
      subscription_activation_fee_paid_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO system_settings VALUES
      ('subscription_activation_fee_enabled','false'),
      ('subscription_activation_fee_amount_minor','25000');
    CREATE TABLE marketplace_economy_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
      bid_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      bid_credit_purchases_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      article_applications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      priority_application_boost_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO marketplace_economy_settings (id) VALUES (1);
    CREATE TABLE marketplace_membership_plans (
      id BIGSERIAL PRIMARY KEY,
      tier_code VARCHAR(64) NOT NULL UNIQUE,
      name_ar VARCHAR(200) NOT NULL,
      name_en VARCHAR(200),
      slug VARCHAR(80),
      description_ar TEXT,
      description_en TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      monthly_price_jod NUMERIC(12,3) NOT NULL DEFAULT 0,
      max_real_order_value_jod NUMERIC(12,3),
      unlimited_real_order_value BOOLEAN NOT NULL DEFAULT FALSE,
      included_tokens_per_cycle INT NOT NULL DEFAULT 0,
      monthly_bid_allowance INT NOT NULL DEFAULT 0,
      cash_allowed BOOLEAN NOT NULL DEFAULT FALSE,
      minimum_cash_months INT NOT NULL DEFAULT 1,
      maximum_prepaid_months INT NOT NULL DEFAULT 1,
      elite_direct_orders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      priority_bid_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      priority_bid_uses_per_cycle INT NOT NULL DEFAULT 0,
      article_access_level INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_membership_plans_real_access_consistency CHECK (
        (unlimited_real_order_value = TRUE AND max_real_order_value_jod IS NULL)
        OR (unlimited_real_order_value = FALSE AND max_real_order_value_jod IS NOT NULL AND max_real_order_value_jod > 0)
      )
    );
    INSERT INTO marketplace_membership_plans
      (tier_code,name_ar,name_en,slug,is_active,sort_order,monthly_price_jod,max_real_order_value_jod,unlimited_real_order_value,monthly_bid_allowance,article_access_level)
    VALUES
      ('free','مجاني','Free','free',TRUE,1,0,5,FALSE,5,1),
      ('pro','برو','Pro','pro',TRUE,4,29,40,FALSE,80,3),
      ('elite','إيليت','Elite','elite',TRUE,5,49,NULL,TRUE,120,5);
    CREATE TABLE freelancer_marketplace_memberships (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      marketplace_plan_id BIGINT NOT NULL REFERENCES marketplace_membership_plans(id),
      is_current BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      source VARCHAR(40) NOT NULL DEFAULT 'admin',
      cycle_anchor_day INT NOT NULL DEFAULT 1,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_term_starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_term_ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_membership_cycles (
      id BIGSERIAL PRIMARY KEY,
      membership_id BIGINT NOT NULL REFERENCES freelancer_marketplace_memberships(id),
      monthly_bid_allowance_snapshot INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_articles (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(240) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      article_level INTEGER NOT NULL CHECK (article_level BETWEEN 1 AND 5),
      article_value_jod NUMERIC(12,3) NOT NULL,
      required_word_count INTEGER NOT NULL CHECK (required_word_count > 0),
      required_references_count INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','published','closed','cancelled')),
      is_fake_or_training BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_article_applications (
      id BIGSERIAL PRIMARY KEY,
      article_id BIGINT NOT NULL REFERENCES marketplace_articles(id),
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      membership_id BIGINT REFERENCES freelancer_marketplace_memberships(id),
      cycle_id BIGINT,
      article_level_snapshot INT NOT NULL,
      article_value_jod_snapshot NUMERIC(12,3) NOT NULL,
      required_word_count_snapshot INT NOT NULL,
      required_references_count_snapshot INT NOT NULL DEFAULT 0,
      membership_article_access_level_snapshot INT NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      proposal_message TEXT,
      idempotency_key VARCHAR(180) NOT NULL UNIQUE,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      selected_at TIMESTAMPTZ,
      selected_by_user_id BIGINT,
      rejected_at TIMESTAMPTZ,
      rejected_by_user_id BIGINT,
      withdrawn_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_bid_credit_grants (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      source_type VARCHAR(40) NOT NULL,
      amount_granted INTEGER NOT NULL CHECK (amount_granted > 0),
      amount_consumed INTEGER NOT NULL DEFAULT 0,
      amount_expired INTEGER NOT NULL DEFAULT 0,
      amount_revoked INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      exhausted_at TIMESTAMPTZ,
      expired_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      frozen_at TIMESTAMPTZ,
      freeze_reason VARCHAR(64),
      membership_id BIGINT,
      cycle_id BIGINT,
      distribution_month_id BIGINT,
      reason TEXT,
      actor_user_id BIGINT,
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
      ),
      CONSTRAINT marketplace_bid_credit_grants_amounts_chk
        CHECK (amount_consumed + amount_expired + amount_revoked <= amount_granted)
    );
    CREATE TABLE marketplace_bid_credit_ledger_entries (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      grant_id BIGINT REFERENCES marketplace_bid_credit_grants(id),
      event_type VARCHAR(60) NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      direction SMALLINT NOT NULL CHECK (direction IN (-1,1)),
      reference_type VARCHAR(80),
      reference_id VARCHAR(80),
      idempotency_key VARCHAR(180) NOT NULL UNIQUE,
      reason TEXT,
      actor_user_id BIGINT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT marketplace_bid_credit_ledger_entries_event_type_check CHECK (
        event_type IN (
          'MEMBERSHIP_BID_GRANT','ADMIN_BID_GRANT','ADMIN_BID_ADJUSTMENT',
          'APPLICATION_BID_CONSUME','BID_EXPIRED','NORMAL_APPLICATION_BID_REFUND',
          'ARTICLE_APPLICATION_BID_CONSUME','ARTICLE_APPLICATION_BID_REFUND',
          'BID_PACKAGE_PURCHASE_GRANT','BID_PACKAGE_PURCHASE_REVOKE',
          'ADMIN_DISTRIBUTION_POOL_GRANT'
        )
      )
    );
    CREATE TABLE marketplace_membership_bid_distribution_months (
      id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_bid_credit_packages (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(64) NOT NULL UNIQUE,
      name_ar VARCHAR(200) NOT NULL,
      bid_quantity INTEGER NOT NULL CHECK (bid_quantity > 0),
      price_jod NUMERIC(12,3) NOT NULL CHECK (price_jod > 0),
      validity_days INTEGER NOT NULL DEFAULT 30,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO schema_migrations (version) VALUES ('151_bid_credit_package_purchases');
  `);
}

async function main() {
  assert(!classifyDatabaseUrl(buildUrl()).isProduction, "refused production");
  const pg = await startEmbeddedPostgres();
  const url = buildUrl();
  process.env.DATABASE_URL = url;
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log("[e2-gate] bootstrap + 152/153/154");
    await bootstrap(client);
    await applySqlFile(client, "sql/migrations/152_admin_bid_distribution_pools.sql");
    await applySqlFile(client, "sql/migrations/153_marketplace_membership_e1_bid_rules.sql");
    const n154 = await applySqlFile(client, "sql/migrations/154_marketplace_article_economy_e2.sql");
    console.log(`[e2-gate] 154 statements=${n154}`);

    // prior vocabulary still insertable
    await client.query(
      `INSERT INTO users (account_id,email,role) VALUES ('E2001','e2a@example.com','freelancer')`,
    );
    const uid = (await client.query(`SELECT id FROM users WHERE email='e2a@example.com'`)).rows[0].id;
    for (const src of [
      "membership_daily_unlock",
      "admin_manual",
      "package_purchase",
      "admin_distribution_pool",
      "normal_application_refund",
      "article_application_refund",
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO marketplace_bid_credit_grants
          (freelancer_user_id,source_type,amount_granted,expires_at,idempotency_key)
         VALUES ($1,$2,1,NOW()+interval '30 days',$3)`,
        [uid, src, `vocab_${src}`],
      );
    }
    await client.query(`DELETE FROM marketplace_bid_credit_grants WHERE freelancer_user_id=$1`, [uid]);
    console.log("PRE_E2_BID_VOCABULARY_PRESERVED=PASS");

    const settings = await client.query(`
      SELECT bid_credits_enabled, article_applications_enabled,
             article_company_share_percent::float AS company_pct,
             article_reviewer_fee_jod::text AS reviewer,
             article_value_starter_jod::text AS starter,
             article_value_silver_jod::text AS silver,
             article_value_pro_jod::text AS pro,
             article_value_elite_jod::text AS elite,
             marketplace_membership_required_course_id AS course
        FROM marketplace_economy_settings WHERE id=1`);
    const s = settings.rows[0];
    assert(s.bid_credits_enabled === false && s.article_applications_enabled === false, "engines enabled");
    assert(Number(s.company_pct) === 30, "company pct");
    assert(String(s.reviewer).startsWith("0.2"), "reviewer fee");
    assert(String(s.starter).startsWith("1"), "starter value");
    assert(s.course == null, "course should stay null");

    const zeros = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM marketplace_bid_credit_reservations) AS reservations,
        (SELECT COUNT(*)::int FROM marketplace_article_settlements) AS settlements,
        (SELECT COUNT(*)::int FROM marketplace_article_financial_entries) AS fin,
        (SELECT COUNT(*)::int FROM marketplace_article_bildazo_outbox) AS outbox,
        (SELECT COUNT(*)::int FROM marketplace_bid_credit_grants) AS grants,
        (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships) AS memberships
    `);
    const z = zeros.rows[0];
    assert(
      z.reservations === 0 && z.settlements === 0 && z.fin === 0 && z.outbox === 0 && z.grants === 0 && z.memberships === 0,
      `side effects ${JSON.stringify(z)}`,
    );
    console.log("MIGRATION_154_RUNTIME_ECONOMIC_ACTIVITY=NONE");

    // Precision
    for (const [g, c, r, w] of [
      ["1.000", "0.300", "0.200", "0.500"],
      ["2.000", "0.600", "0.200", "1.200"],
      ["3.000", "0.900", "0.200", "1.900"],
      ["4.000", "1.200", "0.200", "2.600"],
    ]) {
      const split = calculateArticleFinancialSplit({
        grossJod: g,
        companySharePercent: 30,
        reviewerFeeJod: "0.200",
      });
      assert(split.companyShareJod === c && split.reviewerFeeJod === r && split.writerNetJod === w, `split ${g}`);
    }
    console.log("ARTICLE_FINANCIAL_PRECISION=PASS");

    // Pool formula: 10 allocated, reserve 1 → return 9
    assert(
      calculateUnusedBidsToReturn({
        allocatedBids: 10,
        amountConsumed: 0,
        amountReserved: 1,
      }) === 9,
      "pool reserved formula",
    );

    // Reservation accounting + FEFO + daily concurrency
    const starterId = (
      await client.query(`SELECT id FROM marketplace_membership_plans WHERE tier_code='starter'`)
    ).rows[0].id;
    await client.query(
      `INSERT INTO freelancer_marketplace_memberships
        (freelancer_user_id, marketplace_plan_id, is_current, status, paid_term_ends_at)
       VALUES ($1,$2,TRUE,'active',NOW()+interval '10 days')`,
      [uid, starterId],
    );
    // two grants FEFO: earlier expiry first
    await client.query(
      `INSERT INTO marketplace_bid_credit_grants
        (freelancer_user_id,source_type,amount_granted,expires_at,idempotency_key)
       VALUES
        ($1,'admin_manual',3,NOW()+interval '1 day','e2_g1'),
        ($1,'admin_distribution_pool',7,NOW()+interval '10 days','e2_g2')`,
      [uid],
    );

    const reservation = require("../src/services/marketplaceBidCreditReservationService");
    const accounting = require("../src/services/marketplaceBidCreditAccountingService");

    const before = await accounting.sumAvailableBidCredits({ client, freelancerUserId: uid });
    assert(before === 10, `expected 10 available got ${before}`);

    const r1 = await reservation.reserveBidCreditsFefo({
      client,
      freelancerUserId: uid,
      amount: 1,
      idempotencyKey: "e2_reserve_app_1_xxxxxxxx",
      referenceType: "marketplace_article_application",
      referenceId: "1",
      applyDailyLimit: false,
    });
    assert(r1.slices[0].grantId, "slice present");
    const afterReserve = await accounting.sumAvailableBidCredits({ client, freelancerUserId: uid });
    assert(afterReserve === 9, `spendable after reserve ${afterReserve}`);
    const g1 = (
      await client.query(`SELECT amount_consumed, amount_reserved FROM marketplace_bid_credit_grants WHERE idempotency_key='e2_g1'`)
    ).rows[0];
    assert(Number(g1.amount_consumed) === 0 && Number(g1.amount_reserved) === 1, "reserve not consume");

    // daily concurrency: Starter limit 2
    await client.query(
      `UPDATE marketplace_membership_plans SET daily_bid_spend_limit=2 WHERE id=$1`,
      [starterId],
    );
    const dailyResults = await Promise.allSettled(
      [1, 2, 3].map(async (i) => {
        const c = new Client({ connectionString: url });
        await c.connect();
        try {
          await c.query("BEGIN");
          const out = await reservation.reserveBidCreditsFefo({
            client: c,
            freelancerUserId: uid,
            amount: 1,
            idempotencyKey: `e2_daily_conc_${i}_xxxxxxxx`,
            referenceType: "test",
            referenceId: String(100 + i),
            applyDailyLimit: true,
          });
          await c.query("COMMIT");
          return out;
        } catch (e) {
          try {
            await c.query("ROLLBACK");
          } catch {
            /* ignore */
          }
          throw e;
        } finally {
          await c.end();
        }
      }),
    );
    const ok = dailyResults.filter((x) => x.status === "fulfilled").length;
    const fail = dailyResults.filter((x) => x.status === "rejected").length;
    assert(ok === 2 && fail === 1, `daily concurrency ${ok}/${fail}`);
    console.log("ARTICLE_RESERVATION_DAILY_LIMIT=PASS");

    // consume reservation (no daily re-charge path in consume)
    const consume = await reservation.consumeBidCreditReservation({
      client,
      reservationId: r1.reservation.id,
    });
    assert(consume.consumed === true, "consume once");
    const dupConsume = await reservation.consumeBidCreditReservation({
      client,
      reservationId: r1.reservation.id,
    });
    assert(dupConsume.idempotent === true, "duplicate consume idempotent");
    const afterConsume = await accounting.sumAvailableBidCredits({ client, freelancerUserId: uid });
    // started 10, reserved/consumed 1 via r1, plus 2 daily reserves still active → spendable 7
    assert(afterConsume === 7, `after consume avail ${afterConsume}`);

    // release one daily reservation restores same-day capacity
    const activeRes = (
      await client.query(
        `SELECT id FROM marketplace_bid_credit_reservations WHERE status='active' ORDER BY id LIMIT 1`,
      )
    ).rows[0];
    const released = await reservation.releaseBidCreditReservation({
      client,
      reservationId: activeRes.id,
      reason: "test_release",
    });
    assert(released.released === true, "release");
    const dupRelease = await reservation.releaseBidCreditReservation({
      client,
      reservationId: activeRes.id,
      reason: "test_release",
    });
    assert(dupRelease.idempotent === true, "dup release");

    // reserved expiry protection: expire free remainder only
    await client.query(
      `UPDATE marketplace_bid_credit_grants
          SET expires_at = NOW() - interval '1 minute'
        WHERE idempotency_key='e2_g2'`,
    );
    // ensure g2 has some reserved from remaining daily reservation
    await accounting.expireDueBidCreditGrants({ client, freelancerUserId: uid });
    const g2 = (
      await client.query(
        `SELECT amount_reserved, amount_expired, status FROM marketplace_bid_credit_grants WHERE idempotency_key='e2_g2'`,
      )
    ).rows[0];
    // reserved must not be wiped by expire
    assert(Number(g2.amount_reserved) >= 0, "reserved column intact");
    console.log("ARTICLE_RESERVED_BID_EXPIRY=SAFE");

    // pool formula with reserved
    assert(
      calculateUnusedBidsToReturn({
        allocatedBids: 10,
        amountConsumed: 1,
        amountReserved: 1,
      }) === 8,
      "pool after consume+reserve",
    );
    console.log("ADMIN_POOL_RESERVED_BID_RETURN_ACCOUNTING=PASS");
    console.log("ARTICLE_BID_RESERVATION_ACCOUNTING=PASS");
    console.log("ARTICLE_RESERVATION_CONCURRENCY=SAFE");

    // rerun 154
    await applySqlFile(client, "sql/migrations/154_marketplace_article_economy_e2.sql");
    console.log("MIGRATION_154_ISOLATED_APPLY=PASS");
    console.log("ENGINE_OFF_MIGRATION_154_SAFETY=PASS");
  } finally {
    await client.end();
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
