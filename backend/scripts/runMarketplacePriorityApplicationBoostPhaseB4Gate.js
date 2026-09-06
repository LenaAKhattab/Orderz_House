/**
 * Phase B4 DB-backed gate — critical Priority Application Boost economics.
 * Uses embedded-postgres. NEVER Production.
 *
 * Run: node scripts/runMarketplacePriorityApplicationBoostPhaseB4Gate.js
 */
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_priority_b4_gate_pg_v2");
const PORT = 55452;
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

async function execSqlFile(client, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const stmts = splitSqlStatements(stripSqlLineComments(raw));
  for (const stmt of stmts) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(stmt);
  }
}

async function ensureOrdersMinimalSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_code VARCHAR(64) NOT NULL UNIQUE,
      title VARCHAR(200) NOT NULL DEFAULT 'B4 Order',
      description TEXT NOT NULL DEFAULT 'B4 gate',
      category_id BIGINT NULL,
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
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE`,
    );
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
        ('super_admin', 'sa', 'x', TRUE),
        ('admin', 'a', 'x', TRUE),
        ('client', 'c', 'x', TRUE),
        ('freelancer', 'f', 'x', TRUE)
      ON CONFLICT (name) DO NOTHING;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(120) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
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
      "148_priority_application_boost.sql",
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
      // eslint-disable-next-line no-console
      console.log(`[b4-gate-migrate] ${file}`);
      await execSqlFile(client, path.join(migrationsDir, file));
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [version],
      );
    }
  } finally {
    await client.end();
  }
}

async function seedFreelancerWithCycle(client, { usesAllowed = 2 } = {}) {
  const suffix = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 99)).padStart(2, "0");
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const u = await client.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1,$2,'x','freelancer','A1','T','User',$3,$3,'ذكر','JO',TRUE,TRUE,TRUE)
     RETURNING id`,
    [`A${suffix}`.slice(0, 10).toUpperCase(), `fl_${suffix}@t.local`, phone],
  );
  const freelancerId = u.rows[0].id;
  let planId = (
    await client.query(`SELECT id FROM marketplace_membership_plans ORDER BY id LIMIT 1`)
  ).rows[0]?.id;
  if (!planId) {
    planId = (
      await client.query(
        `INSERT INTO marketplace_membership_plans
           (tier_code, name_ar, monthly_price_jod, priority_bid_enabled, priority_bid_uses_per_cycle, is_active)
         VALUES ('active','نشط',10,TRUE,$1,TRUE) RETURNING id`,
        [usesAllowed],
      )
    ).rows[0].id;
  } else {
    await client.query(
      `UPDATE marketplace_membership_plans
          SET priority_bid_enabled=TRUE, priority_bid_uses_per_cycle=$2
        WHERE id=$1`,
      [planId, usesAllowed],
    );
  }
  const m = await client.query(
    `INSERT INTO freelancer_marketplace_memberships
       (freelancer_user_id, marketplace_plan_id, status, is_current, started_at, cycle_anchor_day, source)
     VALUES ($1,$2,'active',TRUE,NOW(),1,'system') RETURNING id`,
    [freelancerId, planId],
  );
  const c = await client.query(
    `INSERT INTO marketplace_membership_cycles
       (membership_id, marketplace_plan_id, status, cycle_number,
        priority_bid_uses_allowed, priority_bid_uses_consumed, starts_at, ends_at, activated_at)
     VALUES ($1,$2,'active',1,$3,0,NOW(),NOW()+interval '30 days',NOW())
     RETURNING id`,
    [m.rows[0].id, planId, usesAllowed],
  );
  return { freelancerId, membershipId: m.rows[0].id, cycleId: c.rows[0].id };
}

async function seedOrder(client) {
  const o = await client.query(
    `INSERT INTO orders
       (order_code, project_type, currency_code, bid_budget_min, bid_budget_max,
        order_status, source_type, is_published, is_open_for_pool)
     VALUES ($1,'bidding','JOD',10,100,'open_for_bids','client_created',TRUE,TRUE)
     RETURNING id`,
    [`O${Date.now()}${Math.floor(Math.random() * 9999)}`],
  );
  return o.rows[0].id;
}

async function main() {
  const databaseUrl = buildUrl();
  process.env.DATABASE_URL = databaseUrl;
  process.env.APP_ENV = "test";

  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}backend${path.sep}src${path.sep}`)) delete require.cache[key];
  }

  const pg = await startEmbeddedPostgres();
  try {
    await applyInitAndMigrations(databaseUrl);

    const setup = new Client({ connectionString: databaseUrl, ssl: false });
    await setup.connect();
    await setup.query(`
      UPDATE marketplace_economy_settings
         SET priority_application_boost_enabled = TRUE,
             bid_credits_enabled = FALSE,
             priority_bidding_enabled = FALSE,
             work_tokens_enabled = FALSE
       WHERE id = 1`);
    await setup.end();

    const boostSvc = require("../src/services/marketplacePriorityApplicationBoostService");
    boostSvc.clearPriorityApplicationBoostSchemaCache();
    const { pool } = require("../src/config/db");

    // 1) concurrent upgrade → one use
    {
      const client = await pool.connect();
      const { freelancerId } = await seedFreelancerWithCycle(client, { usesAllowed: 2 });
      const orderId = await seedOrder(client);
      await client.query(
        `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
         VALUES ($1,$2,25,'pending')`,
        [orderId, freelancerId],
      );
      client.release();
      const results = await Promise.allSettled([
        boostSvc.upgradeExistingApplicationToPriority({ freelancerUserId: freelancerId, orderId }),
        boostSvc.upgradeExistingApplicationToPriority({ freelancerUserId: freelancerId, orderId }),
      ]);
      assert.ok(results.some((r) => r.status === "fulfilled"));
      const boosts = await pool.query(
        `SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts
          WHERE order_id=$1 AND freelancer_user_id=$2`,
        [orderId, freelancerId],
      );
      assert.equal(boosts.rows[0].c, 1);
      const cycle = await pool.query(
        `SELECT c.priority_bid_uses_consumed
           FROM marketplace_membership_cycles c
           JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
          WHERE m.freelancer_user_id=$1 AND c.status='active'
          ORDER BY c.id DESC LIMIT 1`,
        [freelancerId],
      );
      assert.equal(Number(cycle.rows[0].priority_bid_uses_consumed), 1);
    }

    // 2) engine OFF
    {
      await pool.query(
        `UPDATE marketplace_economy_settings SET priority_application_boost_enabled=FALSE WHERE id=1`,
      );
      boostSvc.clearPriorityApplicationBoostSchemaCache();
      const client = await pool.connect();
      const { freelancerId } = await seedFreelancerWithCycle(client, { usesAllowed: 1 });
      const orderId = await seedOrder(client);
      await client.query(
        `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
         VALUES ($1,$2,30,'pending')`,
        [orderId, freelancerId],
      );
      client.release();
      await assert.rejects(() =>
        boostSvc.upgradeExistingApplicationToPriority({ freelancerUserId: freelancerId, orderId }),
      );
      const boosts = await pool.query(
        `SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts WHERE order_id=$1`,
        [orderId],
      );
      assert.equal(boosts.rows[0].c, 0);
      await pool.query(
        `UPDATE marketplace_economy_settings SET priority_application_boost_enabled=TRUE WHERE id=1`,
      );
    }

    // 3) terminal state
    {
      const client = await pool.connect();
      const { freelancerId } = await seedFreelancerWithCycle(client, { usesAllowed: 1 });
      const orderId = await seedOrder(client);
      await client.query(
        `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
         VALUES ($1,$2,40,'pending')`,
        [orderId, freelancerId],
      );
      await client.query(
        `UPDATE orders SET assigned_freelancer_id=$2, order_status='in_progress' WHERE id=$1`,
        [orderId, freelancerId],
      );
      client.release();
      await assert.rejects(() =>
        boostSvc.upgradeExistingApplicationToPriority({ freelancerUserId: freelancerId, orderId }),
      );
    }

    // 4) Priority Use return idempotent (double no-selection unwind)
    {
      const client = await pool.connect();
      await client.query("BEGIN");
      const { freelancerId, cycleId } = await seedFreelancerWithCycle(client, { usesAllowed: 2 });
      const orderId = await seedOrder(client);
      const bid = await client.query(
        `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
         VALUES ($1,$2,55,'pending') RETURNING id`,
        [orderId, freelancerId],
      );
      const orderRow = (await client.query(`SELECT * FROM orders WHERE id=$1`, [orderId])).rows[0];
      await boostSvc.applyPriorityApplicationBoost({
        client,
        freelancerUserId: freelancerId,
        orderId,
        bidId: bid.rows[0].id,
        orderRow,
        poolKind: "real",
        boostSource: "submit",
        actorUserId: freelancerId,
      });
      await client.query("COMMIT");
      client.release();

      const cA = await pool.connect();
      await cA.query("BEGIN");
      const first = await boostSvc.returnPriorityBoostsForOrderEndedWithoutSelection({
        client: cA,
        orderId,
        actorUserId: freelancerId,
      });
      await cA.query("COMMIT");
      cA.release();

      const cB = await pool.connect();
      await cB.query("BEGIN");
      const second = await boostSvc.returnPriorityBoostsForOrderEndedWithoutSelection({
        client: cB,
        orderId,
        actorUserId: freelancerId,
      });
      await cB.query("COMMIT");
      cB.release();

      assert.equal(first.returned, 1);
      assert.equal(second.returned, 0);
      const cycle = await pool.query(
        `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles WHERE id=$1`,
        [cycleId],
      );
      assert.equal(Number(cycle.rows[0].priority_bid_uses_consumed), 0);
      const returns = await pool.query(
        `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycle_usage
          WHERE cycle_id=$1 AND event_type='returned' AND reference_type='priority_application_boost'`,
        [cycleId],
      );
      assert.equal(returns.rows[0].c, 1);
    }

    // 5) static: return primitive generic + auction superseded
    {
      const usageSrc = fs.readFileSync(
        path.join(BACKEND_ROOT, "src/services/marketplacePriorityBidUsageService.js"),
        "utf8",
      );
      assert.doesNotMatch(usageSrc, /work_token|priority_bid_auction|priority_auction_bid/i);
      const auctionSrc = fs.readFileSync(
        path.join(BACKEND_ROOT, "src/services/marketplacePriorityAuctionService.js"),
        "utf8",
      );
      // Phase B7B: legacy auction create path hard-deprecated (stronger than Boost-supersede skip).
      assert.match(auctionSrc, /PRIORITY_AUCTION_DEPRECATED/);
      assert.match(auctionSrc, /maybeCreatePriorityAuctionOnPricedBiddingOpen/);
      const boostSrc = fs.readFileSync(
        path.join(BACKEND_ROOT, "src/services/marketplacePriorityApplicationBoostService.js"),
        "utf8",
      );
      assert.match(boostSrc, /PRIORITY_APPLICATION_BOOST_LEGACY_AUCTION_CONFLICT/);
      assert.match(boostSrc, /assertOrderOpenForPriorityBoost/);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          B4_DB_GATE: "PASS",
          tests: [
            "concurrent_upgrade_once",
            "engine_off_reject",
            "terminal_order_reject",
            "priority_return_idempotent",
            "return_primitive_generic",
            "legacy_auction_mutual_exclusion",
          ],
        },
        null,
        2,
      ),
    );
    await pool.end();
  } finally {
    await pg.stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
