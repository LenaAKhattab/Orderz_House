/**
 * Migration 155 final re-review — isolated apply of 154-shaped schema → 155.
 * NEVER Production. Does not enable engines. Does not consume/refund Bids.
 * Does not apply 156. Review-only; do not git add.
 *
 * Usage: node .tmp/reviewMigration155IsolatedApply.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("../scripts/lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "migration_155_review_pg");
const PORT = 55466;
const DB_NAME = "orderz_house_test";
const USER = "postgres";
const PASSWORD = "password";
const EXPECTED_SHA = "080bd8040f88d63ababe30f0cb7a58e4160c86041ff1d5e18a6961ea992d1036";

function buildUrl() {
  return `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;
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

async function execFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const stmts = splitSqlStatements(stripSqlLineComments(raw));
  for (const stmt of stmts) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
  return stmts.length;
}

async function bootstrap154Shaped(client) {
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
      role VARCHAR(32) NOT NULL DEFAULT 'freelancer'
    );
    CREATE TABLE marketplace_economy_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      bid_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      article_applications_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      work_tokens_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      bid_credit_purchases_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO marketplace_economy_settings (id) VALUES (1);
    CREATE TABLE orders (
      id BIGSERIAL PRIMARY KEY,
      order_code VARCHAR(64) NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT 'hist',
      budget NUMERIC(12,3) NULL,
      order_status VARCHAR(40) NOT NULL DEFAULT 'open_for_bids',
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      is_open_for_pool BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE order_freelancer_bids (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id),
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      amount NUMERIC(12,2) NOT NULL DEFAULT 1,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      UNIQUE (order_id, freelancer_user_id)
    );
    CREATE TABLE marketplace_bid_credit_grants (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      source_type VARCHAR(64) NOT NULL,
      amount_granted INTEGER NOT NULL,
      amount_consumed INTEGER NOT NULL DEFAULT 0,
      amount_expired INTEGER NOT NULL DEFAULT 0,
      amount_reserved INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
    );
    CREATE TABLE marketplace_bid_credit_ledger_entries (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      amount INTEGER NOT NULL,
      direction INTEGER NOT NULL,
      idempotency_key VARCHAR(180) NOT NULL UNIQUE
    );
    CREATE TABLE order_freelancer_bid_credit_economics (
      id BIGSERIAL PRIMARY KEY,
      bid_id BIGINT NOT NULL REFERENCES order_freelancer_bids(id),
      order_id BIGINT NOT NULL REFERENCES orders(id),
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      bid_credit_cost INTEGER NOT NULL DEFAULT 1
        CONSTRAINT order_freelancer_bid_credit_economics_cost_chk CHECK (bid_credit_cost = 1),
      charge_status VARCHAR(20) NOT NULL DEFAULT 'charged',
      refund_status VARCHAR(20) NOT NULL DEFAULT 'none',
      UNIQUE (order_id, freelancer_user_id)
    );
    INSERT INTO schema_migrations (version) VALUES ('154_marketplace_article_economy_e2');
  `);
}

async function main() {
  const probe = classifyDatabaseUrl(buildUrl());
  if (probe.isProduction) {
    throw new Error(`ISOLATED REVIEW REFUSED PRODUCTION: ${probe.maskedTarget}`);
  }

  const sqlPath = path.join(
    BACKEND_ROOT,
    "sql",
    "migrations",
    "155_marketplace_normal_order_rules_e3.sql",
  );
  const raw = fs.readFileSync(sqlPath);
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  const report = {
    isolated: true,
    sha256,
    expectedSha: EXPECTED_SHA,
    shaMatch: sha256 === EXPECTED_SHA,
  };
  if (!report.shaMatch) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    throw new Error("MIGRATION_155_CHECKSUM_MISMATCH");
  }

  const sqlText = raw.toString("utf8");
  report.sqlMentionsPantry = /pantry|بيت المونة|beit.?al.?mooneh/i.test(sqlText);
  report.sqlMutatesPantry = /\b(?:CREATE|ALTER|DROP)\s+TABLE\s+[^\s;]*pantry/i.test(sqlText);
  report.sqlEnablesEngines = /SET\s+bid_credits_enabled\s*=\s*TRUE|SET\s+article_applications_enabled\s*=\s*TRUE|SET\s+work_tokens_enabled\s*=\s*TRUE/i.test(
    sqlText,
  );
  report.sqlMutatesWorkTokens = /work_token/i.test(sqlText);
  report.sqlRewritesOrderEconomics = /UPDATE\s+orders\s+SET/i.test(sqlText);
  report.sqlConsumesOrRefundsBids =
    /INSERT\s+INTO\s+marketplace_bid_credit_|UPDATE\s+marketplace_bid_credit_/i.test(sqlText);

  const pg = await startEmbeddedPostgres();
  const client = new Client({ connectionString: buildUrl() });
  await client.connect();
  try {
    await bootstrap154Shaped(client);

    await client.query(
      `INSERT INTO users (account_id, email, role) VALUES ('h1','h1@t.test','client')`,
    );
    const hist = await client.query(
      `INSERT INTO orders (order_code, budget) VALUES ('HIST-E3', 40) RETURNING id`,
    );
    const histId = hist.rows[0].id;

    report.before154Applied = (
      await client.query(
        `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='154_marketplace_article_economy_e2') AS ok`,
      )
    ).rows[0].ok;
    report.before155Absent = (
      await client.query(
        `SELECT NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='155_marketplace_normal_order_rules_e3') AS ok`,
      )
    ).rows[0].ok;
    report.beforeE3Col = (
      await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_name='orders' AND column_name='application_bid_cost'
        ) AS ok
      `)
    ).rows[0].ok;
    report.b2CostOneStillRequired = false;
    try {
      await client.query(`
        INSERT INTO users (account_id, email, role) VALUES ('f1','f1@t.test','freelancer')
      `);
      await client.query(
        `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount)
         VALUES ($1, (SELECT id FROM users WHERE email='f1@t.test'), 5)`,
        [histId],
      );
      await client.query(
        `INSERT INTO order_freelancer_bid_credit_economics
           (bid_id, order_id, freelancer_user_id, bid_credit_cost)
         VALUES (
           (SELECT id FROM order_freelancer_bids WHERE order_id=$1),
           $1,
           (SELECT id FROM users WHERE email='f1@t.test'),
           3
         )`,
        [histId],
      );
      report.b2CostOneStillRequired = false;
    } catch {
      report.b2CostOneStillRequired = true;
    }
    await client.query(
      `INSERT INTO order_freelancer_bid_credit_economics
         (bid_id, order_id, freelancer_user_id, bid_credit_cost)
       VALUES (
         (SELECT id FROM order_freelancer_bids WHERE order_id=$1),
         $1,
         (SELECT id FROM users WHERE email='f1@t.test'),
         1
       )`,
      [histId],
    );

    const grantsBefore = (
      await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)
    ).rows[0].c;
    const ledgerBefore = (
      await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)
    ).rows[0].c;

    await execFile(client, sqlPath);
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ('155_marketplace_normal_order_rules_e3')`,
    );

    report.after155Applied = (
      await client.query(
        `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version='155_marketplace_normal_order_rules_e3') AS ok`,
      )
    ).rows[0].ok;
    report.e3OrderCols = (
      await client.query(`
        SELECT COUNT(*)::int AS c FROM information_schema.columns
         WHERE table_name='orders'
           AND column_name IN (
             'application_bid_cost','target_applicant_count','application_deadline_at',
             'applications_closed_at','applications_close_reason',
             'deadline_incomplete_target_policy','e3_rules_snapshot','e3_rules_version'
           )
      `)
    ).rows[0].c;
    report.e3SettingsCols = (
      await client.query(`
        SELECT COUNT(*)::int AS c FROM information_schema.columns
         WHERE table_name='marketplace_economy_settings'
           AND column_name LIKE 'normal_order_%'
      `)
    ).rows[0].c;

    const histAfter = await client.query(
      `SELECT application_bid_cost, target_applicant_count, application_deadline_at,
              deadline_incomplete_target_policy, e3_rules_version, e3_rules_snapshot
         FROM orders WHERE id=$1`,
      [histId],
    );
    const h = histAfter.rows[0];
    report.historicalNullEconomics =
      h.application_bid_cost == null &&
      h.target_applicant_count == null &&
      h.application_deadline_at == null &&
      h.deadline_incomplete_target_policy == null &&
      h.e3_rules_version == null;
    report.historicalSnapshotEmpty =
      h.e3_rules_snapshot && Object.keys(h.e3_rules_snapshot).length === 0;

    const flags = await client.query(
      `SELECT bid_credits_enabled, article_applications_enabled, work_tokens_enabled,
              bid_credit_purchases_enabled,
              normal_order_default_bid_cost, normal_order_deadline_incomplete_target_policy
         FROM marketplace_economy_settings WHERE id=1`,
    );
    report.flags = flags.rows[0];
    report.enginesOff =
      flags.rows[0].bid_credits_enabled === false &&
      flags.rows[0].article_applications_enabled === false &&
      flags.rows[0].work_tokens_enabled === false &&
      flags.rows[0].bid_credit_purchases_enabled === false;

    report.quantityAwareCostOk = true;
    try {
      await client.query(
        `UPDATE order_freelancer_bid_credit_economics SET bid_credit_cost=3 WHERE order_id=$1`,
        [histId],
      );
      await client.query(
        `UPDATE order_freelancer_bid_credit_economics SET bid_credit_cost=1 WHERE order_id=$1`,
        [histId],
      );
    } catch (err) {
      report.quantityAwareCostOk = false;
      report.quantityAwareErr = String(err.message || err);
    }

    report.legacyCostOneStillValid = (
      await client.query(
        `SELECT bid_credit_cost FROM order_freelancer_bid_credit_economics WHERE order_id=$1`,
        [histId],
      )
    ).rows[0].bid_credit_cost === 1;

    report.grantsUnchanged =
      (await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)).rows[0]
        .c === grantsBefore;
    report.ledgerUnchanged =
      (
        await client.query(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)
      ).rows[0].c === ledgerBefore;

    report.noPantryTables = (
      await client.query(`
        SELECT NOT EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename ILIKE '%pantry%'
        ) AS ok
      `)
    ).rows[0].ok;

    await execFile(client, sqlPath);
    report.rerunOk = true;
    report.e3SettingsColsAfterRerun = (
      await client.query(`
        SELECT COUNT(*)::int AS c FROM information_schema.columns
         WHERE table_name='marketplace_economy_settings'
           AND column_name LIKE 'normal_order_%'
      `)
    ).rows[0].c;
    report.enginesOffAfterRerun = (
      await client.query(
        `SELECT bid_credits_enabled, article_applications_enabled, work_tokens_enabled
           FROM marketplace_economy_settings WHERE id=1`,
      )
    ).rows[0];
    report.historicalStillNullAfterRerun = (
      await client.query(
        `SELECT application_bid_cost IS NULL AS ok FROM orders WHERE id=$1`,
        [histId],
      )
    ).rows[0].ok;
    report.mig156Absent = (
      await client.query(
        `SELECT NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='156_default_plan_catalog') AS ok`,
      )
    ).rows[0].ok;

    report.MIGRATION_155_ISOLATED_APPLY =
      report.shaMatch &&
      report.before154Applied &&
      report.before155Absent &&
      report.beforeE3Col === false &&
      report.b2CostOneStillRequired &&
      report.after155Applied &&
      report.e3OrderCols === 8 &&
      report.e3SettingsCols >= 20 &&
      report.historicalNullEconomics &&
      report.historicalSnapshotEmpty &&
      report.enginesOff &&
      report.quantityAwareCostOk &&
      report.legacyCostOneStillValid &&
      report.grantsUnchanged &&
      report.ledgerUnchanged &&
      report.noPantryTables &&
      report.rerunOk &&
      report.e3SettingsColsAfterRerun === report.e3SettingsCols &&
      report.enginesOffAfterRerun.bid_credits_enabled === false &&
      report.historicalStillNullAfterRerun &&
      report.mig156Absent &&
      !report.sqlMutatesPantry &&
      !report.sqlEnablesEngines &&
      !report.sqlMutatesWorkTokens &&
      !report.sqlRewritesOrderEconomics &&
      !report.sqlConsumesOrRefundsBids
        ? "PASS"
        : "FAIL";
  } finally {
    await client.end().catch(() => {});
    try {
      await pg.stop();
    } catch {
      /* Windows EBUSY non-fatal */
    }
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  if (report.MIGRATION_155_ISOLATED_APPLY !== "PASS") process.exitCode = 1;
}

main().catch((err) => {
  // eslint-disable-next-line console
  console.error(err);
  process.exitCode = 1;
});
