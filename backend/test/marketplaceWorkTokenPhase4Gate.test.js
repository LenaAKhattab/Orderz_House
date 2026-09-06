/**
 * Marketplace Work Token Phase 4 — isolated DB + HTTP gate.
 *
 * Real Postgres concurrency + HTTP RBAC. Must be run via:
 *   node scripts/runMarketplaceWorkTokenPhase4Gate.js
 *
 * Refuses Production DATABASE_URL. No Stripe. No feature flags. No deploy.
 */

const http = require("node:http");
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE4 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!info.looksLocal && info.classification !== "ISOLATED_TEST") {
    throw new Error(
      `PHASE4 GATE requires local/isolated DB, got ${info.classification}: ${info.maskedTarget}`,
    );
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceWorkTokenPhase4Gate.js (ORDERZ_GATE_ISOLATED_DB)");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-work-token-phase4-gate-secret";
}
if (!process.env.CLIENT_URL) process.env.CLIENT_URL = "http://localhost:5173";
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";

const { pool } = require("../src/config/db");
const walletService = require("../src/services/marketplaceWorkTokenWalletService");
const { WORK_TOKEN_ERROR_CODES } = require("../src/constants/marketplaceWorkTokens");
const app = require("../src/app");

function listenApp() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

async function httpJson(server, pathname, options = {}) {
  const { method = "GET", body, bearerToken, headers = {} } = options;
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text };
  }
  return { status: res.status, body: parsed, text };
}

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `wt4_${role}_${suffix}@example.com`;
  const accountId = `W${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'Wt', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id, account_id, email, role`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

function tokenFor(userRow) {
  return jwt.sign(
    {
      sub: String(userRow.id),
      accountId: userRow.account_id,
      role: userRow.role,
      email: userRow.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

describe("Marketplace Work Token Phase 4 gate", () => {
  let server;
  let freelancer;
  let otherFreelancer;
  let superAdmin;

  before(async () => {
    server = await listenApp();
    freelancer = await seedUser("freelancer");
    otherFreelancer = await seedUser("freelancer");
    superAdmin = await seedUser("super_admin");
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    await pool.end();
  });

  it("read snapshot does not create wallet row", async () => {
    const before = await pool.query(
      `SELECT COUNT(*)::int AS c FROM freelancer_work_token_wallets WHERE freelancer_user_id = $1`,
      [freelancer.id],
    );
    const snap = await walletService.getWorkTokenWalletSnapshot(freelancer.id);
    assert.strictEqual(snap.exists, false);
    assert.strictEqual(snap.availableTokens, 0);
    assert.strictEqual(snap.reservedTokens, 0);
    assert.strictEqual(snap.engineAvailable, false);
    const after = await pool.query(
      `SELECT COUNT(*)::int AS c FROM freelancer_work_token_wallets WHERE freelancer_user_id = $1`,
      [freelancer.id],
    );
    assert.strictEqual(before.rows[0].c, 0);
    assert.strictEqual(after.rows[0].c, 0);
  });

  it("credit → reserve → release → consume lifecycle + integrity", async () => {
    const credit = await walletService.creditWorkTokens({
      freelancerUserId: freelancer.id,
      amountTokens: 500,
      referenceType: "test_credit",
      referenceId: `credit-${freelancer.id}`,
      eventType: "TOKEN_CREDIT",
    });
    assert.strictEqual(credit.wallet.availableTokens, 500);
    assert.strictEqual(credit.wallet.reservedTokens, 0);

    const reserveA = await walletService.reserveWorkTokens({
      freelancerUserId: freelancer.id,
      amountTokens: 100,
      referenceType: "test_res",
      referenceId: "A",
    });
    assert.strictEqual(reserveA.wallet.availableTokens, 400);
    assert.strictEqual(reserveA.wallet.reservedTokens, 100);

    const reserveB = await walletService.reserveWorkTokens({
      freelancerUserId: freelancer.id,
      amountTokens: 150,
      referenceType: "test_res",
      referenceId: "B",
    });
    assert.strictEqual(reserveB.wallet.availableTokens, 250);
    assert.strictEqual(reserveB.wallet.reservedTokens, 250);

    const releaseA = await walletService.releaseWorkTokenReservation({
      freelancerUserId: freelancer.id,
      referenceType: "test_res",
      referenceId: "A",
    });
    assert.strictEqual(releaseA.wallet.availableTokens, 350);
    assert.strictEqual(releaseA.wallet.reservedTokens, 150);

    const releaseA2 = await walletService.releaseWorkTokenReservation({
      freelancerUserId: freelancer.id,
      referenceType: "test_res",
      referenceId: "A",
    });
    assert.strictEqual(releaseA2.idempotent, true);
    assert.strictEqual(releaseA2.wallet.availableTokens, 350);

    const consumeB = await walletService.consumeWorkTokenReservation({
      freelancerUserId: freelancer.id,
      referenceType: "test_res",
      referenceId: "B",
    });
    assert.strictEqual(consumeB.wallet.availableTokens, 350);
    assert.strictEqual(consumeB.wallet.reservedTokens, 0);
    assert.strictEqual(consumeB.reservation.status, "consumed");

    const consumeB2 = await walletService.consumeWorkTokenReservation({
      freelancerUserId: freelancer.id,
      referenceType: "test_res",
      referenceId: "B",
    });
    assert.strictEqual(consumeB2.idempotent, true);

    const integrity = await walletService.verifyWorkTokenWalletIntegrity(freelancer.id);
    assert.strictEqual(integrity.ok, true);
    assert.strictEqual(integrity.availableTokens, 350);
    assert.strictEqual(integrity.reservedTokens, 0);
  });

  it("reservation increase moves only delta", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 300,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    await walletService.reserveWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 100,
      referenceType: "test_inc",
      referenceId: "bid-1",
      eventType: "PRIORITY_BID_RESERVE",
    });
    const inc = await walletService.increaseWorkTokenReservation({
      freelancerUserId: user.id,
      referenceType: "test_inc",
      referenceId: "bid-1",
      desiredTotal: 180,
      eventType: "PRIORITY_BID_INCREASE_RESERVE",
      idempotencyKey: `inc-${user.id}-to-180`,
    });
    assert.strictEqual(inc.delta, 80);
    assert.strictEqual(inc.wallet.availableTokens, 120);
    assert.strictEqual(inc.wallet.reservedTokens, 180);
    assert.strictEqual(inc.reservation.reservedTokens, 180);
    assert.strictEqual(inc.entry.amountTokens, 80);
  });

  it("insufficient reserve leaves no mutation", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 50,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    await assert.rejects(
      () =>
        walletService.reserveWorkTokens({
          freelancerUserId: user.id,
          amountTokens: 100,
          referenceType: "test_fail",
          referenceId: "x",
        }),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
    );
    const snap = await walletService.getWorkTokenWalletSnapshot(user.id);
    assert.strictEqual(snap.availableTokens, 50);
    assert.strictEqual(snap.reservedTokens, 0);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM work_token_reservations WHERE freelancer_user_id = $1`,
      [user.id],
    );
    assert.strictEqual(rows[0].c, 0);
    const { rows: ledger } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM work_token_ledger_entries
       WHERE freelancer_user_id = $1 AND event_type = 'TOKEN_RESERVE'`,
      [user.id],
    );
    assert.strictEqual(ledger[0].c, 0);
  });

  it("idempotent reserve and conflict on amount mismatch", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 200,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    const r1 = await walletService.reserveWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 80,
      referenceType: "test_idem",
      referenceId: "same",
    });
    const r2 = await walletService.reserveWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 80,
      referenceType: "test_idem",
      referenceId: "same",
    });
    assert.strictEqual(r2.idempotent, true);
    assert.strictEqual(r2.wallet.availableTokens, 120);
    assert.strictEqual(r2.wallet.reservedTokens, 80);
    await assert.rejects(
      () =>
        walletService.reserveWorkTokens({
          freelancerUserId: user.id,
          amountTokens: 90,
          referenceType: "test_idem",
          referenceId: "same",
        }),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.WORK_TOKEN_IDEMPOTENCY_CONFLICT,
    );
    assert.ok(r1.reservation.id);
  });

  it("concurrent reserves: one wins, one insufficient", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 100,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    const results = await Promise.allSettled([
      walletService.reserveWorkTokens({
        freelancerUserId: user.id,
        amountTokens: 80,
        referenceType: "test_race",
        referenceId: "RA",
      }),
      walletService.reserveWorkTokens({
        freelancerUserId: user.id,
        amountTokens: 80,
        referenceType: "test_race",
        referenceId: "RB",
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.strictEqual(fulfilled.length, 1);
    assert.strictEqual(rejected.length, 1);
    assert.strictEqual(
      rejected[0].reason.publicCode,
      WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
    );
    const snap = await walletService.getWorkTokenWalletSnapshot(user.id);
    assert.strictEqual(snap.availableTokens, 20);
    assert.strictEqual(snap.reservedTokens, 80);
    const integrity = await walletService.verifyWorkTokenWalletIntegrity(user.id);
    assert.strictEqual(integrity.ok, true);
  });

  it("concurrent wallet creation yields one row", async () => {
    const user = await seedUser("freelancer");
    const created = await Promise.all([
      walletService.getOrCreateWorkTokenWallet(user.id),
      walletService.getOrCreateWorkTokenWallet(user.id),
      walletService.getOrCreateWorkTokenWallet(user.id),
    ]);
    assert.strictEqual(new Set(created.map((w) => w.id)).size, 1);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM freelancer_work_token_wallets WHERE freelancer_user_id = $1`,
      [user.id],
    );
    assert.strictEqual(rows[0].c, 1);
  });

  it("outer client transaction rolls back all wallet changes", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 200,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await walletService.reserveWorkTokens({
        freelancerUserId: user.id,
        amountTokens: 50,
        referenceType: "test_outer",
        referenceId: "outer-1",
        client,
      });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const snap = await walletService.getWorkTokenWalletSnapshot(user.id);
    assert.strictEqual(snap.availableTokens, 200);
    assert.strictEqual(snap.reservedTokens, 0);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM work_token_reservations
       WHERE reference_type = 'test_outer' AND reference_id = 'outer-1'`,
    );
    assert.strictEqual(rows[0].c, 0);
  });

  it("forced mid-flight failure rolls back own transaction", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 100,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await walletService.reserveWorkTokens({
        freelancerUserId: user.id,
        amountTokens: 40,
        referenceType: "test_failtxn",
        referenceId: "ft-1",
        client,
      });
      // Force failure after reserve joined outer txn
      await client.query("SELECT 1/0");
      await client.query("COMMIT");
    } catch {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    } finally {
      client.release();
    }
    const snap = await walletService.getWorkTokenWalletSnapshot(user.id);
    assert.strictEqual(snap.availableTokens, 100);
    assert.strictEqual(snap.reservedTokens, 0);
  });

  it("HTTP: freelancer own wallet, unauth blocked, cannot use admin routes", async () => {
    const bearer = tokenFor(freelancer);
    const otherBearer = tokenFor(otherFreelancer);
    const adminBearer = tokenFor(superAdmin);

    const unauth = await httpJson(server, "/api/freelancer/work-token-wallet");
    assert.ok(unauth.status === 401 || unauth.status === 403);

    const mine = await httpJson(server, "/api/freelancer/work-token-wallet", {
      bearerToken: bearer,
    });
    assert.strictEqual(mine.status, 200);
    assert.strictEqual(mine.body.success, true);
    assert.strictEqual(mine.body.data.engineAvailable, false);
    assert.strictEqual(typeof mine.body.data.availableTokens, "number");

    // Own transactions endpoint
    const tx = await httpJson(server, "/api/freelancer/work-token-wallet/transactions", {
      bearerToken: bearer,
    });
    assert.strictEqual(tx.status, 200);
    assert.ok(Array.isArray(tx.body.data));

    // Other freelancer gets their own empty/zero wallet — not mine
    const theirs = await httpJson(server, "/api/freelancer/work-token-wallet", {
      bearerToken: otherBearer,
    });
    assert.strictEqual(theirs.status, 200);
    assert.strictEqual(theirs.body.data.availableTokens, 0);

    const adminList = await httpJson(server, "/api/super-admin/work-token-wallets", {
      bearerToken: adminBearer,
    });
    assert.strictEqual(adminList.status, 200);

    const freelAdmin = await httpJson(server, "/api/super-admin/work-token-wallets", {
      bearerToken: bearer,
    });
    assert.ok(freelAdmin.status === 401 || freelAdmin.status === 403);
  });

  it("economy flags remain OFF", async () => {
    const { rows } = await pool.query(
      `SELECT work_tokens_enabled, priority_bidding_enabled, fair_work_distribution_enabled,
              marketplace_commission_enabled, cash_membership_payments_enabled,
              elite_engine_enabled, verification_bonuses_enabled
       FROM marketplace_economy_settings WHERE id = 1`,
    );
    const s = rows[0];
    assert.strictEqual(s.work_tokens_enabled, false);
    assert.strictEqual(s.priority_bidding_enabled, false);
    assert.strictEqual(s.fair_work_distribution_enabled, false);
    assert.strictEqual(s.marketplace_commission_enabled, false);
    assert.strictEqual(s.cash_membership_payments_enabled, false);
    assert.strictEqual(s.elite_engine_enabled, false);
    assert.strictEqual(s.verification_bonuses_enabled, false);
  });

  it("cross-wallet same business reference creates two independent reservations", async () => {
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: a.id,
      amountTokens: 100,
      referenceType: "test_credit",
      referenceId: `c-${a.id}`,
    });
    await walletService.creditWorkTokens({
      freelancerUserId: b.id,
      amountTokens: 100,
      referenceType: "test_credit",
      referenceId: `c-${b.id}`,
    });
    const ra = await walletService.reserveWorkTokens({
      freelancerUserId: a.id,
      amountTokens: 50,
      referenceType: "priority_bid",
      referenceId: "BID123",
      eventType: "PRIORITY_BID_RESERVE",
    });
    const rb = await walletService.reserveWorkTokens({
      freelancerUserId: b.id,
      amountTokens: 50,
      referenceType: "priority_bid",
      referenceId: "BID123",
      eventType: "PRIORITY_BID_RESERVE",
    });
    assert.strictEqual(ra.idempotent, false);
    assert.strictEqual(rb.idempotent, false);
    assert.notStrictEqual(ra.reservation.id, rb.reservation.id);
    assert.strictEqual(ra.wallet.reservedTokens, 50);
    assert.strictEqual(rb.wallet.reservedTokens, 50);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM work_token_reservations
       WHERE reference_type = 'priority_bid' AND reference_id = 'BID123'`,
    );
    assert.strictEqual(rows[0].c, 2);
  });

  it("concurrent cross-wallet same reference both succeed", async () => {
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: a.id,
      amountTokens: 80,
      referenceType: "test_credit",
      referenceId: `c-${a.id}`,
    });
    await walletService.creditWorkTokens({
      freelancerUserId: b.id,
      amountTokens: 80,
      referenceType: "test_credit",
      referenceId: `c-${b.id}`,
    });
    const settled = await Promise.allSettled([
      walletService.reserveWorkTokens({
        freelancerUserId: a.id,
        amountTokens: 40,
        referenceType: "priority_bid",
        referenceId: "CONC_BID",
        eventType: "PRIORITY_BID_RESERVE",
      }),
      walletService.reserveWorkTokens({
        freelancerUserId: b.id,
        amountTokens: 40,
        referenceType: "priority_bid",
        referenceId: "CONC_BID",
        eventType: "PRIORITY_BID_RESERVE",
      }),
    ]);
    assert.strictEqual(settled.filter((s) => s.status === "fulfilled").length, 2);
    const snapA = await walletService.getWorkTokenWalletSnapshot(a.id);
    const snapB = await walletService.getWorkTokenWalletSnapshot(b.id);
    assert.strictEqual(snapA.reservedTokens, 40);
    assert.strictEqual(snapB.reservedTokens, 40);
  });

  it("multiple increases 100→180→220 with explicit idempotency keys", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 500,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    await walletService.reserveWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 100,
      referenceType: "priority_bid",
      referenceId: "MULTI",
      eventType: "PRIORITY_BID_RESERVE",
    });
    const i1 = await walletService.increaseWorkTokenReservation({
      freelancerUserId: user.id,
      referenceType: "priority_bid",
      referenceId: "MULTI",
      desiredTotal: 180,
      eventType: "PRIORITY_BID_INCREASE_RESERVE",
      idempotencyKey: `multi-inc-1-${user.id}`,
    });
    assert.strictEqual(i1.delta, 80);
    assert.strictEqual(i1.wallet.availableTokens, 320);
    assert.strictEqual(i1.wallet.reservedTokens, 180);

    const i2 = await walletService.increaseWorkTokenReservation({
      freelancerUserId: user.id,
      referenceType: "priority_bid",
      referenceId: "MULTI",
      desiredTotal: 220,
      eventType: "PRIORITY_BID_INCREASE_RESERVE",
      idempotencyKey: `multi-inc-2-${user.id}`,
    });
    assert.strictEqual(i2.delta, 40);
    assert.strictEqual(i2.wallet.availableTokens, 280);
    assert.strictEqual(i2.wallet.reservedTokens, 220);

    const retry = await walletService.increaseWorkTokenReservation({
      freelancerUserId: user.id,
      referenceType: "priority_bid",
      referenceId: "MULTI",
      desiredTotal: 220,
      eventType: "PRIORITY_BID_INCREASE_RESERVE",
      idempotencyKey: `multi-inc-2-${user.id}`,
    });
    assert.strictEqual(retry.idempotent, true);
    assert.strictEqual(retry.wallet.availableTokens, 280);
    assert.strictEqual(retry.wallet.reservedTokens, 220);

    const { rows: ledger } = await pool.query(
      `SELECT event_type, amount_tokens
       FROM work_token_ledger_entries
       WHERE freelancer_user_id = $1 AND balance_effect = 'reserve'
       ORDER BY id`,
      [user.id],
    );
    assert.strictEqual(ledger.length, 3);
    assert.strictEqual(Number(ledger[0].amount_tokens), 100);
    assert.strictEqual(Number(ledger[1].amount_tokens), 80);
    assert.strictEqual(Number(ledger[2].amount_tokens), 40);

    const integrity = await walletService.verifyWorkTokenWalletIntegrity(user.id);
    assert.strictEqual(integrity.ok, true);
  });

  it("concurrent increase serializes to desired 220", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 500,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    await walletService.reserveWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 100,
      referenceType: "priority_bid",
      referenceId: "CINC",
      eventType: "PRIORITY_BID_RESERVE",
    });
    await Promise.allSettled([
      walletService.increaseWorkTokenReservation({
        freelancerUserId: user.id,
        referenceType: "priority_bid",
        referenceId: "CINC",
        desiredTotal: 180,
        eventType: "PRIORITY_BID_INCREASE_RESERVE",
        idempotencyKey: `cinc-180-${user.id}`,
      }),
      walletService.increaseWorkTokenReservation({
        freelancerUserId: user.id,
        referenceType: "priority_bid",
        referenceId: "CINC",
        desiredTotal: 220,
        eventType: "PRIORITY_BID_INCREASE_RESERVE",
        idempotencyKey: `cinc-220-${user.id}`,
      }),
    ]);
    const snap = await walletService.getWorkTokenWalletSnapshot(user.id);
    assert.strictEqual(snap.reservedTokens, 220);
    assert.strictEqual(snap.availableTokens, 280);
    const integrity = await walletService.verifyWorkTokenWalletIntegrity(user.id);
    assert.strictEqual(integrity.ok, true);
  });

  it("release vs consume race yields exactly one terminal outcome", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 200,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    await walletService.reserveWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 80,
      referenceType: "race",
      referenceId: "RC1",
    });
    const settled = await Promise.allSettled([
      walletService.releaseWorkTokenReservation({
        freelancerUserId: user.id,
        referenceType: "race",
        referenceId: "RC1",
      }),
      walletService.consumeWorkTokenReservation({
        freelancerUserId: user.id,
        referenceType: "race",
        referenceId: "RC1",
      }),
    ]);
    assert.strictEqual(settled.filter((s) => s.status === "fulfilled").length, 1);
    assert.strictEqual(settled.filter((s) => s.status === "rejected").length, 1);
    const { rows } = await pool.query(
      `SELECT status FROM work_token_reservations
       WHERE freelancer_user_id = $1 AND reference_type = 'race' AND reference_id = 'RC1'`,
      [user.id],
    );
    assert.ok(rows[0].status === "released" || rows[0].status === "consumed");
    const snap = await walletService.getWorkTokenWalletSnapshot(user.id);
    if (rows[0].status === "released") {
      assert.strictEqual(snap.availableTokens, 200);
      assert.strictEqual(snap.reservedTokens, 0);
    } else {
      assert.strictEqual(snap.availableTokens, 120);
      assert.strictEqual(snap.reservedTokens, 0);
    }
    const integrity = await walletService.verifyWorkTokenWalletIntegrity(user.id);
    assert.strictEqual(integrity.ok, true);
  });

  it("cross-wallet cannot release or consume another wallet reservation", async () => {
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: a.id,
      amountTokens: 100,
      referenceType: "test_credit",
      referenceId: `c-${a.id}`,
    });
    await walletService.reserveWorkTokens({
      freelancerUserId: a.id,
      amountTokens: 30,
      referenceType: "priority_bid",
      referenceId: "OWNED_BY_A",
      eventType: "PRIORITY_BID_RESERVE",
    });
    await assert.rejects(
      () =>
        walletService.releaseWorkTokenReservation({
          freelancerUserId: b.id,
          referenceType: "priority_bid",
          referenceId: "OWNED_BY_A",
        }),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_FOUND,
    );
    await assert.rejects(
      () =>
        walletService.consumeWorkTokenReservation({
          freelancerUserId: b.id,
          referenceType: "priority_bid",
          referenceId: "OWNED_BY_A",
        }),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_FOUND,
    );
    const snapA = await walletService.getWorkTokenWalletSnapshot(a.id);
    assert.strictEqual(snapA.reservedTokens, 30);
  });

  it("same-wallet concurrent reserve same reference yields one reservation", async () => {
    const user = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: user.id,
      amountTokens: 200,
      referenceType: "test_credit",
      referenceId: `c-${user.id}`,
    });
    const settled = await Promise.allSettled([
      walletService.reserveWorkTokens({
        freelancerUserId: user.id,
        amountTokens: 50,
        referenceType: "same",
        referenceId: "S1",
      }),
      walletService.reserveWorkTokens({
        freelancerUserId: user.id,
        amountTokens: 50,
        referenceType: "same",
        referenceId: "S1",
      }),
    ]);
    assert.strictEqual(settled.filter((s) => s.status === "fulfilled").length, 2);
    const snap = await walletService.getWorkTokenWalletSnapshot(user.id);
    assert.strictEqual(snap.availableTokens, 150);
    assert.strictEqual(snap.reservedTokens, 50);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM work_token_reservations
       WHERE freelancer_user_id = $1 AND reference_type = 'same' AND reference_id = 'S1'`,
      [user.id],
    );
    assert.strictEqual(rows[0].c, 1);
  });
});
