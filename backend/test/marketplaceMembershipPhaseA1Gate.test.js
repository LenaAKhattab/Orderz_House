/**
 * Phase A1 Marketplace Membership catalog + Bid Credits lifecycle (B1/B3) — gate tests.
 * Run via: node scripts/runMarketplaceMembershipPhaseA1Gate.js
 *
 * Migrations through 146 on isolated gate DB. Engines stay OFF.
 * Work Token cycle grants are DISCONNECTED from activation.
 * No Production mutation.
 */

const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE A1 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceMembershipPhaseA1Gate.js");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-membership-phase-a1-gate-secret";
}
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";

const { pool } = require("../src/config/db");
const membershipsService = require("../src/services/marketplaceMembershipsService");
const cyclesService = require("../src/services/marketplaceMembershipCyclesService");
const plansService = require("../src/services/marketplaceMembershipPlansService");
const walletService = require("../src/services/marketplaceWorkTokenWalletService");
const grantService = require("../src/services/marketplaceMembershipCycleTokenGrantService");
const {
  clearMarketplaceMembershipPlanSchemaCache,
} = require("../src/utils/marketplaceMembershipPlanSchema");
const {
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
  ARTICLE_ACCESS_LEVEL_BY_TIER,
} = require("../src/constants/marketplaceMembershipPlans");
const { PRIORITY_BID_USES_BY_TIER } = require("../src/constants/marketplaceEconomy");

const APPROVED = Object.freeze({
  free: { price: 0, tokens: 0, bids: 0, level: 1 },
  start: { price: 24.99, tokens: 0, bids: 100, level: 2 },
  active: { price: 44.99, tokens: 0, bids: 220, level: 3 },
  pro: { price: 79.99, tokens: 0, bids: 420, level: 4 },
  elite: { price: 119.99, tokens: 0, bids: 700, level: 5 },
});

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `a1_${role}_${suffix}@example.com`;
  const accountId = `A${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'A1', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id, account_id, email, role`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function setEnginesOff() {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET work_tokens_enabled = FALSE,
            priority_bidding_enabled = FALSE,
            fair_work_distribution_enabled = FALSE,
            elite_engine_enabled = FALSE,
            cash_membership_payments_enabled = FALSE,
            bid_credits_enabled = FALSE,
            updated_at = NOW()
      WHERE id = 1`,
  );
}

async function setBidEngine(on) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET bid_credits_enabled = $1, updated_at = NOW()
      WHERE id = 1`,
    [Boolean(on)],
  );
}

async function planByTier() {
  const { rows } = await pool.query(
    `SELECT id, tier_code, monthly_price_jod::float8 AS price,
            included_tokens_per_cycle AS tokens,
            monthly_bid_allowance AS bids,
            article_access_level AS level,
            elite_direct_orders_enabled AS elite,
            priority_bid_enabled AS pb_on,
            priority_bid_uses_per_cycle AS pb_uses,
            is_active
       FROM marketplace_membership_plans
      WHERE tier_code = ANY($1::text[])
      ORDER BY tier_code`,
    [Object.keys(APPROVED)],
  );
  const map = {};
  for (const r of rows) map[r.tier_code] = r;
  return map;
}

async function seedPlanBidAllowances(plans) {
  for (const [tier, cfg] of Object.entries(APPROVED)) {
    await pool.query(
      `UPDATE marketplace_membership_plans
          SET monthly_bid_allowance = $2, included_tokens_per_cycle = 0, updated_at = NOW()
        WHERE id = $1`,
      [plans[tier].id, cfg.bids],
    );
  }
  clearMarketplaceMembershipPlanSchemaCache();
}

async function activate(freelancerUserId, planId, now = new Date()) {
  const out = await membershipsService.createAndActivateMarketplaceMembership({
    freelancerUserId,
    marketplacePlanId: planId,
    paidTermMonths: 12,
    now,
    source: "system",
  });
  return out.membership;
}

async function wtGrantCount(freelancerUserId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_tokens),0)::int AS sum
       FROM work_token_ledger_entries
      WHERE freelancer_user_id = $1
        AND event_type = 'MEMBERSHIP_CYCLE_GRANT'`,
    [Number(freelancerUserId)],
  );
  return rows[0];
}

async function bidGrantSum(freelancerUserId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_granted),0)::int AS sum
       FROM marketplace_bid_credit_grants
      WHERE freelancer_user_id = $1
        AND source_type = 'membership_daily_unlock'`,
    [Number(freelancerUserId)],
  );
  return rows[0];
}

describe("Phase A1 — constants / policy", () => {
  it("FREE signup grant and historical backfill are NONE", () => {
    assert.equal(grantService.FREE_SIGNUP_WORK_TOKEN_GRANT, "NONE");
    assert.equal(grantService.MARKETPLACE_MEMBERSHIP_TOKEN_BACKFILL, "NONE");
  });

  it("active tier codes and article levels match approved catalog", () => {
    assert.deepEqual([...MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES], [
      "free",
      "start",
      "active",
      "pro",
      "elite",
    ]);
    for (const [tier, cfg] of Object.entries(APPROVED)) {
      assert.equal(ARTICLE_ACCESS_LEVEL_BY_TIER[tier], cfg.level);
    }
  });
});

describe("Phase A1 — isolated DB gate (Bid Credits product)", () => {
  let plans;
  let freeUser;
  let startUser;
  let activeUser;
  let proUser;
  let eliteUser;
  let upgradeUser;
  let concurrentUser;
  let legacyPlansBefore;

  before(async () => {
    clearMarketplaceMembershipPlanSchemaCache();
    try {
      const { clearMarketplaceBidCreditsSchemaCache: clearBid } = require("../src/utils/marketplaceBidCreditsSchema");
      clearBid();
    } catch {
      /* optional */
    }
    await setEnginesOff();
    legacyPlansBefore = (
      await pool.query(`SELECT COUNT(*)::int AS c FROM plans`).catch(() => ({ rows: [{ c: -1 }] }))
    ).rows[0].c;

    plans = await planByTier();
    for (const tier of Object.keys(APPROVED)) {
      assert.ok(plans[tier], `missing tier ${tier}`);
    }
    await seedPlanBidAllowances(plans);
    plans = await planByTier();

    freeUser = await seedUser("freelancer");
    startUser = await seedUser("freelancer");
    activeUser = await seedUser("freelancer");
    proUser = await seedUser("freelancer");
    eliteUser = await seedUser("freelancer");
    upgradeUser = await seedUser("freelancer");
    concurrentUser = await seedUser("freelancer");
  });

  after(async () => {
    await pool.end().catch(() => {});
  });

  it("catalog: Work Tokens zeroed; monthly Bid allowance Admin-controlled", async () => {
    for (const [tier, cfg] of Object.entries(APPROVED)) {
      const p = plans[tier];
      assert.equal(Number(p.price), cfg.price, tier);
      assert.equal(Number(p.tokens), 0, tier);
      assert.equal(Number(p.bids), cfg.bids, tier);
      assert.equal(Number(p.level), cfg.level, tier);
      assert.equal(Boolean(p.is_active), true, tier);
    }
    assert.equal(Boolean(plans.elite.elite), true);
  });

  it("pay_as_you_work is inactive (not deleted)", async () => {
    const { rows } = await pool.query(
      `SELECT is_active FROM marketplace_membership_plans WHERE tier_code = 'pay_as_you_work'`,
    );
    assert.ok(rows[0]);
    assert.equal(Boolean(rows[0].is_active), false);
  });

  it("API plan map exposes tier/price/Bids/article/PB/elite; omits Work Token field", async () => {
    const listed = await plansService.listAdminMarketplaceMembershipPlans({ includeInactive: true });
    const start = listed.find((p) => p.tierCode === "start");
    assert.ok(start);
    assert.equal(start.monthlyPriceJod, 24.99);
    assert.equal(Object.prototype.hasOwnProperty.call(start, "includedTokensPerCycle"), false);
    assert.equal(start.monthlyBidAllowance, 100);
    assert.equal(start.articleAccessLevel, 2);
    assert.equal(typeof start.priorityBidUsesPerCycle, "number");
    const pub = (await plansService.listPublicMarketplaceMembershipPlans()).find(
      (p) => p.tierCode === "elite",
    );
    assert.ok(pub);
    assert.equal(Object.prototype.hasOwnProperty.call(pub, "includedTokensPerCycle"), false);
    assert.equal(pub.monthlyBidAllowance, 700);
    assert.equal(pub.articleAccessLevel, 5);
    assert.equal(pub.capabilities.eliteDirectOrders, true);
  });

  it("FREE cycle: zero Bid unlock while engine OFF; no Work Token cycle field", async () => {
    await activate(freeUser.id, plans.free.id);
    assert.equal((await wtGrantCount(freeUser.id)).sum, 0);
    assert.equal((await bidGrantSum(freeUser.id)).sum, 0);
    const snap = await membershipsService.getFreelancerMarketplaceMembershipSnapshot(freeUser.id);
    assert.equal(Object.prototype.hasOwnProperty.call(snap.currentCycle || {}, "includedTokensAllowed"), false);
    assert.equal(snap.membership.plan.articleAccessLevel, 1);
  });

  it("START activation: no Work Token grant; Bid distribution month snapshotted; unlock deferred while engine OFF", async () => {
    const mem = await activate(startUser.id, plans.start.id);
    assert.equal((await wtGrantCount(startUser.id)).sum, 0);

    const cycle = await cyclesService.getCurrentActiveCycle(mem.id);
    assert.equal(cycle.includedTokensAllowed, 0);
    assert.equal(Number(cycle.monthlyBidAllowanceSnapshot || 0), 100);

    const { rows: dist } = await pool.query(
      `SELECT monthly_bid_allowance_snapshot, total_unlocked, status
         FROM marketplace_membership_bid_distribution_months WHERE cycle_id = $1`,
      [cycle.id],
    );
    assert.equal(dist.length, 1);
    assert.equal(Number(dist[0].monthly_bid_allowance_snapshot), 100);
    assert.equal(Number(dist[0].total_unlocked), 0);

    await cyclesService.reconcileMembershipCycles({ membershipId: mem.id, now: new Date() });
    assert.equal((await wtGrantCount(startUser.id)).sum, 0);
    assert.equal((await bidGrantSum(startUser.id)).sum, 0);
  });

  it("ACTIVE / PRO / ELITE: Bid snapshots correct; Elite capability preserved; no WT grants", async () => {
    await activate(activeUser.id, plans.active.id);
    await activate(proUser.id, plans.pro.id);
    await activate(eliteUser.id, plans.elite.id);

    assert.equal((await wtGrantCount(activeUser.id)).sum, 0);
    assert.equal((await wtGrantCount(proUser.id)).sum, 0);
    assert.equal((await wtGrantCount(eliteUser.id)).sum, 0);

    const eliteCycle = await cyclesService.getCurrentActiveCycle(
      (await membershipsService.resolveCurrentMarketplaceMembershipForFreelancer(eliteUser.id)).id,
    );
    const { rows } = await pool.query(
      `SELECT elite_direct_orders_allowed, included_tokens_allowed, priority_bid_uses_allowed,
              monthly_bid_allowance_snapshot
         FROM marketplace_membership_cycles WHERE id = $1`,
      [eliteCycle.id],
    );
    assert.equal(Number(rows[0].included_tokens_allowed), 0);
    assert.equal(Number(rows[0].monthly_bid_allowance_snapshot), 700);
    assert.ok(Number(rows[0].elite_direct_orders_allowed) >= 1);
    assert.equal(
      Number(rows[0].priority_bid_uses_allowed),
      Number(plans.elite.pb_uses) || PRIORITY_BID_USES_BY_TIER.elite,
    );
  });

  it("legacy WT grant helper remains idempotent when called explicitly (deprecated path)", async () => {
    const mem = await activate(concurrentUser.id, plans.start.id);
    const cycle = await cyclesService.getCurrentActiveCycle(mem.id);
    const cycleRow = {
      id: cycle.id,
      included_tokens_allowed: 100,
      freelancer_user_id: concurrentUser.id,
      membership_id: mem.id,
      cycle_number: cycle.cycleNumber,
      marketplace_plan_id: plans.start.id,
    };
    await Promise.all([
      grantService.grantMembershipCycleIncludedWorkTokens({
        cycleRow,
        freelancerUserId: concurrentUser.id,
      }),
      grantService.grantMembershipCycleIncludedWorkTokens({
        cycleRow,
        freelancerUserId: concurrentUser.id,
      }),
    ]);
    const g = await wtGrantCount(concurrentUser.id);
    assert.equal(g.c, 1);
    assert.equal(g.sum, 100);
  });

  it("upgrade: future Bid snapshot uses new tier; historical cycle Bid snapshot immutable; no WT grants", async () => {
    const t0 = new Date("2026-01-15T12:00:00.000Z");
    const mem1 = await activate(upgradeUser.id, plans.start.id, t0);
    const cycle1 = await cyclesService.getCurrentActiveCycle(mem1.id, { now: t0 });
    assert.equal(cycle1.includedTokensAllowed, 0);
    assert.equal(Number(cycle1.monthlyBidAllowanceSnapshot || 0), 100);
    const cycle1Id = cycle1.id;

    const t1 = new Date("2026-02-20T12:00:00.000Z");
    const mem2 = await activate(upgradeUser.id, plans.active.id, t1);
    const cycle2 = await cyclesService.getCurrentActiveCycle(mem2.id, { now: t1 });
    assert.equal(cycle2.includedTokensAllowed, 0);
    assert.equal(Number(cycle2.monthlyBidAllowanceSnapshot || 0), 220);
    assert.notEqual(String(cycle2.id), String(cycle1Id));

    const { rows: hist } = await pool.query(
      `SELECT included_tokens_allowed, monthly_bid_allowance_snapshot
         FROM marketplace_membership_cycles WHERE id = $1`,
      [cycle1Id],
    );
    assert.equal(Number(hist[0].included_tokens_allowed), 0);
    assert.equal(Number(hist[0].monthly_bid_allowance_snapshot), 100);

    assert.equal((await wtGrantCount(upgradeUser.id)).sum, 0);

    const { rows: oldDist } = await pool.query(
      `SELECT status FROM marketplace_membership_bid_distribution_months WHERE cycle_id = $1`,
      [cycle1Id],
    );
    assert.equal(oldDist[0].status, "closed");
  });

  it("downgrade: future Bid snapshot uses new tier; no WT grants", async () => {
    const user = await seedUser("freelancer");
    const t0 = new Date("2026-03-01T12:00:00.000Z");
    await activate(user.id, plans.pro.id, t0);
    assert.equal((await wtGrantCount(user.id)).sum, 0);

    const t1 = new Date("2026-04-05T12:00:00.000Z");
    const mem2 = await activate(user.id, plans.start.id, t1);
    const cycle2 = await cyclesService.getCurrentActiveCycle(mem2.id, { now: t1 });
    assert.equal(cycle2.includedTokensAllowed, 0);
    assert.equal(Number(cycle2.monthlyBidAllowanceSnapshot || 0), 100);
    assert.equal((await wtGrantCount(user.id)).sum, 0);
  });

  it("Priority Bid uses remain a separate entitlement", async () => {
    const snap = await membershipsService.getFreelancerMarketplaceMembershipSnapshot(startUser.id);
    assert.equal(snap.priorityBid.allowed, Number(plans.start.pb_uses) || 1);
    assert.equal(Object.prototype.hasOwnProperty.call(snap.currentCycle || {}, "includedTokensAllowed"), false);
    assert.ok(snap.priorityBid.allowed >= 0);
  });

  it("no grant on registration alone (user without membership)", async () => {
    const fresh = await seedUser("freelancer");
    assert.equal((await wtGrantCount(fresh.id)).c, 0);
    assert.equal((await bidGrantSum(fresh.id)).c, 0);
    const { rows } = await pool.query(
      `SELECT 1 FROM freelancer_work_token_wallets WHERE freelancer_user_id = $1`,
      [fresh.id],
    );
    assert.equal(rows.length, 0);
  });

  it("engines remain OFF; activation does not fabricate Bid unlocks until engine ON", async () => {
    const { rows } = await pool.query(
      `SELECT work_tokens_enabled, priority_bidding_enabled, fair_work_distribution_enabled,
              elite_engine_enabled, cash_membership_payments_enabled, bid_credits_enabled
         FROM marketplace_economy_settings WHERE id = 1`,
    );
    assert.equal(Boolean(rows[0].work_tokens_enabled), false);
    assert.equal(Boolean(rows[0].bid_credits_enabled), false);
    assert.equal(Boolean(rows[0].priority_bidding_enabled), false);
    assert.equal((await wtGrantCount(startUser.id)).sum, 0);
    assert.equal((await bidGrantSum(startUser.id)).sum, 0);

    await setBidEngine(true);
    const dist = require("../src/services/marketplaceBidCreditDistributionService");
    await dist.reconcileFreelancerBidDistributions({
      freelancerUserId: startUser.id,
      now: new Date(),
    });
    const unlocked = await bidGrantSum(startUser.id);
    assert.ok(unlocked.sum >= 1);
    await setBidEngine(false);
  });

  it("legacy plans table untouched by Phase A1 runtime", async () => {
    const after = (
      await pool.query(`SELECT COUNT(*)::int AS c FROM plans`).catch(() => ({ rows: [{ c: -1 }] }))
    ).rows[0].c;
    assert.equal(after, legacyPlansBefore);
  });

  it("unique index enforces one MEMBERSHIP_CYCLE_GRANT per cycle reference", async () => {
    const { rows } = await pool.query(
      `SELECT indexname FROM pg_indexes
        WHERE indexname LIKE '%membership_cycle_grant%' OR indexdef ILIKE '%MEMBERSHIP_CYCLE_GRANT%'`,
    );
    assert.ok(rows.length >= 1);
  });
});
