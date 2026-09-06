/**
 * Phase B3 Bid Credits distribution — isolated DB gate tests.
 * Run via: npm run test:marketplace-bid-credits-phase-b3-gate
 */
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) throw new Error(`B3 GATE REFUSED PRODUCTION: ${info.maskedTarget}`);
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceBidCreditsPhaseB3Gate.js");
  }
}
refuseProductionDatabase();

process.env.JWT_SECRET = process.env.JWT_SECRET || "marketplace-bid-credits-phase-b3-gate-secret";
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";

const { pool } = require("../src/config/db");
const membershipsService = require("../src/services/marketplaceMembershipsService");
const cyclesService = require("../src/services/marketplaceMembershipCyclesService");
const dist = require("../src/services/marketplaceBidCreditDistributionService");
const accounting = require("../src/services/marketplaceBidCreditAccountingService");
const { clearMarketplaceBidCreditsSchemaCache } = require("../src/utils/marketplaceBidCreditsSchema");
const { clearMarketplaceMembershipPlanSchemaCache } = require("../src/utils/marketplaceMembershipPlanSchema");

async function seedUser() {
  const suffix = crypto.randomBytes(5).toString("hex");
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1,$2,'x','freelancer','B3','T','User',$3,$3,'ذكر','JO',TRUE,TRUE,TRUE)
     RETURNING id`,
    [`B${suffix}`.slice(0, 10).toUpperCase(), `b3_${suffix}@example.com`, `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`],
  );
  return rows[0];
}

async function setBidEngine(on) {
  await pool.query(`UPDATE marketplace_economy_settings SET bid_credits_enabled=$1, updated_at=NOW() WHERE id=1`, [
    Boolean(on),
  ]);
}

async function setPlanBids(planId, bids) {
  await pool.query(`UPDATE marketplace_membership_plans SET monthly_bid_allowance=$2, included_tokens_per_cycle=0 WHERE id=$1`, [
    planId,
    bids,
  ]);
  clearMarketplaceMembershipPlanSchemaCache();
}

async function activate(userId, planId, now, months = 1) {
  const out = await membershipsService.createAndActivateMarketplaceMembership({
    freelancerUserId: userId,
    marketplacePlanId: planId,
    paidTermMonths: months,
    now,
    source: "system",
  });
  return out;
}

async function available(userId, now = new Date()) {
  const client = await pool.connect();
  try {
    return accounting.sumAvailableBidCredits({ client, freelancerUserId: userId, now });
  } finally {
    client.release();
  }
}

describe("Phase B3 — DB distribution gate", () => {
  let startPlanId;

  before(async () => {
    clearMarketplaceBidCreditsSchemaCache();
    clearMarketplaceMembershipPlanSchemaCache();
    await pool.query(
      `UPDATE marketplace_economy_settings SET work_tokens_enabled=FALSE, bid_credits_enabled=FALSE, updated_at=NOW() WHERE id=1`,
    );
    const { rows } = await pool.query(
      `SELECT id FROM marketplace_membership_plans WHERE tier_code='start' LIMIT 1`,
    );
    startPlanId = rows[0].id;
    await setPlanBids(startPlanId, 30);
  });

  after(async () => {
    await pool.end().catch(() => {});
  });

  it("zero allowance: membership exists, no Bid grants, no zero ledger", async () => {
    await setPlanBids(startPlanId, 0);
    await setBidEngine(true);
    const u = await seedUser();
    const now = new Date("2026-03-17T12:00:00.000Z");
    await activate(u.id, startPlanId, now, 1);
    const { rows: grants } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants WHERE freelancer_user_id=$1`,
      [u.id],
    );
    const { rows: ledger } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries WHERE freelancer_user_id=$1`,
      [u.id],
    );
    assert.equal(grants[0].c, 0);
    assert.equal(ledger[0].c, 0);
    assert.equal(await available(u.id, now), 0);
    await setPlanBids(startPlanId, 30);
    await setBidEngine(false);
  });

  it("engine OFF: no unlock; engine ON: missed-day catch-up unlocks cumulative due", async () => {
    await setPlanBids(startPlanId, 31);
    await setBidEngine(false);
    const u = await seedUser();
    const start = new Date("2026-03-01T00:00:00.000Z");
    await activate(u.id, startPlanId, start, 1);
    assert.equal(await available(u.id, start), 0);

    await setBidEngine(true);
    const day9 = new Date("2026-03-09T12:00:00.000Z");
    await dist.reconcileFreelancerBidDistributions({ freelancerUserId: u.id, now: day9 });
    const bal = await available(u.id, day9);
    // cumulative floor(31*9/31)=9
    assert.equal(bal, 9);

    await dist.reconcileFreelancerBidDistributions({ freelancerUserId: u.id, now: day9 });
    assert.equal(await available(u.id, day9), 9);

    await Promise.all([
      dist.reconcileFreelancerBidDistributions({ freelancerUserId: u.id, now: day9 }),
      dist.reconcileFreelancerBidDistributions({ freelancerUserId: u.id, now: day9 }),
    ]);
    assert.equal(await available(u.id, day9), 9);
    await setBidEngine(false);
  });

  it("plan allowance change does not rewrite current snapshot; future window uses new", async () => {
    await setPlanBids(startPlanId, 60);
    await setBidEngine(true);
    const u = await seedUser();
    const t0 = new Date("2026-01-15T12:00:00.000Z");
    const mem1 = await activate(u.id, startPlanId, t0, 1);
    const c1 = await cyclesService.getCurrentActiveCycle(mem1.membership.id, { now: t0 });
    assert.equal(Number(c1.monthlyBidAllowanceSnapshot), 60);

    await setPlanBids(startPlanId, 90);
    const { rows: distRows } = await pool.query(
      `SELECT monthly_bid_allowance_snapshot FROM marketplace_membership_bid_distribution_months WHERE cycle_id=$1`,
      [c1.id],
    );
    assert.equal(Number(distRows[0].monthly_bid_allowance_snapshot), 60);

    const t1 = new Date("2026-02-20T12:00:00.000Z");
    const mem2 = await activate(u.id, startPlanId, t1, 1);
    const c2 = await cyclesService.getCurrentActiveCycle(mem2.membership.id, { now: t1 });
    assert.equal(Number(c2.monthlyBidAllowanceSnapshot), 90);
    await setPlanBids(startPlanId, 30);
    await setBidEngine(false);
  });

  it("annual activation creates one distribution month only (no 12× upfront)", async () => {
    await setPlanBids(startPlanId, 100);
    await setBidEngine(false);
    const u = await seedUser();
    const now = new Date("2026-03-17T12:00:00.000Z");
    const out = await activate(u.id, startPlanId, now, 12);
    const { rows: months } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_bid_distribution_months WHERE membership_id=$1`,
      [out.membership.id],
    );
    assert.equal(months[0].c, 1);
    assert.equal((await available(u.id, now)), 0);
  });

  it("membership expiry makes membership Bids unspendable; manual grant remains", async () => {
    await setPlanBids(startPlanId, 10);
    await setBidEngine(true);
    const u = await seedUser();
    const start = new Date("2026-05-01T00:00:00.000Z");
    await activate(u.id, startPlanId, start, 1);
    await dist.reconcileFreelancerBidDistributions({
      freelancerUserId: u.id,
      now: new Date("2026-05-10T12:00:00.000Z"),
    });
    const before = await available(u.id, new Date("2026-05-10T12:00:00.000Z"));
    assert.ok(before >= 1);

    await accounting.createBidCreditGrant({
      freelancerUserId: u.id,
      sourceType: "admin_manual",
      amount: 5,
      expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      eventType: "ADMIN_BID_GRANT",
      idempotencyKey: `b3-manual-${u.id}`,
      reason: "b3_test_manual",
      metadata: { independentOfMembershipPlan: true },
      grantedAt: start,
    });

    const afterExpiry = new Date("2026-06-02T00:00:00.000Z");
    await accounting.expireDueBidCreditGrants({ freelancerUserId: u.id, now: afterExpiry });
    const bal = await available(u.id, afterExpiry);
    assert.equal(bal, 5);
    await setBidEngine(false);
  });

  it("FEFO consumes earliest-expiring grant first across sources", async () => {
    await setBidEngine(true);
    const u = await seedUser();
    const now = new Date("2026-07-01T00:00:00.000Z");
    await accounting.createBidCreditGrant({
      freelancerUserId: u.id,
      sourceType: "admin_manual",
      amount: 1,
      expiresAt: new Date("2026-07-03T00:00:00.000Z"),
      eventType: "ADMIN_BID_GRANT",
      idempotencyKey: `b3-fefo-manual-${u.id}`,
      grantedAt: now,
    });
    await accounting.createBidCreditGrant({
      freelancerUserId: u.id,
      sourceType: "membership_daily_unlock",
      amount: 1,
      expiresAt: new Date("2026-07-20T00:00:00.000Z"),
      eventType: "MEMBERSHIP_BID_GRANT",
      idempotencyKey: `b3-fefo-mem-${u.id}`,
      grantedAt: now,
    });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await accounting.consumeBidCreditsFefo({
        client,
        freelancerUserId: u.id,
        amount: 1,
        idempotencyKey: `b3-fefo-consume-${u.id}`,
        now,
      });
      await client.query("COMMIT");
      assert.equal(out.allocations[0].grantId != null, true);
      const { rows } = await pool.query(
        `SELECT source_type, amount_consumed FROM marketplace_bid_credit_grants WHERE id=$1`,
        [out.allocations[0].grantId],
      );
      assert.equal(rows[0].source_type, "admin_manual");
      assert.equal(Number(rows[0].amount_consumed), 1);
    } finally {
      client.release();
    }
    await setBidEngine(false);
  });

  it("no Work Token membership grant on activation", async () => {
    await setPlanBids(startPlanId, 30);
    const u = await seedUser();
    await activate(u.id, startPlanId, new Date("2026-08-01T00:00:00.000Z"), 1);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM work_token_ledger_entries
        WHERE freelancer_user_id=$1 AND event_type='MEMBERSHIP_CYCLE_GRANT'`,
      [u.id],
    );
    assert.equal(rows[0].c, 0);
  });
});
