/**
 * Phase D1 / Migration 152 — isolated DB-backed gate tests.
 * Run via: npm run test:marketplace-bid-distribution-pool-phase-d1-gate
 */
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) throw new Error(`D1 GATE REFUSED PRODUCTION: ${info.maskedTarget}`);
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceBidDistributionPoolPhaseD1Gate.js");
  }
}
refuseProductionDatabase();

process.env.JWT_SECRET = process.env.JWT_SECRET || "marketplace-bid-pool-d1-gate-secret";

const { pool } = require("../src/config/db");
const accounting = require("../src/services/marketplaceBidCreditAccountingService");
const poolService = require("../src/services/marketplaceBidDistributionPoolService");
const { clearMarketplaceBidCreditsSchemaCache } = require("../src/utils/marketplaceBidCreditsSchema");
const {
  clearMarketplaceBidDistributionPoolsSchemaCache,
} = require("../src/utils/marketplaceBidDistributionPoolsSchema");
const { calculateUnusedBidsToReturn } = require("../src/utils/marketplaceBidPoolMoney");

async function seedUser(role = "freelancer", active = true) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1,$2,'x',$3,'D1','T','User',$4,$4,'ذكر','JO',$5,TRUE,TRUE)
     RETURNING id`,
    [
      `D${suffix}`.slice(0, 10).toUpperCase(),
      `d1_${role}_${suffix}@example.com`,
      role,
      `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      active,
    ],
  );
  return Number(rows[0].id);
}

describe("Phase D1 Migration 152 DB gate", () => {
  let adminId;
  let fl1;
  let fl2;

  before(async () => {
    clearMarketplaceBidCreditsSchemaCache();
    clearMarketplaceBidDistributionPoolsSchemaCache();
    accounting.clearGrantReversalColumnsCache();
    adminId = await seedUser("super_admin");
    fl1 = await seedUser("freelancer");
    fl2 = await seedUser("freelancer");
  });

  after(async () => {
    await pool.end().catch(() => {});
  });

  it("calculation + unused formula", () => {
    assert.strictEqual(
      calculateUnusedBidsToReturn({
        allocatedBids: 50,
        amountConsumed: 20,
        amountRevoked: 0,
        returnedBids: 0,
      }),
      30,
    );
    assert.strictEqual(
      calculateUnusedBidsToReturn({
        allocatedBids: 50,
        amountConsumed: 20,
        amountRevoked: 5,
        returnedBids: 0,
      }),
      25,
    );
  });

  it("create pool server-calculates totals; allocate decreases available", async () => {
    const created = await poolService.createBidDistributionPool({
      name: "Gate Pool A",
      budgetJod: "1000",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    assert.strictEqual(created.pool.totalBids, 10000);
    assert.strictEqual(created.pool.availableBids, 10000);
    assert.strictEqual(created.calculation.totalSource, "SERVER_CALCULATION");

    const out = await poolService.allocateBidDistributionBatch({
      poolId: created.pool.id,
      distributionMode: "manual",
      bidsPerFreelancer: 50,
      freelancerUserIds: [fl1, fl2],
      expirationMode: "days",
      expirationValue: 7,
      actorUserId: adminId,
      idempotencyKey: `gate_alloc_${created.pool.id}_${Date.now()}`,
    });
    assert.strictEqual(out.batch.totalAllocated, 100);
    assert.strictEqual(out.pool.availableBids, 9900);
    assert.strictEqual(out.allocations.length, 2);
    assert.strictEqual(out.allocations[0].allocatedBids, 50);
    const grant = (
      await pool.query(`SELECT source_type FROM marketplace_bid_credit_grants WHERE id=$1`, [
        out.allocations[0].bidCreditGrantId,
      ])
    ).rows[0];
    assert.strictEqual(grant.source_type, "admin_distribution_pool");
  });

  it("insufficient pool rejects whole batch", async () => {
    const created = await poolService.createBidDistributionPool({
      name: "Tiny Pool",
      budgetJod: "1",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    assert.strictEqual(created.pool.totalBids, 10);
    await assert.rejects(
      () =>
        poolService.allocateBidDistributionBatch({
          poolId: created.pool.id,
          distributionMode: "manual",
          bidsPerFreelancer: 6,
          freelancerUserIds: [fl1, fl2],
          expirationMode: "days",
          expirationValue: 3,
          actorUserId: adminId,
          idempotencyKey: `gate_insuff_${Date.now()}`,
        }),
      (err) => err.publicCode === "POOL_INSUFFICIENT_BIDS" || /Insufficient pool/i.test(err.message),
    );
    const p = await poolService.getBidDistributionPoolById(created.pool.id);
    assert.strictEqual(p.availableBids, 10);
  });

  it("invalid / non-Freelancer recipient rejected", async () => {
    const clientId = await seedUser("client");
    const inactive = await seedUser("freelancer", false);
    const created = await poolService.createBidDistributionPool({
      name: "Elig Pool",
      budgetJod: "10",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    await assert.rejects(() =>
      poolService.allocateBidDistributionBatch({
        poolId: created.pool.id,
        distributionMode: "manual",
        bidsPerFreelancer: 1,
        freelancerUserIds: [clientId],
        expirationMode: "days",
        expirationValue: 1,
        actorUserId: adminId,
        idempotencyKey: `gate_client_${Date.now()}`,
      }),
    );
    await assert.rejects(() =>
      poolService.allocateBidDistributionBatch({
        poolId: created.pool.id,
        distributionMode: "manual",
        bidsPerFreelancer: 1,
        freelancerUserIds: [inactive],
        expirationMode: "days",
        expirationValue: 1,
        actorUserId: adminId,
        idempotencyKey: `gate_inactive_${Date.now()}`,
      }),
    );
  });

  it("FEFO consume from pool grant; partial consume + expiry return; invariant", async () => {
    const fl = await seedUser("freelancer");
    const created = await poolService.createBidDistributionPool({
      name: "FEFO Pool",
      budgetJod: "100",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    // total=1000
    const alloc = await poolService.allocateBidDistributionBatch({
      poolId: created.pool.id,
      distributionMode: "manual",
      bidsPerFreelancer: 100,
      freelancerUserIds: [fl],
      expirationMode: "days",
      expirationValue: 1,
      actorUserId: adminId,
      idempotencyKey: `gate_fefo_${Date.now()}`,
      now: new Date("2026-08-01T00:00:00.000Z"),
    });
    assert.strictEqual(alloc.pool.availableBids, 900);

    await accounting.consumeBidCreditsFefo({
      freelancerUserId: fl,
      amount: 30,
      idempotencyKey: `gate_consume_${Date.now()}`,
      now: new Date("2026-08-01T12:00:00.000Z"),
    });

    const afterConsume = await poolService.getPoolAccountingSnapshot(created.pool.id);
    assert.strictEqual(afterConsume.permanentlyConsumed, 30);
    assert.strictEqual(afterConsume.currentlyAllocatedUnused, 70);
    assert.strictEqual(afterConsume.available, 900);
    assert.strictEqual(afterConsume.total, 1000);
    assert.equal(afterConsume.invariantOk, true);

    // Expire + return
    const expireNow = new Date("2026-08-03T00:00:00.000Z");
    await accounting.expireDueBidCreditGrants({ freelancerUserId: fl, now: expireNow });
    const ret = await poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow });
    assert.ok(ret.returnedTotal >= 70);

    const snap = await poolService.getPoolAccountingSnapshot(created.pool.id);
    assert.strictEqual(snap.available, 970);
    assert.strictEqual(snap.permanentlyConsumed, 30);
    assert.strictEqual(snap.currentlyAllocatedUnused, 0);
    assert.strictEqual(snap.total, 1000);
    assert.equal(snap.invariantOk, true);

    const grant = (
      await pool.query(
        `SELECT amount_consumed, amount_expired, status FROM marketplace_bid_credit_grants WHERE id=$1`,
        [alloc.allocations[0].bidCreditGrantId],
      )
    ).rows[0];
    assert.strictEqual(Number(grant.amount_consumed), 30);
    assert.strictEqual(Number(grant.amount_expired), 70);
    assert.strictEqual(grant.status, "expired");
  });

  it("fully unused returns all; fully consumed returns zero; duplicate return idempotent", async () => {
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    const created = await poolService.createBidDistributionPool({
      name: "Return Modes",
      budgetJod: "10",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    const nowGrant = new Date("2026-07-01T00:00:00.000Z");
    const out = await poolService.allocateBidDistributionBatch({
      poolId: created.pool.id,
      distributionMode: "manual",
      bidsPerFreelancer: 10,
      freelancerUserIds: [a, b],
      expirationMode: "days",
      expirationValue: 1,
      actorUserId: adminId,
      idempotencyKey: `gate_modes_${Date.now()}`,
      now: nowGrant,
    });
    // consume all of b
    await accounting.consumeBidCreditsFefo({
      freelancerUserId: b,
      amount: 10,
      idempotencyKey: `gate_full_consume_${Date.now()}`,
      now: new Date("2026-07-01T12:00:00.000Z"),
    });
    const expireNow = new Date("2026-07-05T00:00:00.000Z");
    await accounting.expireDueBidCreditGrants({ now: expireNow });
    const first = await poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow });
    assert.strictEqual(first.returnedTotal, 10); // only a returns 10; b returns 0 but counted in allocationCount

    const second = await poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow });
    assert.strictEqual(second.returnedTotal, 0);

    const p = await poolService.getBidDistributionPoolById(created.pool.id);
    assert.strictEqual(p.availableBids, 90); // 100-20+10
    assert.strictEqual(p.totalBids, 100);

    const events = await pool.query(
      `SELECT COUNT(*)::int AS n FROM marketplace_bid_distribution_pool_events
        WHERE event_type='RETURNED_UNUSED' AND pool_id=$1`,
      [created.pool.id],
    );
    assert.strictEqual(Number(events.rows[0].n), 2); // both allocations marked returned once
  });

  it("concurrent pool return credits unused once", async () => {
    const fl = await seedUser("freelancer");
    const created = await poolService.createBidDistributionPool({
      name: "Concurrent Return",
      budgetJod: "5",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    const out = await poolService.allocateBidDistributionBatch({
      poolId: created.pool.id,
      distributionMode: "manual",
      bidsPerFreelancer: 20,
      freelancerUserIds: [fl],
      expirationMode: "days",
      expirationValue: 1,
      actorUserId: adminId,
      idempotencyKey: `gate_conc_ret_${Date.now()}`,
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    const expireNow = new Date("2026-06-10T00:00:00.000Z");
    await accounting.expireDueBidCreditGrants({ now: expireNow });

    const results = await Promise.all([
      poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow }),
      poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow }),
      poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow }),
    ]);
    const totalReturned = results.reduce((s, r) => s + (r.returnedTotal || 0), 0);
    assert.strictEqual(totalReturned, 20);

    const p = await poolService.getBidDistributionPoolById(created.pool.id);
    assert.strictEqual(p.availableBids, 50); // 50-20+20
    const ev = await pool.query(
      `SELECT COUNT(*)::int AS n FROM marketplace_bid_distribution_pool_events
        WHERE idempotency_key=$1`,
      [`pool_return_unused:allocation:${out.allocations[0].id}`],
    );
    assert.strictEqual(Number(ev.rows[0].n), 1);
  });

  it("concurrent allocation: only one of two oversubscribed batches commits", async () => {
    const x = await seedUser("freelancer");
    const y = await seedUser("freelancer");
    const created = await poolService.createBidDistributionPool({
      name: "Concurrent Alloc",
      budgetJod: "10",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    // available=100
    const results = await Promise.allSettled([
      poolService.allocateBidDistributionBatch({
        poolId: created.pool.id,
        distributionMode: "manual",
        bidsPerFreelancer: 70,
        freelancerUserIds: [x],
        expirationMode: "days",
        expirationValue: 7,
        actorUserId: adminId,
        idempotencyKey: `gate_conc_a_${Date.now()}`,
      }),
      poolService.allocateBidDistributionBatch({
        poolId: created.pool.id,
        distributionMode: "manual",
        bidsPerFreelancer: 70,
        freelancerUserIds: [y],
        expirationMode: "days",
        expirationValue: 7,
        actorUserId: adminId,
        idempotencyKey: `gate_conc_b_${Date.now()}`,
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    assert.strictEqual(ok.length, 1);
    assert.strictEqual(fail.length, 1);
    const p = await poolService.getBidDistributionPoolById(created.pool.id);
    assert.strictEqual(p.availableBids, 30);
    assert.ok(p.availableBids >= 0);
  });

  it("FEFO vs expiry race: Bid not both consumed and returned", async () => {
    const fl = await seedUser("freelancer");
    const created = await poolService.createBidDistributionPool({
      name: "Race Pool",
      budgetJod: "5",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    const out = await poolService.allocateBidDistributionBatch({
      poolId: created.pool.id,
      distributionMode: "manual",
      bidsPerFreelancer: 10,
      freelancerUserIds: [fl],
      expirationMode: "days",
      expirationValue: 7,
      actorUserId: adminId,
      idempotencyKey: `gate_race_${Date.now()}`,
      now: new Date("2026-05-01T00:00:00.000Z"),
    });
    const grantId = out.allocations[0].bidCreditGrantId;
    const allocId = out.allocations[0].id;
    const raceNow = new Date("2026-05-02T12:00:00.000Z");

    const settled = await Promise.allSettled([
      accounting.consumeBidCreditsFefo({
        freelancerUserId: fl,
        amount: 4,
        idempotencyKey: `gate_race_consume_${Date.now()}`,
        now: raceNow,
      }),
      (async () => {
        await pool.query(`UPDATE marketplace_bid_credit_grants SET expires_at = $1 WHERE id = $2`, [
          raceNow.toISOString(),
          grantId,
        ]);
        await pool.query(
          `UPDATE marketplace_bid_distribution_allocations SET expires_at = $1 WHERE id = $2`,
          [raceNow.toISOString(), allocId],
        );
        await accounting.expireDueBidCreditGrants({ freelancerUserId: fl, now: raceNow });
        return poolService.reconcileExpiredPoolAllocationReturns({ now: raceNow });
      })(),
    ]);

    const grant = (
      await pool.query(
        `SELECT amount_consumed, amount_expired, amount_granted FROM marketplace_bid_credit_grants WHERE id=$1`,
        [grantId],
      )
    ).rows[0];
    const consumed = Number(grant.amount_consumed);
    const expired = Number(grant.amount_expired);
    assert.strictEqual(consumed + expired, 10);
    assert.ok(consumed === 0 || consumed === 4);
    const p = await poolService.getBidDistributionPoolById(created.pool.id);
    assert.strictEqual(p.availableBids, 50 - consumed);
    assert.strictEqual(settled.length, 2);
  });

  it("Admin return notification aggregated and idempotent", async () => {
    const fls = [await seedUser("freelancer"), await seedUser("freelancer")];
    // ensure a super_admin recipient exists for notifySuperAdmins
    await seedUser("super_admin");
    const created = await poolService.createBidDistributionPool({
      name: "Notify Pool",
      budgetJod: "5",
      bidUnitPriceJod: "0.10",
      actorUserId: adminId,
    });
    await poolService.allocateBidDistributionBatch({
      poolId: created.pool.id,
      distributionMode: "manual",
      bidsPerFreelancer: 5,
      freelancerUserIds: fls,
      expirationMode: "days",
      expirationValue: 1,
      actorUserId: adminId,
      idempotencyKey: `gate_notify_${Date.now()}`,
      now: new Date("2026-04-01T00:00:00.000Z"),
    });
    const expireNow = new Date("2026-04-10T12:00:00.000Z");
    await accounting.expireDueBidCreditGrants({ now: expireNow });
    await poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow });
    await poolService.reconcileExpiredPoolAllocationReturns({ now: expireNow });

    const notes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE type='bid_pool.returned_unused' AND entity_id=$1`,
      [created.pool.id],
    );
    assert.ok(Number(notes.rows[0].n) >= 1);
    assert.ok(Number(notes.rows[0].n) <= 2); // per super_admin recipients, not per freelancer
    const freelancerReturnSpam = await pool.query(
      `SELECT COUNT(*)::int AS n FROM notifications
        WHERE type='bid_pool.returned_unused' AND recipient_role='freelancer'`,
    );
    assert.strictEqual(Number(freelancerReturnSpam.rows[0].n), 0);
  });

  it("no Work Token tables mutated", async () => {
    const wt = await pool.query(`SELECT to_regclass('public.freelancer_work_token_wallets') AS t`);
    assert.equal(wt.rows[0].t, null);
  });
});
