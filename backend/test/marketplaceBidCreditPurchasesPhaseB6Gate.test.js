/**
 * Phase B6 Bid package purchase reversal — isolated DB gate tests.
 * Run via: npm run test:marketplace-bid-credit-purchases-phase-b6-gate
 */
const crypto = require("node:crypto");
const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) throw new Error(`B6 GATE REFUSED PRODUCTION: ${info.maskedTarget}`);
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceBidCreditPurchasesPhaseB6Gate.js");
  }
}
refuseProductionDatabase();

process.env.JWT_SECRET = process.env.JWT_SECRET || "marketplace-bid-pkg-b6-gate-secret";

const { pool } = require("../src/config/db");
const accounting = require("../src/services/marketplaceBidCreditAccountingService");
const reversals = require("../src/services/marketplaceBidCreditPurchaseReversalsService");
const { clearMarketplaceBidCreditsSchemaCache } = require("../src/utils/marketplaceBidCreditsSchema");
const {
  BID_PACKAGE_FULL_REFUND,
  BID_PACKAGE_CROSS_SOURCE_CLAWBACK,
  PARTIAL_BID_PACKAGE_REFUND_POLICY,
  ACTIVE_DISPUTE_ACCOUNT_SUSPENSION,
  DISPUTE_FREEZE_EXTENDS_BID_EXPIRY,
} = require("../src/constants/marketplaceBidCreditPurchases");

accounting.clearGrantReversalColumnsCache();
clearMarketplaceBidCreditsSchemaCache();

async function seedUser(role = "freelancer") {
  const suffix = crypto.randomBytes(5).toString("hex");
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, phone, whatsapp, is_active
     ) VALUES ($1,$2,'x',$3,$4,$4,TRUE) RETURNING id`,
    [
      `B${suffix}`.slice(0, 10).toUpperCase(),
      `b6_${suffix}@example.com`,
      role,
      `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
    ],
  );
  return rows[0];
}

async function seedPackage() {
  const code = `pkg_${crypto.randomBytes(3).toString("hex")}`;
  const { rows } = await pool.query(
    `INSERT INTO marketplace_bid_credit_packages
       (code, name_ar, bid_quantity, price_jod, validity_days)
     VALUES ($1,'باقة',50,5.000,60)
     RETURNING *`,
    [code],
  );
  return rows[0];
}

async function createGrant({
  freelancerUserId,
  sourceType,
  amount,
  consumed = 0,
  expiresInDays = 60,
  now = new Date(),
}) {
  const expires = new Date(now.getTime() + expiresInDays * 86400000);
  const key = `grant:${sourceType}:${freelancerUserId}:${crypto.randomBytes(6).toString("hex")}`;
  const { rows } = await pool.query(
    `INSERT INTO marketplace_bid_credit_grants (
       freelancer_user_id, source_type, amount_granted, amount_consumed,
       status, granted_at, expires_at, idempotency_key
     ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7)
     RETURNING *`,
    [freelancerUserId, sourceType, amount, consumed, now.toISOString(), expires.toISOString(), key],
  );
  return rows[0];
}

async function createFulfilledPurchase({
  freelancerUserId,
  packageRow,
  grantId,
  expectedMinor = 5000,
  now = new Date(),
}) {
  const key = `purchase:${freelancerUserId}:${crypto.randomBytes(6).toString("hex")}`;
  const { rows } = await pool.query(
    `INSERT INTO marketplace_bid_credit_purchases (
       freelancer_user_id, package_id, package_code_snapshot,
       bid_quantity_snapshot, price_jod_snapshot, currency, validity_days_snapshot,
       expected_amount_minor, status, stripe_payment_intent_id,
       fulfilled_grant_id, idempotency_key, grant_idempotency_key,
       paid_at, fulfilled_at
     ) VALUES (
       $1,$2,$3, $4,$5,'JOD',$6, $7,'fulfilled',$8, $9,$10,$11, $12,$12
     ) RETURNING *`,
    [
      freelancerUserId,
      packageRow.id,
      packageRow.code,
      Number(packageRow.bid_quantity),
      packageRow.price_jod,
      packageRow.validity_days,
      expectedMinor,
      `pi_${crypto.randomBytes(8).toString("hex")}`,
      grantId,
      key,
      `bid_pkg_purchase_grant:purchase:tmp:${crypto.randomBytes(4).toString("hex")}`,
      now.toISOString(),
    ],
  );
  // Align grant idempotency key with purchase id
  await pool.query(
    `UPDATE marketplace_bid_credit_purchases
        SET grant_idempotency_key = $2
      WHERE id = $1`,
    [rows[0].id, `bid_pkg_purchase_grant:purchase:${rows[0].id}`],
  );
  return (await pool.query(`SELECT * FROM marketplace_bid_credit_purchases WHERE id=$1`, [rows[0].id]))
    .rows[0];
}

async function available(userId, now = new Date()) {
  const client = await pool.connect();
  try {
    return accounting.sumAvailableBidCredits({ client, freelancerUserId: userId, now });
  } finally {
    client.release();
  }
}

async function withTxn(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

describe("Phase B6 policy constants", () => {
  it("locks owner-approved reversal policy", () => {
    assert.strictEqual(BID_PACKAGE_FULL_REFUND, "REVOKE_UNUSED_PURCHASE_BIDS_ONLY");
    assert.strictEqual(BID_PACKAGE_CROSS_SOURCE_CLAWBACK, "NONE");
    assert.strictEqual(PARTIAL_BID_PACKAGE_REFUND_POLICY, "MANUAL_REVIEW");
    assert.strictEqual(ACTIVE_DISPUTE_ACCOUNT_SUSPENSION, "NONE");
    assert.strictEqual(DISPUTE_FREEZE_EXTENDS_BID_EXPIRY, "NO");
  });
});

describe("Phase B6 full refund DB gate", () => {
  let user;
  let pkg;
  let membershipGrant;
  let adminGrant;
  let refundGrant;
  let otherPurchaseGrant;

  before(async () => {
    accounting.clearGrantReversalColumnsCache();
    clearMarketplaceBidCreditsSchemaCache();
    user = await seedUser();
    pkg = await seedPackage();
    membershipGrant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "membership_daily_unlock",
      amount: 20,
    });
    adminGrant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "admin_manual",
      amount: 15,
    });
    refundGrant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "normal_application_refund",
      amount: 3,
    });
    otherPurchaseGrant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 40,
    });
    const otherPkg = await seedPackage();
    await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: otherPkg,
      grantId: otherPurchaseGrant.id,
    });
  });

  it("1: full refund before spending → all purchase Bids revoked", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 50,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    const before = await available(user.id);
    const out = await withTxn((client) =>
      reversals.applyFullBidPackageRefund({ client, purchaseId: purchase.id, refundAmountMinor: 5000 }),
    );
    assert.strictEqual(out.revoked, 50);
    assert.strictEqual(out.consumedBefore, 0);
    assert.strictEqual(out.purchase.paymentReversalStatus, "refunded_full");
    const after = await available(user.id);
    assert.strictEqual(after, before - 50);
    const g = (
      await pool.query(`SELECT * FROM marketplace_bid_credit_grants WHERE id=$1`, [grant.id])
    ).rows[0];
    assert.strictEqual(g.status, "revoked");
    assert.strictEqual(Number(g.amount_revoked), 50);
  });

  it("2: full refund after partial spending → remaining only revoked", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 50,
      consumed: 20,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    const out = await withTxn((client) =>
      reversals.applyFullBidPackageRefund({ client, purchaseId: purchase.id }),
    );
    assert.strictEqual(out.revoked, 30);
    assert.strictEqual(out.consumedBefore, 20);
    const g = (
      await pool.query(`SELECT * FROM marketplace_bid_credit_grants WHERE id=$1`, [grant.id])
    ).rows[0];
    assert.strictEqual(Number(g.amount_consumed), 20);
    assert.strictEqual(Number(g.amount_revoked), 30);
  });

  it("3: full refund after all spent → zero revocation, audit only", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 10,
      consumed: 10,
    });
    // exhausted status for realism
    await pool.query(`UPDATE marketplace_bid_credit_grants SET status='exhausted' WHERE id=$1`, [
      grant.id,
    ]);
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    const out = await withTxn((client) =>
      reversals.applyFullBidPackageRefund({ client, purchaseId: purchase.id }),
    );
    assert.strictEqual(out.revoked, 0);
    assert.strictEqual(out.consumedBefore, 10);
    assert.strictEqual(out.purchase.paymentReversalStatus, "refunded_full");
  });

  it("4–7: unrelated membership/admin/refund/other package unchanged", async () => {
    for (const g of [membershipGrant, adminGrant, refundGrant, otherPurchaseGrant]) {
      const row = (
        await pool.query(`SELECT * FROM marketplace_bid_credit_grants WHERE id=$1`, [g.id])
      ).rows[0];
      assert.strictEqual(row.status, "active");
      assert.strictEqual(Number(row.amount_revoked), 0);
      assert.strictEqual(Number(row.amount_consumed), 0);
    }
  });

  it("8–9: duplicate refund idempotent (sequential)", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 12,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    const first = await withTxn((client) =>
      reversals.applyFullBidPackageRefund({ client, purchaseId: purchase.id }),
    );
    const second = await withTxn((client) =>
      reversals.applyFullBidPackageRefund({ client, purchaseId: purchase.id }),
    );
    assert.strictEqual(first.revoked, 12);
    assert.ok(second.status === "already_applied" || second.revoked === 0 || second.revoked === 12);
    const ledger = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries
        WHERE event_type='BID_PACKAGE_PURCHASE_REVOKE'
          AND reference_id=$1`,
      [String(purchase.id)],
    );
    assert.strictEqual(ledger.rows[0].c, 1);
  });

  it("10: refund does not create negative balance", async () => {
    const bal = await available(user.id);
    assert.ok(bal >= 0);
  });
});

describe("Phase B6 dispute DB gate", () => {
  let user;
  let pkg;

  before(async () => {
    accounting.clearGrantReversalColumnsCache();
    clearMarketplaceBidCreditsSchemaCache();
    user = await seedUser();
    pkg = await seedPackage();
  });

  it("1–4: dispute open freezes purchase remainder; other grants spendable", async () => {
    const other = await createGrant({
      freelancerUserId: user.id,
      sourceType: "membership_daily_unlock",
      amount: 8,
    });
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 50,
      consumed: 5,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    const before = await available(user.id);
    const out = await withTxn((client) =>
      reversals.applyBidPackageDisputeOpened({
        client,
        purchaseId: purchase.id,
        disputeId: "dp_test_1",
      }),
    );
    assert.strictEqual(out.accountSuspended, false);
    assert.ok(out.frozen);
    const after = await available(user.id);
    assert.strictEqual(after, before - 45);
    const g = (
      await pool.query(`SELECT status FROM marketplace_bid_credit_grants WHERE id=$1`, [grant.id])
    ).rows[0];
    assert.strictEqual(g.status, "frozen");
    const o = (
      await pool.query(`SELECT status FROM marketplace_bid_credit_grants WHERE id=$1`, [other.id])
    ).rows[0];
    assert.strictEqual(o.status, "active");
    // FEFO cannot consume frozen grant
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await accounting.consumeBidCreditsFefo({
        client,
        freelancerUserId: user.id,
        amount: 1,
        idempotencyKey: `fefo_test_${crypto.randomBytes(4).toString("hex")}`,
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const g2 = (
      await pool.query(`SELECT amount_consumed, status FROM marketplace_bid_credit_grants WHERE id=$1`, [
        grant.id,
      ])
    ).rows[0];
    assert.strictEqual(Number(g2.amount_consumed), 5);
    assert.strictEqual(g2.status, "frozen");
  });

  it("5: dispute won before expiry → unfreeze same grant", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 20,
      expiresInDays: 30,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    await withTxn((client) =>
      reversals.applyBidPackageDisputeOpened({ client, purchaseId: purchase.id }),
    );
    const won = await withTxn((client) =>
      reversals.applyBidPackageDisputeWon({ client, purchaseId: purchase.id }),
    );
    assert.strictEqual(won.unfrozen, true);
    const g = (
      await pool.query(`SELECT status FROM marketplace_bid_credit_grants WHERE id=$1`, [grant.id])
    ).rows[0];
    assert.strictEqual(g.status, "active");
  });

  it("6: dispute won after expiry → no resurrection", async () => {
    const past = new Date(Date.now() - 10 * 86400000);
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 11,
      expiresInDays: 1,
      now: past,
    });
    // Force expires_at in the past relative to "now"
    await pool.query(
      `UPDATE marketplace_bid_credit_grants SET expires_at = NOW() - INTERVAL '1 day' WHERE id=$1`,
      [grant.id],
    );
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    await withTxn((client) =>
      reversals.applyBidPackageDisputeOpened({ client, purchaseId: purchase.id }),
    );
    const won = await withTxn((client) =>
      reversals.applyBidPackageDisputeWon({
        client,
        purchaseId: purchase.id,
        now: new Date(),
      }),
    );
    assert.strictEqual(won.unfrozen, false);
    assert.ok(
      won.reason === "expired_during_freeze" || won.grant?.status === "expired",
    );
    const g = (
      await pool.query(`SELECT status FROM marketplace_bid_credit_grants WHERE id=$1`, [grant.id])
    ).rows[0];
    assert.notStrictEqual(g.status, "active");
  });

  it("7–8: dispute lost revokes remainder; consumed untouched", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 30,
      consumed: 7,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    await withTxn((client) =>
      reversals.applyBidPackageDisputeOpened({ client, purchaseId: purchase.id }),
    );
    const lost = await withTxn((client) =>
      reversals.applyBidPackageDisputeLost({ client, purchaseId: purchase.id }),
    );
    assert.strictEqual(lost.revoked, 23);
    assert.strictEqual(lost.consumedBefore, 7);
    const g = (
      await pool.query(`SELECT * FROM marketplace_bid_credit_grants WHERE id=$1`, [grant.id])
    ).rows[0];
    assert.strictEqual(Number(g.amount_consumed), 7);
    assert.strictEqual(g.status, "revoked");
  });

  it("9–10: duplicate dispute + stale open after lost ignored", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 9,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    await withTxn((client) =>
      reversals.applyBidPackageDisputeOpened({ client, purchaseId: purchase.id }),
    );
    await withTxn((client) =>
      reversals.applyBidPackageDisputeLost({ client, purchaseId: purchase.id }),
    );
    const stale = await withTxn((client) =>
      reversals.applyBidPackageDisputeOpened({ client, purchaseId: purchase.id }),
    );
    assert.strictEqual(stale.status, "ignored");
    assert.strictEqual(stale.reason, "terminal_reversal");
  });
});

describe("Phase B6 partial refund + Admin resolve", () => {
  let user;
  let pkg;
  let admin;

  before(async () => {
    accounting.clearGrantReversalColumnsCache();
    clearMarketplaceBidCreditsSchemaCache();
    user = await seedUser();
    admin = await seedUser("super_admin");
    pkg = await seedPackage();
  });

  it("partial refund freezes + manual_review; no proportional revoke", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 50,
      consumed: 10,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
      expectedMinor: 5000,
    });
    const out = await withTxn((client) =>
      reversals.applyPartialBidPackageRefund({
        client,
        purchaseId: purchase.id,
        refundAmountMinor: 1000,
      }),
    );
    assert.strictEqual(out.purchase.paymentReversalStatus, "refunded_partial_manual_review");
    assert.strictEqual(out.purchase.manualReviewRequired, true);
    const g = (
      await pool.query(`SELECT status, amount_revoked FROM marketplace_bid_credit_grants WHERE id=$1`, [
        grant.id,
      ])
    ).rows[0];
    assert.strictEqual(g.status, "frozen");
    assert.strictEqual(Number(g.amount_revoked), 0);

    const released = await reversals.resolveBidPackagePartialRefundManualReview({
      purchaseId: purchase.id,
      resolution: "release_remaining",
      actorUserId: admin.id,
      note: "owner approved release",
    });
    assert.strictEqual(released.purchase.paymentReversalStatus, "manual_resolved_released");
    assert.strictEqual(released.purchase.manualReviewRequired, false);
    const g2 = (
      await pool.query(`SELECT status FROM marketplace_bid_credit_grants WHERE id=$1`, [grant.id])
    ).rows[0];
    assert.strictEqual(g2.status, "active");
  });

  it("Admin revoke_remaining resolves partial review", async () => {
    const grant = await createGrant({
      freelancerUserId: user.id,
      sourceType: "package_purchase",
      amount: 25,
    });
    const purchase = await createFulfilledPurchase({
      freelancerUserId: user.id,
      packageRow: pkg,
      grantId: grant.id,
    });
    await withTxn((client) =>
      reversals.applyPartialBidPackageRefund({
        client,
        purchaseId: purchase.id,
        refundAmountMinor: 500,
      }),
    );
    const out = await reversals.resolveBidPackagePartialRefundManualReview({
      purchaseId: purchase.id,
      resolution: "revoke_remaining",
      actorUserId: admin.id,
    });
    assert.strictEqual(out.purchase.paymentReversalStatus, "manual_resolved_revoked");
    assert.strictEqual(Number(out.outcome.revoke.revoked), 25);
  });
});
