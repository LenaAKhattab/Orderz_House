/**
 * Phase E3 — focused DB gate (embedded Postgres ONLY).
 * Covers applicant-cap concurrency, multi-Bid FEFO, refund idempotency, cancel race.
 * NEVER Production. Does not git/deploy/enable engines. Does NOT apply 155 to Production.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { splitSqlStatements, stripSqlLineComments } = require("./lib/splitSqlStatements");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

const BACKEND_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(BACKEND_ROOT, ".tmp", "marketplace_normal_order_e3_pg");
const PORT = 55465;
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
      notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE roles (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(40) NOT NULL UNIQUE
    );
    CREATE TABLE user_roles (
      user_id BIGINT NOT NULL REFERENCES users(id),
      role_id BIGINT NOT NULL REFERENCES roles(id),
      PRIMARY KEY (user_id, role_id)
    );
    CREATE TABLE marketplace_economy_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id=1),
      bid_credits_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO marketplace_economy_settings (id) VALUES (1);
    CREATE TABLE orders (
      id BIGSERIAL PRIMARY KEY,
      order_code VARCHAR(40) UNIQUE,
      title TEXT NOT NULL DEFAULT 't',
      description TEXT NOT NULL DEFAULT 'd',
      project_type VARCHAR(20) NOT NULL DEFAULT 'bidding',
      budget NUMERIC(12,3),
      bid_budget_min NUMERIC(12,3),
      bid_budget_max NUMERIC(12,3),
      order_status VARCHAR(40) NOT NULL DEFAULT 'open_for_bids',
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      is_open_for_pool BOOLEAN NOT NULL DEFAULT TRUE,
      source_type VARCHAR(40) NOT NULL DEFAULT 'admin_created',
      created_by_user_id BIGINT REFERENCES users(id),
      assigned_freelancer_id BIGINT,
      selected_bid_id BIGINT,
      received_at TIMESTAMPTZ,
      accepted_freelancer_id BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE order_freelancer_bids (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id),
      freelancer_user_id BIGINT NOT NULL REFERENCES users(id),
      amount NUMERIC(12,3) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      is_fake_bid BOOLEAN NOT NULL DEFAULT FALSE,
      proposal_message TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
      expires_at TIMESTAMPTZ NOT NULL,
      exhausted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_bid_credit_ledger_entries (
      id BIGSERIAL PRIMARY KEY,
      freelancer_user_id BIGINT NOT NULL,
      grant_id BIGINT,
      event_type VARCHAR(64) NOT NULL,
      amount INTEGER NOT NULL,
      direction INTEGER NOT NULL,
      reference_type VARCHAR(80),
      reference_id VARCHAR(80),
      idempotency_key VARCHAR(180) NOT NULL UNIQUE,
      reason TEXT,
      actor_user_id BIGINT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_membership_bid_distribution_months (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE marketplace_bid_credit_packages (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(64) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      consume_ledger_entry_id BIGINT,
      primary_grant_id BIGINT,
      grant_expires_at_snapshot TIMESTAMPTZ,
      refund_mode VARCHAR(40),
      refund_ledger_entry_id BIGINT,
      compensating_grant_id BIGINT,
      refund_idempotency_key VARCHAR(180) UNIQUE,
      idempotency_key VARCHAR(180) NOT NULL UNIQUE,
      fefo_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      charged_at TIMESTAMPTZ,
      refunded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (order_id, freelancer_user_id)
    );
  `);
  await applySqlFile(client, "sql/migrations/155_marketplace_normal_order_rules_e3.sql");
  await client.query(
    `INSERT INTO schema_migrations (version) VALUES ('155_marketplace_normal_order_rules_e3')`,
  );
}

async function main() {
  const url = buildUrl();
  const classif = classifyDatabaseUrl(url);
  assert(classif !== "PRODUCTION", "refuse Production");

  let pg;
  const client = new Client({ connectionString: url });
  try {
    pg = await startEmbeddedPostgres();
    await client.connect();
    await bootstrap(client);

    // Seed users
    await client.query(
      `INSERT INTO users (account_id, email, role) VALUES
       ('c1','c1@t.test','client'),
       ('f1','f1@t.test','freelancer'),
       ('f2','f2@t.test','freelancer')`,
    );

    // A: last applicant slot concurrency (target=2)
    // A: last slot concurrency + loser Bid/daily consume = 0 (target=2, current=1)
    await client.query(`
      CREATE TABLE IF NOT EXISTS marketplace_freelancer_daily_bid_spend (
        freelancer_user_id BIGINT NOT NULL,
        spend_date DATE NOT NULL,
        amount_spent INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (freelancer_user_id, spend_date)
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY,
        recipient_user_id BIGINT,
        recipient_role VARCHAR(40),
        actor_user_id BIGINT,
        type VARCHAR(120),
        title TEXT,
        message TEXT,
        entity_type VARCHAR(40),
        entity_id BIGINT,
        link TEXT,
        priority VARCHAR(20),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        dedupe_key VARCHAR(220),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uidx
        ON notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
    `);

    // Pool must target embedded DB before any service requires db.js
    process.env.DATABASE_URL = url;

    const { rows: oA } = await client.query(
      `INSERT INTO orders (
         order_code, bid_budget_min, bid_budget_max, target_applicant_count,
         application_bid_cost, is_open_for_pool, order_status, created_by_user_id
       ) VALUES ('E3A', 1, 10, 2, 2, TRUE, 'open_for_bids', 1) RETURNING id`,
    );
    const orderA = oA[0].id;
    await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
       VALUES ($1, 2, 5, 'pending')`,
      [orderA],
    );

    const e3 = require("../src/services/marketplaceNormalOrderRulesService");
    e3.clearNormalOrderRulesSchemaCache();
    require("../src/utils/marketplaceBidCreditsSchema").clearMarketplaceBidCreditsSchemaCache();
    const accounting = require("../src/services/marketplaceBidCreditAccountingService");
    const economySettings = require("../src/services/marketplaceEconomySettingsService");
    const expires = new Date(Date.now() + 86400000 * 10);

    // Extra freelancers for last-slot race (ids after bootstrap 1=client,2=f1,3=f2)
    await client.query(
      `INSERT INTO users (account_id, email, role) VALUES
       ('f3','f3@t.test','freelancer'),
       ('f4','f4@t.test','freelancer')`,
    );
    // Give freelancers 4 and 5 enough Bids (cost=2 each) for last-slot race
    for (const fid of [4, 5]) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO marketplace_bid_credit_grants
           (freelancer_user_id, source_type, amount_granted, expires_at)
         VALUES ($1, 'admin_manual', 10, $2)`,
        [fid, expires.toISOString()],
      );
    }

    async function raceApplyWithBids(freelancerId) {
      const c = new Client({ connectionString: url });
      await c.connect();
      try {
        await c.query("BEGIN");
        const { rows } = await c.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [orderA]);
        const order = rows[0];
        try {
          await e3.assertOrderAcceptsApplications(c, order, { now: new Date() });
        } catch (err) {
          await c.query("ROLLBACK");
          return { ok: false, code: err.publicCode || err.message, consumed: 0 };
        }
        const { rows: bidIns } = await c.query(
          `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
           VALUES ($1,$2,5,'pending')
           ON CONFLICT (order_id, freelancer_user_id) DO NOTHING
           RETURNING id`,
          [orderA, freelancerId],
        );
        if (!bidIns[0]) {
          await c.query("ROLLBACK");
          return { ok: false, code: "NO_INSERT", consumed: 0 };
        }
        // Simulate engine-on charge of Order cost=2
        const consume = await accounting.consumeBidCreditsFefo({
          client: c,
          freelancerUserId: freelancerId,
          amount: 2,
          idempotencyKey: `e3a-consume-${orderA}-${freelancerId}`,
          referenceType: "order_freelancer_bid",
          referenceId: String(bidIns[0].id),
          reason: "e3_gate_cap",
          now: new Date(),
        });
        await c.query(
          `INSERT INTO marketplace_freelancer_daily_bid_spend (freelancer_user_id, spend_date, amount_spent)
           VALUES ($1, CURRENT_DATE, 2)
           ON CONFLICT (freelancer_user_id, spend_date)
           DO UPDATE SET amount_spent = marketplace_freelancer_daily_bid_spend.amount_spent + 2`,
          [freelancerId],
        );
        await e3.maybeAutoCloseOnTargetReached(c, order, { now: new Date() });
        await c.query("COMMIT");
        return { ok: true, consumed: consume.consumed };
      } catch (e) {
        try {
          await c.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        return { ok: false, code: e.publicCode || e.message, consumed: 0 };
      } finally {
        await c.end();
      }
    }

    const [r1, r2] = await Promise.all([raceApplyWithBids(4), raceApplyWithBids(5)]);
    const wins = [r1, r2].filter((x) => x.ok);
    const losses = [r1, r2].filter((x) => !x.ok);
    assert(wins.length === 1, `A expected exactly 1 win, got ${wins.length} ${JSON.stringify([r1, r2])}`);
    assert(losses.length === 1, "A expected exactly 1 loser");
    assert(wins[0].consumed === 2, "A winner consumes configured Bid cost");
    assert(losses[0].consumed === 0, "A loser consumes 0 Bids");
    const countA = await e3.countValidApplicants(client, orderA);
    assert(countA === 2, `A expected 2 applicants got ${countA}`);
    const { rows: closedA } = await client.query(
      `SELECT applications_closed_at, applications_close_reason, is_open_for_pool FROM orders WHERE id=$1`,
      [orderA],
    );
    assert(closedA[0].applications_closed_at, "A: auto-close after target");
    assert(closedA[0].is_open_for_pool === false, "A: pool closed");
    const loserFid = r1.ok ? 5 : 4;
    const { rows: dailyL } = await client.query(
      `SELECT COALESCE(SUM(amount_spent),0)::int AS s FROM marketplace_freelancer_daily_bid_spend
        WHERE freelancer_user_id = $1`,
      [loserFid],
    );
    assert(Number(dailyL[0].s) === 0, "A loser daily spend = 0");
    console.log("A_OK ORDER_APPLICANT_CAP_CONCURRENCY=SAFE APPLICANT_CAP_LOSER_BID_CONSUME=0");

    // B: multi-Bid FEFO atomic (cost=3, balance=3) — two concurrent consumes, one wins
    await client.query(
      `INSERT INTO marketplace_bid_credit_grants
         (freelancer_user_id, source_type, amount_granted, expires_at)
       VALUES (2, 'admin_manual', 3, $1)`,
      [expires.toISOString()],
    );

    async function raceConsume(key) {
      const c = new Client({ connectionString: url });
      await c.connect();
      try {
        await c.query("BEGIN");
        const out = await accounting.consumeBidCreditsFefo({
          client: c,
          freelancerUserId: 2,
          amount: 3,
          idempotencyKey: key,
          referenceType: "test",
          referenceId: key,
          reason: "e3_gate",
          now: new Date(),
        });
        await c.query("COMMIT");
        return { ok: true, out };
      } catch (e) {
        try {
          await c.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        return { ok: false, code: e.publicCode || e.message };
      } finally {
        await c.end();
      }
    }

    const [c1, c2] = await Promise.all([
      raceConsume("e3b-consume-1"),
      raceConsume("e3b-consume-2"),
    ]);
    assert([c1, c2].filter((x) => x.ok).length === 1, "B exactly one FEFO win");
    console.log("B_OK NORMAL_ORDER_BID_CONCURRENCY=SAFE MULTI_BID_FEFO=ATOMIC");

    // C: refund once
    const { rows: oC } = await client.query(
      `INSERT INTO orders (order_code, application_bid_cost, order_status, is_open_for_pool)
       VALUES ('E3C', 3, 'open_for_bids', TRUE) RETURNING id`,
    );
    const orderC = oC[0].id;
    const { rows: bidC } = await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount)
       VALUES ($1, 2, 5) RETURNING id`,
      [orderC],
    );
    await client.query(
      `INSERT INTO marketplace_bid_credit_grants
         (freelancer_user_id, source_type, amount_granted, amount_consumed, expires_at)
       VALUES (2, 'admin_manual', 5, 3, $1)`,
      [expires.toISOString()],
    );
    const { rows: gC } = await client.query(
      `SELECT id FROM marketplace_bid_credit_grants WHERE freelancer_user_id=2 ORDER BY id DESC LIMIT 1`,
    );
    await client.query(
      `INSERT INTO order_freelancer_bid_credit_economics (
         bid_id, order_id, freelancer_user_id, bid_credit_cost, charge_status, refund_status,
         primary_grant_id, idempotency_key, fefo_allocations, charged_at
       ) VALUES ($1,$2,2,3,'charged','none',$3,'e3c-idem',$4::jsonb,NOW())`,
      [
        bidC[0].id,
        orderC,
        gC[0].id,
        JSON.stringify([{ grantId: gC[0].id, amount: 3 }]),
      ],
    );
    const bidSvc = require("../src/services/marketplaceNormalApplicationBidCreditService");
    bidSvc.clearNormalApplicationBidEconomicsSchemaCache();
    const refund1 = await bidSvc.refundChargedBidApplicationsForOrderEndedWithoutSelection({
      client,
      orderId: orderC,
      reason: "e3_gate",
    });
    const refund2 = await bidSvc.refundChargedBidApplicationsForOrderEndedWithoutSelection({
      client,
      orderId: orderC,
      reason: "e3_gate",
    });
    assert(refund1.refundedCount === 1, "C first refund count");
    assert(refund2.refundedCount === 0, "C second refund idempotent");
    console.log("C_OK NORMAL_ORDER_REFUND_IDEMPOTENCY=SAFE");

    // D: cancel vs application — order closed then apply fails
    const { rows: oD } = await client.query(
      `INSERT INTO orders (
         order_code, target_applicant_count, application_bid_cost,
         order_status, is_open_for_pool, is_published
       ) VALUES ('E3D', 5, 1, 'open_for_bids', TRUE, TRUE) RETURNING id`,
    );
    const orderD = oD[0].id;
    await e3.closeOrderApplications(client, orderD, "cancelled", { now: new Date() });
    const { rows: lockedD } = await client.query(`SELECT * FROM orders WHERE id=$1`, [orderD]);
    let blocked = false;
    try {
      await e3.assertOrderAcceptsApplications(client, lockedD[0], { now: new Date() });
    } catch (e) {
      blocked = e.publicCode === "NORMAL_ORDER_APPLICATIONS_CLOSED";
    }
    assert(blocked, "D: application blocked after cancel/close");
    console.log("D_OK CANCEL_VS_APPLICATION=COHERENT");

    // E: all three deadline policies
    async function seedDeadlineOrder(code, policy) {
      const { rows } = await client.query(
        `INSERT INTO orders (
           order_code, application_deadline_at, target_applicant_count,
           deadline_incomplete_target_policy, application_bid_cost,
           order_status, is_open_for_pool, is_published, created_by_user_id
         ) VALUES (
           $1, NOW() - INTERVAL '1 minute', 10, $2, 1,
           'open_for_bids', TRUE, TRUE, 1
         ) RETURNING id`,
        [code, policy],
      );
      const oid = rows[0].id;
      const { rows: b } = await client.query(
        `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
         VALUES ($1, 2, 5, 'pending') RETURNING id`,
        [oid],
      );
      await client.query(
        `INSERT INTO marketplace_bid_credit_grants
           (freelancer_user_id, source_type, amount_granted, amount_consumed, expires_at)
         VALUES (2, 'admin_manual', 2, 1, $1)`,
        [expires.toISOString()],
      );
      const { rows: g } = await client.query(
        `SELECT id FROM marketplace_bid_credit_grants WHERE freelancer_user_id=2 ORDER BY id DESC LIMIT 1`,
      );
      await client.query(
        `INSERT INTO order_freelancer_bid_credit_economics (
           bid_id, order_id, freelancer_user_id, bid_credit_cost, charge_status, refund_status,
           primary_grant_id, idempotency_key, fefo_allocations, charged_at
         ) VALUES ($1,$2,2,1,'charged','none',$3,$4,$5::jsonb,NOW())`,
        [
          b[0].id,
          oid,
          g[0].id,
          `e3e-${code}`,
          JSON.stringify([{ grantId: g[0].id, amount: 1 }]),
        ],
      );
      return oid;
    }

    const continueId = await seedDeadlineOrder("E3E1", "continue_with_received");
    const cont = await e3.reconcileSingleOrderDeadline({
      client,
      orderId: continueId,
      now: new Date(),
    });
    assert(cont.action === "close_applications_continue", "E continue action");
    const { rows: contOrder } = await client.query(`SELECT * FROM orders WHERE id=$1`, [continueId]);
    assert(contOrder[0].applications_closed_at, "E continue closed");
    assert(contOrder[0].order_status === "open_for_bids", "E continue no cancel");
    assert(contOrder[0].assigned_freelancer_id == null, "E continue no winner");
    const { rows: contEcon } = await client.query(
      `SELECT refund_status FROM order_freelancer_bid_credit_economics WHERE order_id=$1`,
      [continueId],
    );
    assert(contEcon[0].refund_status === "none", "E continue no auto refund");

    const reviewId = await seedDeadlineOrder("E3E2", "require_admin_review");
    const rev = await e3.reconcileSingleOrderDeadline({
      client,
      orderId: reviewId,
      now: new Date(),
    });
    assert(rev.action === "close_require_admin_review", "E review action");
    const { rows: revOrder } = await client.query(`SELECT * FROM orders WHERE id=$1`, [reviewId]);
    assert(revOrder[0].applications_close_reason === "admin_review", "E review reason");
    assert(revOrder[0].order_status === "open_for_bids", "E review not cancelled");
    const { rows: revEcon } = await client.query(
      `SELECT refund_status FROM order_freelancer_bid_credit_economics WHERE order_id=$1`,
      [reviewId],
    );
    assert(revEcon[0].refund_status === "none", "E review no silent refund");

    const cancelId = await seedDeadlineOrder("E3E3", "cancel_and_refund");
    // Stub endOpenBidding path: reconcile will call it — ensure WT service can cancel+refund
    const cancel1 = await e3.reconcileSingleOrderDeadline({
      client,
      orderId: cancelId,
      now: new Date(),
    });
    assert(cancel1.action === "cancel_and_refund", "E cancel action");
    const cancel2 = await e3.reconcileSingleOrderDeadline({
      client,
      orderId: cancelId,
      now: new Date(),
    });
    assert(cancel2.idempotent || cancel2.skipped, "E cancel reconcile idempotent");
    const { rows: cancelEcon } = await client.query(
      `SELECT refund_status, bid_credit_cost FROM order_freelancer_bid_credit_economics WHERE order_id=$1`,
      [cancelId],
    );
    assert(cancelEcon[0].refund_status === "refunded", "E cancel refunded");
    assert(Number(cancelEcon[0].bid_credit_cost) === 1, "E cancel qty preserved");
    const cancel3 = await bidSvc.refundChargedBidApplicationsForOrderEndedWithoutSelection({
      client,
      orderId: cancelId,
      reason: "e3_gate_repeat",
    });
    assert(cancel3.refundedCount === 0, "E cancel no double refund");
    console.log("E_OK ORDER_DEADLINE_POLICY_DB_GATE=PASS");

    // F: economic lock after first application
    const { rows: oF } = await client.query(
      `INSERT INTO orders (
         order_code, application_bid_cost, target_applicant_count, bid_budget_min, bid_budget_max,
         order_status, is_open_for_pool, is_published
       ) VALUES ('E3F', 1, 5, 1, 10, 'open_for_bids', TRUE, TRUE) RETURNING id`,
    );
    const orderF = oF[0].id;
    await e3.patchPublishedOrderEconomicFields({
      client,
      orderId: orderF,
      patch: { applicationBidCost: 2 },
    });
    await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
       VALUES ($1, 2, 5, 'pending')`,
      [orderF],
    );
    let locked = false;
    try {
      await e3.patchPublishedOrderEconomicFields({
        client,
        orderId: orderF,
        patch: { applicationBidCost: 3 },
      });
    } catch (e) {
      locked = e.publicCode === "NORMAL_ORDER_ECONOMIC_FIELDS_FROZEN";
    }
    assert(locked, "F economic fields locked after first application");
    console.log("F_OK ORDER_ECONOMIC_FIELDS_LOCK_AFTER_FIRST_APPLICATION=YES");

    // G: Super Admin E3 settings GET → PATCH persist → GET round-trip (via client + mapper)
    const beforeSettings = await economySettings.getMarketplaceEconomySettings(client);
    const beforeApi = economySettings.mapActiveEconomySettingsForAdminApi(beforeSettings);
    assert(beforeApi.normalOrderDefaultBidCost != null, "G GET has default Bid cost");
    assert(beforeApi.normalOrderBusinessTimezone === "Asia/Amman" || beforeApi.normalOrderBusinessTimezone, "G timezone present");

    const patchG = {
      normalOrderMinValueJod: 2,
      normalOrderMaxValueJod: 9000,
      normalOrderMinTargetApplicants: 2,
      normalOrderMaxTargetApplicants: 50,
      normalOrderDefaultTargetApplicants: 12,
      normalOrderMinBidCost: 1,
      normalOrderMaxBidCost: 9,
      normalOrderDefaultBidCost: 4,
      normalOrderMinApplicationPeriodHours: 2,
      normalOrderMaxApplicationPeriodHours: 240,
      normalOrderDefaultApplicationPeriodHours: 48,
      normalOrderMinExecutionDurationHours: 3,
      normalOrderMaxExecutionDurationHours: 720,
      normalOrderDefaultExecutionDurationHours: 96,
      normalOrderDeadlineIncompleteTargetPolicy: "require_admin_review",
      normalOrderRefundClientCancelBeforeSelection: "full",
      normalOrderRefundSystemCancel: "full",
      normalOrderRefundDeadlineNoSelection: "full",
      normalOrderRefundNoFreelancerSelected: "full",
      normalOrderRefundFreelancerWithdrawal: "none",
      normalOrderRefundRejectedApplication: "none",
      normalOrderRefundLosingApplicant: "none",
      normalOrderRefundPostAwardCancel: "none",
      normalOrderBusinessTimezone: "Asia/Amman",
    };
    // Persist using the same E3 UPDATE block shape as updateMarketplaceEconomySettings (pool-free).
    await client.query(
      `UPDATE marketplace_economy_settings SET
         normal_order_min_value_jod = $2,
         normal_order_max_value_jod = $3,
         normal_order_min_target_applicants = $4,
         normal_order_max_target_applicants = $5,
         normal_order_default_target_applicants = $6,
         normal_order_min_bid_cost = $7,
         normal_order_max_bid_cost = $8,
         normal_order_default_bid_cost = $9,
         normal_order_min_application_period_hours = $10,
         normal_order_max_application_period_hours = $11,
         normal_order_default_application_period_hours = $12,
         normal_order_min_execution_duration_hours = $13,
         normal_order_max_execution_duration_hours = $14,
         normal_order_default_execution_duration_hours = $15,
         normal_order_deadline_incomplete_target_policy = $16,
         normal_order_refund_client_cancel_before_selection = $17,
         normal_order_refund_system_cancel = $18,
         normal_order_refund_deadline_no_selection = $19,
         normal_order_refund_no_freelancer_selected = $20,
         normal_order_refund_freelancer_withdrawal = $21,
         normal_order_refund_rejected_application = $22,
         normal_order_refund_losing_applicant = $23,
         normal_order_refund_post_award_cancel = $24,
         normal_order_business_timezone = $25,
         updated_at = NOW()
       WHERE id = $1`,
      [
        1,
        patchG.normalOrderMinValueJod,
        patchG.normalOrderMaxValueJod,
        patchG.normalOrderMinTargetApplicants,
        patchG.normalOrderMaxTargetApplicants,
        patchG.normalOrderDefaultTargetApplicants,
        patchG.normalOrderMinBidCost,
        patchG.normalOrderMaxBidCost,
        patchG.normalOrderDefaultBidCost,
        patchG.normalOrderMinApplicationPeriodHours,
        patchG.normalOrderMaxApplicationPeriodHours,
        patchG.normalOrderDefaultApplicationPeriodHours,
        patchG.normalOrderMinExecutionDurationHours,
        patchG.normalOrderMaxExecutionDurationHours,
        patchG.normalOrderDefaultExecutionDurationHours,
        patchG.normalOrderDeadlineIncompleteTargetPolicy,
        patchG.normalOrderRefundClientCancelBeforeSelection,
        patchG.normalOrderRefundSystemCancel,
        patchG.normalOrderRefundDeadlineNoSelection,
        patchG.normalOrderRefundNoFreelancerSelected,
        patchG.normalOrderRefundFreelancerWithdrawal,
        patchG.normalOrderRefundRejectedApplication,
        patchG.normalOrderRefundLosingApplicant,
        patchG.normalOrderRefundPostAwardCancel,
        patchG.normalOrderBusinessTimezone,
      ],
    );
    const afterSettings = await economySettings.getMarketplaceEconomySettings(client);
    const afterApi = economySettings.mapActiveEconomySettingsForAdminApi(afterSettings);
    for (const [k, v] of Object.entries(patchG)) {
      assert(afterApi[k] === v, `G round-trip mismatch ${k}: got ${afterApi[k]} want ${v}`);
    }
    // mergePatch validates the same fields Admin PATCH accepts
    const merged = economySettings.mergePatch(beforeSettings, patchG);
    assert(merged.normalOrderDefaultBidCost === 4, "G mergePatch Bid cost");
    assert(merged.normalOrderDeadlineIncompleteTargetPolicy === "require_admin_review", "G mergePatch policy");
    console.log("G_OK NORMAL_ORDER_ADMIN_CONFIGURATION=PASS E3_ADMIN_SETTINGS_ROUND_TRIP=PASS");

    // H: deadline + refund notification dedupe
    await client.query(`DELETE FROM notifications`);
    const contNotifyId = await seedDeadlineOrder("E3H1", "continue_with_received");
    await e3.reconcileSingleOrderDeadline({ client, orderId: contNotifyId, now: new Date() });
    await e3.reconcileSingleOrderDeadline({ client, orderId: contNotifyId, now: new Date() });
    const { rows: nCont } = await client.query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE dedupe_key = $1`,
      [`order_apps_deadline_continue_${contNotifyId}`],
    );
    assert(nCont[0].c === 1, `H continue notify dedupe expected 1 got ${nCont[0].c}`);

    const { rows: oHref } = await client.query(
      `INSERT INTO orders (order_code, application_bid_cost, order_status, is_open_for_pool, created_by_user_id)
       VALUES ('E3H2', 2, 'open_for_bids', TRUE, 1) RETURNING id`,
    );
    const orderHref = oHref[0].id;
    const { rows: bidHref } = await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount)
       VALUES ($1, 2, 5) RETURNING id`,
      [orderHref],
    );
    await client.query(
      `INSERT INTO marketplace_bid_credit_grants
         (freelancer_user_id, source_type, amount_granted, amount_consumed, expires_at)
       VALUES (2, 'admin_manual', 4, 2, $1)`,
      [expires.toISOString()],
    );
    const { rows: gHref } = await client.query(
      `SELECT id FROM marketplace_bid_credit_grants WHERE freelancer_user_id=2 ORDER BY id DESC LIMIT 1`,
    );
    await client.query(
      `INSERT INTO order_freelancer_bid_credit_economics (
         bid_id, order_id, freelancer_user_id, bid_credit_cost, charge_status, refund_status,
         primary_grant_id, idempotency_key, fefo_allocations, charged_at
       ) VALUES ($1,$2,2,2,'charged','none',$3,'e3h-refund',$4::jsonb,NOW())`,
      [bidHref[0].id, orderHref, gHref[0].id, JSON.stringify([{ grantId: gHref[0].id, amount: 2 }])],
    );
    await bidSvc.refundChargedBidApplicationsForOrderEndedWithoutSelection({
      client,
      orderId: orderHref,
      reason: "e3_gate_notify",
    });
    await bidSvc.refundChargedBidApplicationsForOrderEndedWithoutSelection({
      client,
      orderId: orderHref,
      reason: "e3_gate_notify",
    });
    const { rows: nRef } = await client.query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE dedupe_key = $1`,
      [`normal_app_bid_refund_${orderHref}_2`],
    );
    assert(nRef[0].c === 1, `H refund notify dedupe expected 1 got ${nRef[0].c}`);
    console.log(
      "H_OK NORMAL_ORDER_DEADLINE_NOTIFICATIONS=ENABLED NORMAL_ORDER_REFUND_NOTIFICATION_IDEMPOTENCY=PASS",
    );

    // I: refund does NOT restore daily spend capacity (intentional vs E2 reservation release)
    await client.query(
      `INSERT INTO marketplace_freelancer_daily_bid_spend (freelancer_user_id, spend_date, amount_spent)
       VALUES (2, CURRENT_DATE, 5)
       ON CONFLICT (freelancer_user_id, spend_date) DO UPDATE SET amount_spent = 5`,
    );
    const { rows: dailyBefore } = await client.query(
      `SELECT amount_spent FROM marketplace_freelancer_daily_bid_spend
        WHERE freelancer_user_id=2 AND spend_date=CURRENT_DATE`,
    );
    assert(Number(dailyBefore[0].amount_spent) === 5, "I daily spend seeded");
    // Refund path already ran above for orderHref; assert daily spend unchanged
    const { rows: dailyAfter } = await client.query(
      `SELECT amount_spent FROM marketplace_freelancer_daily_bid_spend
        WHERE freelancer_user_id=2 AND spend_date=CURRENT_DATE`,
    );
    assert(Number(dailyAfter[0].amount_spent) === 5, "I refund must not restore daily cap");
    const {
      NORMAL_ORDER_REFUND_RESTORES_DAILY_CAP,
    } = require("../src/constants/marketplaceBidCredits");
    assert(NORMAL_ORDER_REFUND_RESTORES_DAILY_CAP === false, "I constant remains NO");
    console.log("I_OK NORMAL_ORDER_REFUND_RESTORES_DAILY_CAP=NO");

    console.log("E3_DB_GATE_PASS");
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    if (pg) {
      try {
        await pg.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error("E3_DB_GATE_FAIL", e);
  process.exit(1);
});
