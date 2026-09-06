/**
 * Phase 5 Normal Application Work Token — isolated DB gate tests.
 * Run via: node scripts/runMarketplaceNormalApplicationPhase5Gate.js
 */

const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE5 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceNormalApplicationPhase5Gate.js");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-normal-app-phase5-gate-secret";
}
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";

const { pool } = require("../src/config/db");
const walletService = require("../src/services/marketplaceWorkTokenWalletService");
const normalApp = require("../src/services/marketplaceNormalApplicationWorkTokenService");
const { WORK_TOKEN_ERROR_CODES } = require("../src/constants/marketplaceWorkTokens");

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `na5_${role}_${suffix}@example.com`;
  const accountId = `N${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'Na', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id, account_id, email, role`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function setWorkTokensEnabled(enabled) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET work_tokens_enabled = $1, updated_at = NOW()
      WHERE id = 1`,
    [Boolean(enabled)],
  );
}

async function setRefundPercentage(pct) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET normal_application_token_refund_percentage = $1, updated_at = NOW()
      WHERE id = 1`,
    [pct],
  );
}

async function setTokensPerOrderJod(rate) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET normal_application_tokens_per_order_jod = $1, updated_at = NOW()
      WHERE id = 1`,
    [rate],
  );
}

async function createBiddingOrder({ creatorId, budgetJod, min = 10, max = 100 }) {
  const code = `NA5-${crypto.randomBytes(4).toString("hex")}`;
  const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const categoryId = cats[0]?.id || null;
  const { rows } = await pool.query(
    `INSERT INTO orders (
       order_code, title, description, category_id, project_type,
       budget, currency_code, bid_budget_min, bid_budget_max,
       created_by_user_id, created_by_role, source_type,
       is_published, is_open_for_pool, payment_required, payment_status, order_status
     ) VALUES (
       $1, 'NA5 Bid Order', 'Phase 5 gate bidding order', $2, 'bidding',
       $3, 'JOD', $4, $5,
       $6, 'super_admin', 'super_admin_created',
       TRUE, TRUE, FALSE, 'not_required', 'open_for_bids'
     ) RETURNING *`,
    [code, categoryId, budgetJod, min, max, creatorId],
  );
  return rows[0];
}

async function insertBid({ orderId, freelancerUserId, amount = 50 }) {
  const { rows } = await pool.query(
    `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (order_id, freelancer_user_id)
     DO UPDATE SET amount = EXCLUDED.amount, status = 'pending', updated_at = NOW()
     RETURNING *`,
    [orderId, freelancerUserId, amount],
  );
  return rows[0];
}

async function withTxn(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function walletAvailable(freelancerUserId) {
  const snap = await walletService.getWorkTokenWalletSnapshot(freelancerUserId);
  return snap.availableTokens;
}

async function economicsCount(orderId, freelancerUserId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM order_freelancer_bid_work_token_economics
     WHERE order_id = $1 AND freelancer_user_id = $2 AND charge_status = 'charged'`,
    [orderId, freelancerUserId],
  );
  return rows[0].c;
}

async function ledgerCount(freelancerUserId, eventType) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM work_token_ledger_entries e
     JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
     WHERE w.freelancer_user_id = $1 AND e.event_type = $2`,
    [freelancerUserId, eventType],
  );
  return rows[0].c;
}

describe("Marketplace Normal Application Phase 5 gate", () => {
  let admin;
  let freelancerA;
  let freelancerB;
  let clientUser;

  before(async () => {
    admin = await seedUser("super_admin");
    freelancerA = await seedUser("freelancer");
    freelancerB = await seedUser("freelancer");
    clientUser = await seedUser("client");
    await setWorkTokensEnabled(false);
    await setRefundPercentage(100);
    await setTokensPerOrderJod(1);
  });

  after(async () => {
    await setWorkTokensEnabled(false);
    await pool.end();
  });

  it("engine OFF: charge skips with no wallet/ledger/economics", async () => {
    await setWorkTokensEnabled(false);
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freelancerA.id });
    const out = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freelancerA.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "engine_off");
    assert.equal(await economicsCount(order.id, freelancerA.id), 0);
    assert.equal(await ledgerCount(freelancerA.id, "NORMAL_APPLICATION_CONSUME"), 0);
    const snap = await walletService.getWorkTokenWalletSnapshot(freelancerA.id);
    assert.equal(snap.exists, false);
  });

  it("fake poolKind skips charge", async () => {
    await setWorkTokensEnabled(true);
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freelancerA.id });
    const out = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freelancerA.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "fake",
      }),
    );
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "not_real_pool_kind");
    assert.equal(await economicsCount(order.id, freelancerA.id), 0);
    await setWorkTokensEnabled(false);
  });

  it("engine ON: CEIL cost, charge once, bid update does not re-charge", async () => {
    await setWorkTokensEnabled(true);
    await setTokensPerOrderJod(1);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 100,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-${freel.id}`,
      idempotencyKey: `seed-credit-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10.1 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id, amount: 40 });

    const first = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(first.charged, true);
    assert.equal(first.economics.tokenCost, 11); // CEIL(10.1)
    assert.equal(first.economics.refundPercentage, 100);
    assert.equal(first.economics.refundRoundingRule, "FULL");
    assert.equal(await walletAvailable(freel.id), 89);
    assert.equal(await economicsCount(order.id, freel.id), 1);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_CONSUME"), 1);

    const second = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(second.skipped, true);
    assert.equal(await walletAvailable(freel.id), 89);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_CONSUME"), 1);
    await setWorkTokensEnabled(false);
  });

  it("source of truth: configured 100 snapshots 100 from economy settings", async () => {
    await setWorkTokensEnabled(true);
    await setRefundPercentage(100);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 50,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-sot100-${freel.id}`,
      idempotencyKey: `seed-sot100-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    const out = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(out.charged, true);
    assert.equal(out.economics.refundPercentage, 100);
    assert.equal(out.economics.refundRoundingRule, "FULL");
    const { rows } = await pool.query(
      `SELECT refund_percentage, refund_rounding_rule
       FROM order_freelancer_bid_work_token_economics
       WHERE order_id = $1 AND freelancer_user_id = $2`,
      [order.id, freel.id],
    );
    assert.equal(Number(rows[0].refund_percentage), 100);
    assert.equal(rows[0].refund_rounding_rule, "FULL");
    await setWorkTokensEnabled(false);
  });

  it("current policy guard: economy settings mergePatch rejects non-100 refund %", () => {
    const {
      mergePatch,
      MARKETPLACE_ECONOMY_DEFAULTS,
    } = require("../src/services/marketplaceEconomySettingsService");
    assert.doesNotThrow(() =>
      mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, { normalApplicationTokenRefundPercentage: 100 }),
    );
    for (const pct of [80, 70]) {
      assert.throws(
        () =>
          mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, {
            normalApplicationTokenRefundPercentage: pct,
          }),
        (err) => err.publicCode === "FUTURE_NON_FULL_REFUND_ROUNDING_POLICY_REQUIRED",
      );
    }
  });

  it("bid update / retry do not refresh original economic snapshot", async () => {
    await setWorkTokensEnabled(true);
    await setRefundPercentage(100);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 50,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-upd-${freel.id}`,
      idempotencyKey: `seed-upd-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id, amount: 40 });
    const first = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(first.economics.refundPercentage, 100);
    // SQL-only mutation (API/validation blocks non-100) — proves snapshot stays immutable.
    await setRefundPercentage(80);
    await insertBid({ orderId: order.id, freelancerUserId: freel.id, amount: 55 });
    const updateCharge = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(updateCharge.skipped, true);
    assert.equal(updateCharge.reason, "already_charged");
    assert.equal(updateCharge.economics.refundPercentage, 100);
    const retryCharge = await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(retryCharge.skipped, true);
    assert.equal(retryCharge.economics.refundPercentage, 100);
    const { rows } = await pool.query(
      `SELECT refund_percentage, refund_rounding_rule, token_cost
       FROM order_freelancer_bid_work_token_economics
       WHERE order_id = $1 AND freelancer_user_id = $2`,
      [order.id, freel.id],
    );
    assert.equal(Number(rows[0].refund_percentage), 100);
    assert.equal(rows[0].refund_rounding_rule, "FULL");
    assert.equal(Number(rows[0].token_cost), 10);
    assert.equal(await economicsCount(order.id, freel.id), 1);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_CONSUME"), 1);
    await setRefundPercentage(100);
    await setWorkTokensEnabled(false);
  });

  it("insufficient tokens: no economics row / no partial ledger", async () => {
    await setWorkTokensEnabled(true);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 2,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-low-${freel.id}`,
      idempotencyKey: `seed-low-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    await assert.rejects(
      () =>
        withTxn((client) =>
          normalApp.chargeNormalApplicationOnFirstBid({
            client,
            freelancerUserId: freel.id,
            orderId: order.id,
            bidId: bid.id,
            orderRow: order,
            poolKind: "real",
          }),
        ),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
    );
    assert.equal(await economicsCount(order.id, freel.id), 0);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_CONSUME"), 0);
    assert.equal(await walletAvailable(freel.id), 2);
    await setWorkTokensEnabled(false);
  });

  it("missing budget fail-closed when engine ON", async () => {
    await setWorkTokensEnabled(true);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 50,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-nb-${freel.id}`,
      idempotencyKey: `seed-nb-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    await assert.rejects(
      () =>
        withTxn((client) =>
          normalApp.chargeNormalApplicationOnFirstBid({
            client,
            freelancerUserId: freel.id,
            orderId: order.id,
            bidId: bid.id,
            orderRow: { ...order, budget: null },
            poolKind: "real",
          }),
        ),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
    );
    await setWorkTokensEnabled(false);
  });

  it("two freelancers charge independently", async () => {
    await setWorkTokensEnabled(true);
    for (const freel of [freelancerA, freelancerB]) {
      // eslint-disable-next-line no-await-in-loop
      await walletService.creditWorkTokens({
        freelancerUserId: freel.id,
        amountTokens: 50,
        eventType: "TOKEN_CREDIT",
        referenceType: "test",
        referenceId: `seed-ind-${freel.id}-${Date.now()}`,
        idempotencyKey: `seed-ind-${freel.id}-${crypto.randomBytes(3).toString("hex")}`,
      });
    }
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bidA = await insertBid({ orderId: order.id, freelancerUserId: freelancerA.id, amount: 20 });
    const bidB = await insertBid({ orderId: order.id, freelancerUserId: freelancerB.id, amount: 30 });
    await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freelancerA.id,
        orderId: order.id,
        bidId: bidA.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freelancerB.id,
        orderId: order.id,
        bidId: bidB.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    assert.equal(await economicsCount(order.id, freelancerA.id), 1);
    assert.equal(await economicsCount(order.id, freelancerB.id), 1);
    await setWorkTokensEnabled(false);
  });

  it("order ended without selection: 100% refund once; retry/race safe", async () => {
    await setWorkTokensEnabled(true);
    await setRefundPercentage(100);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 100,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-rf-${freel.id}`,
      idempotencyKey: `seed-rf-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: clientUser.id, budgetJod: 11 });
    // Make client the owner for cancel path
    await pool.query(
      `UPDATE orders SET created_by_user_id = $2, source_type = 'client_created', created_by_role = 'client' WHERE id = $1`,
      [order.id, clientUser.id],
    );
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: { ...order, budget: 11 },
        poolKind: "real",
      }),
    );
    assert.equal(await walletAvailable(freel.id), 89); // CEIL(11)=11 → 100-11

    const end1 = await normalApp.endOpenBiddingOrderWithoutSelection({
      orderId: order.id,
      actorUserId: clientUser.id,
      actorRole: "client",
      reason: "client_cancelled_before_selection",
    });
    assert.equal(end1.cancelled, true);
    // Active cancel path refunds Bid Credits only; legacy WT economics refund via dedicated API.
    const wtRefund = await normalApp.refundChargedApplicationsForOrderEndedWithoutSelection({
      orderId: order.id,
      actorUserId: clientUser.id,
      reason: "client_cancelled_before_selection",
    });
    assert.equal(wtRefund.refundedCount, 1);
    // 100% of 11 = 11 → back to 100
    assert.equal(await walletAvailable(freel.id), 100);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_REFUND"), 1);
    const { rows: econ } = await pool.query(
      `SELECT token_cost, refund_tokens, refund_percentage
       FROM order_freelancer_bid_work_token_economics
       WHERE order_id = $1 AND freelancer_user_id = $2`,
      [order.id, freel.id],
    );
    assert.equal(Number(econ[0].refund_percentage), 100);
    assert.equal(Number(econ[0].refund_tokens), Number(econ[0].token_cost));

    const end2 = await normalApp.refundChargedApplicationsForOrderEndedWithoutSelection({
      orderId: order.id,
      actorUserId: clientUser.id,
    });
    assert.equal(end2.refundedCount, 0);
    assert.equal(await walletAvailable(freel.id), 100);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_REFUND"), 1);
    await setWorkTokensEnabled(false);
  });

  it("historical snapshot: refund stays 100% even if settings later change", async () => {
    await setWorkTokensEnabled(true);
    await setRefundPercentage(100);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 100,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-hist-${freel.id}`,
      idempotencyKey: `seed-hist-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    await setRefundPercentage(50);
    await normalApp.endOpenBiddingOrderWithoutSelection({
      orderId: order.id,
      actorUserId: admin.id,
      actorRole: "admin",
      reason: "admin_cancelled_before_selection",
    });
    await normalApp.refundChargedApplicationsForOrderEndedWithoutSelection({
      orderId: order.id,
      actorUserId: admin.id,
      reason: "admin_cancelled_before_selection",
    });
    // Snapshot was 100% of 10 = 10, not 50%
    assert.equal(await walletAvailable(freel.id), 100);
    const { rows } = await pool.query(
      `SELECT refund_percentage, refund_tokens, refund_rounding_rule
       FROM order_freelancer_bid_work_token_economics
       WHERE order_id = $1 AND freelancer_user_id = $2`,
      [order.id, freel.id],
    );
    assert.equal(Number(rows[0].refund_percentage), 100);
    assert.equal(Number(rows[0].refund_tokens), 10);
    assert.equal(rows[0].refund_rounding_rule, "FULL");
    await setRefundPercentage(100);
    await setWorkTokensEnabled(false);
  });

  it("winner / selection present: no normal-application refund", async () => {
    await setWorkTokensEnabled(true);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 50,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-win-${freel.id}`,
      idempotencyKey: `seed-win-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    await withTxn((client) =>
      normalApp.chargeNormalApplicationOnFirstBid({
        client,
        freelancerUserId: freel.id,
        orderId: order.id,
        bidId: bid.id,
        orderRow: order,
        poolKind: "real",
      }),
    );
    await pool.query(
      `UPDATE orders SET assigned_freelancer_id = $2, selected_bid_id = $3, is_open_for_pool = FALSE, order_status = 'in_progress' WHERE id = $1`,
      [order.id, freel.id, bid.id],
    );
    await pool.query(`UPDATE order_freelancer_bids SET status = 'accepted' WHERE id = $1`, [bid.id]);
    await assert.rejects(
      () =>
        normalApp.endOpenBiddingOrderWithoutSelection({
          orderId: order.id,
          actorUserId: admin.id,
          actorRole: "admin",
        }),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_REFUND_NOT_ELIGIBLE,
    );
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_REFUND"), 0);
    await setWorkTokensEnabled(false);
  });

  it("concurrent first charges: one economics row and one consume", async () => {
    await setWorkTokensEnabled(true);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 100,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-cc-${freel.id}`,
      idempotencyKey: `seed-cc-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    const results = await Promise.allSettled([
      withTxn((client) =>
        normalApp.chargeNormalApplicationOnFirstBid({
          client,
          freelancerUserId: freel.id,
          orderId: order.id,
          bidId: bid.id,
          orderRow: order,
          poolKind: "real",
        }),
      ),
      withTxn((client) =>
        normalApp.chargeNormalApplicationOnFirstBid({
          client,
          freelancerUserId: freel.id,
          orderId: order.id,
          bidId: bid.id,
          orderRow: order,
          poolKind: "real",
        }),
      ),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.ok(ok.length >= 1);
    assert.equal(await economicsCount(order.id, freel.id), 1);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_CONSUME"), 1);
    assert.equal(await walletAvailable(freel.id), 90);
    await setWorkTokensEnabled(false);
  });

  it("atomic rollback: forced failure after consume leaves no durable charge", async () => {
    await setWorkTokensEnabled(true);
    const freel = await seedUser("freelancer");
    await walletService.creditWorkTokens({
      freelancerUserId: freel.id,
      amountTokens: 50,
      eventType: "TOKEN_CREDIT",
      referenceType: "test",
      referenceId: `seed-rb-${freel.id}`,
      idempotencyKey: `seed-rb-${freel.id}`,
    });
    const order = await createBiddingOrder({ creatorId: admin.id, budgetJod: 10 });
    const bid = await insertBid({ orderId: order.id, freelancerUserId: freel.id });
    await assert.rejects(() =>
      withTxn(async (client) => {
        await normalApp.chargeNormalApplicationOnFirstBid({
          client,
          freelancerUserId: freel.id,
          orderId: order.id,
          bidId: bid.id,
          orderRow: order,
          poolKind: "real",
        });
        throw new Error("forced_failure_after_charge");
      }),
    );
    assert.equal(await economicsCount(order.id, freel.id), 0);
    assert.equal(await ledgerCount(freel.id, "NORMAL_APPLICATION_CONSUME"), 0);
    assert.equal(await walletAvailable(freel.id), 50);
    await setWorkTokensEnabled(false);
  });
});
