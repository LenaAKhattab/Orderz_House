/**
 * Phase 6 Priority Bid Auction — isolated DB gate tests.
 * Run via: node scripts/runMarketplacePriorityAuctionPhase6Gate.js
 */

const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE6 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplacePriorityAuctionPhase6Gate.js");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-priority-auction-phase6-gate-secret";
}
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";
process.env.PRIORITY_AUCTION_RESOLVE_ENABLED = "0";

const { pool } = require("../src/config/db");
const walletService = require("../src/services/marketplaceWorkTokenWalletService");
const membershipsService = require("../src/services/marketplaceMembershipsService");
const priorityAuction = require("../src/services/marketplacePriorityAuctionService");
const normalApp = require("../src/services/marketplaceNormalApplicationWorkTokenService");
const ordersService = require("../src/services/ordersService");
const { PRIORITY_AUCTION_ERROR_CODES } = require("../src/constants/marketplacePriorityAuction");
const { PRIORITY_AUCTION_RESOLUTION_REASONS } = require("../src/constants/marketplacePriorityAuction");
const { PRIORITY_AUCTION_CREATION_SOURCES } = require("../src/constants/marketplacePriorityAuction");

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `pb6_${role}_${suffix}@example.com`;
  const accountId = `P${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'Pb', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id, account_id, email, role`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function setEngines({ workTokens = false, priority = false } = {}) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET work_tokens_enabled = $1,
            priority_bidding_enabled = $2,
            updated_at = NOW()
      WHERE id = 1`,
    [Boolean(workTokens), Boolean(priority)],
  );
}

async function ensurePlan() {
  const { rows } = await pool.query(
    `SELECT id FROM marketplace_membership_plans WHERE tier_code = 'pro' ORDER BY id LIMIT 1`,
  );
  if (rows[0]) return rows[0].id;
  const ins = await pool.query(
    `INSERT INTO marketplace_membership_plans (
       tier_code, name_ar, name_en, is_active, sort_order,
       priority_bid_enabled, priority_bid_uses_per_cycle
     ) VALUES ('pro', 'برو', 'Pro', TRUE, 3, TRUE, 3)
     RETURNING id`,
  );
  return ins.rows[0].id;
}

async function activateMembership(freelancerUserId, planId) {
  return membershipsService.createAndActivateMarketplaceMembership({
    freelancerUserId,
    marketplacePlanId: planId,
    paidTermMonths: 12,
    now: new Date(),
    source: "system",
  });
}

async function credit(freelancerUserId, amount) {
  await walletService.creditWorkTokens({
    freelancerUserId,
    amountTokens: amount,
    eventType: "TOKEN_CREDIT",
    referenceType: "test",
    referenceId: `pb6-seed-${freelancerUserId}-${crypto.randomBytes(3).toString("hex")}`,
    idempotencyKey: `pb6-credit-${freelancerUserId}-${crypto.randomBytes(4).toString("hex")}`,
  });
}

async function createOrder(creatorId) {
  const code = `PB6-${crypto.randomBytes(4).toString("hex")}`;
  const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const { rows } = await pool.query(
    `INSERT INTO orders (
       order_code, title, description, category_id, project_type,
       budget, currency_code, bid_budget_min, bid_budget_max,
       created_by_user_id, created_by_role, source_type,
       is_published, is_open_for_pool, payment_required, payment_status, order_status
     ) VALUES (
       $1, 'PB6 Auction Order', 'Phase 6 gate', $2, 'bidding',
       50, 'JOD', 10, 100,
       $3, 'super_admin', 'super_admin_created',
       TRUE, TRUE, FALSE, 'not_required', 'open_for_bids'
     ) RETURNING *`,
    [code, cats[0]?.id || null, creatorId],
  );
  return rows[0];
}

async function createAuctionForOrder(orderId, adminId) {
  const out = await priorityAuction.createPriorityAuctionForOrder({
    orderId,
    actorUserId: adminId,
    creationSource: PRIORITY_AUCTION_CREATION_SOURCES.SUPER_ADMIN_MANUAL,
    idempotent: true,
  });
  return out.auction;
}

async function forceAuctionEnded(auctionId) {
  await pool.query(
    `UPDATE priority_bid_auctions
        SET starts_at = NOW() - INTERVAL '2 minutes',
            ends_at = NOW() - INTERVAL '1 second',
            updated_at = NOW()
      WHERE id = $1`,
    [auctionId],
  );
}

async function walletSnap(freelancerUserId) {
  return walletService.getWorkTokenWalletSnapshot(freelancerUserId);
}

describe("Marketplace Priority Bid Auction Phase 6 gate", () => {
  let admin;
  let planId;

  before(async () => {
    admin = await seedUser("super_admin");
    planId = await ensurePlan();
    await setEngines({ workTokens: false, priority: false });
  });

  after(async () => {
    await setEngines({ workTokens: false, priority: false });
    await pool.end();
  });

  it("engine OFF: create auction rejected", async () => {
    await setEngines({ workTokens: false, priority: false });
    const order = await createOrder(admin.id);
    await assert.rejects(
      () =>
        priorityAuction.createPriorityAuctionForOrder({
          orderId: order.id,
          actorUserId: admin.id,
        }),
      (err) => err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_ENGINE_OFF,
    );
  });

  it("engine OFF: automatic visibility trigger is no-op", async () => {
    await setEngines({ workTokens: false, priority: false });
    const order = await createOrder(admin.id);
    const out = await priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
      orderId: order.id,
      actorUserId: admin.id,
      orderRow: order,
    });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "ENGINE_OFF");
    const auction = await priorityAuction.getAuctionByOrderId(order.id);
    assert.equal(auction, null);
  });

  it("basic auction: A100 B150 C120 → B wins; losers release 100%; winner consumes", async () => {
    await setEngines({ workTokens: true, priority: true });
    const [a, b, c] = await Promise.all([
      seedUser("freelancer"),
      seedUser("freelancer"),
      seedUser("freelancer"),
    ]);
    for (const f of [a, b, c]) {
      // eslint-disable-next-line no-await-in-loop
      await activateMembership(f.id, planId);
      // eslint-disable-next-line no-await-in-loop
      await credit(f.id, 500);
    }
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);

    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 100,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: b.id,
      bidTokens: 150,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: c.id,
      bidTokens: 120,
    });

    assert.equal((await walletSnap(a.id)).availableTokens, 400);
    assert.equal((await walletSnap(a.id)).reservedTokens, 100);
    assert.equal((await walletSnap(b.id)).reservedTokens, 150);

    await forceAuctionEnded(auction.id);
    const resolved = await priorityAuction.resolvePriorityAuction({ auctionId: auction.id });
    assert.equal(resolved.resolved, true);
    assert.equal(resolved.reason, PRIORITY_AUCTION_RESOLUTION_REASONS.HIGHEST_TOKEN_WON);
    assert.equal(String(resolved.winner.freelancerUserId), String(b.id));

    assert.equal((await walletSnap(b.id)).reservedTokens, 0);
    assert.equal((await walletSnap(b.id)).availableTokens, 350);
    assert.equal((await walletSnap(a.id)).availableTokens, 500);
    assert.equal((await walletSnap(a.id)).reservedTokens, 0);
    assert.equal((await walletSnap(c.id)).availableTokens, 500);
    assert.equal((await walletSnap(c.id)).reservedTokens, 0);

    const { rows: orderRows } = await pool.query(`SELECT assigned_freelancer_id FROM orders WHERE id = $1`, [
      order.id,
    ]);
    assert.equal(Number(orderRows[0].assigned_freelancer_id), Number(b.id));
    await setEngines({ workTokens: false, priority: false });
  });

  it("tie-break: earlier submitted_at wins at equal tokens", async () => {
    await setEngines({ workTokens: true, priority: true });
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await activateMembership(b.id, planId);
    await credit(a.id, 300);
    await credit(b.id, 300);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    const first = await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 150,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: b.id,
      bidTokens: 150,
    });
    await pool.query(
      `UPDATE priority_auction_bids SET submitted_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [first.bid.id],
    );
    await forceAuctionEnded(auction.id);
    const resolved = await priorityAuction.resolvePriorityAuction({ auctionId: auction.id });
    assert.equal(String(resolved.winner.freelancerUserId), String(a.id));
    await setEngines({ workTokens: false, priority: false });
  });

  it("ineligible highest skipped; next eligible wins", async () => {
    await setEngines({ workTokens: true, priority: true });
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await activateMembership(b.id, planId);
    await credit(a.id, 300);
    await credit(b.id, 300);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 200,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: b.id,
      bidTokens: 180,
    });
    await pool.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [a.id]);
    await forceAuctionEnded(auction.id);
    const resolved = await priorityAuction.resolvePriorityAuction({ auctionId: auction.id });
    assert.equal(String(resolved.winner.freelancerUserId), String(b.id));
    assert.equal((await walletSnap(a.id)).reservedTokens, 0);
    assert.equal((await walletSnap(a.id)).availableTokens, 300);
    await pool.query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [a.id]);
    await setEngines({ workTokens: false, priority: false });
  });

  it("no eligible winner releases all reservations", async () => {
    await setEngines({ workTokens: true, priority: true });
    const a = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await credit(a.id, 200);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 50,
    });
    await pool.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [a.id]);
    await forceAuctionEnded(auction.id);
    const resolved = await priorityAuction.resolvePriorityAuction({ auctionId: auction.id });
    assert.equal(resolved.reason, PRIORITY_AUCTION_RESOLUTION_REASONS.NO_ELIGIBLE_WINNER);
    assert.equal(resolved.winner, null);
    assert.equal((await walletSnap(a.id)).availableTokens, 200);
    assert.equal((await walletSnap(a.id)).reservedTokens, 0);
    const { rows } = await pool.query(`SELECT assigned_freelancer_id FROM orders WHERE id = $1`, [order.id]);
    assert.equal(rows[0].assigned_freelancer_id, null);
    await pool.query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [a.id]);
    await setEngines({ workTokens: false, priority: false });
  });

  it("decrease rejected; increase reserves delta only; increase does not consume extra PB use", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 500);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      bidTokens: 150,
    });
    const { rows: used1 } = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
      [f.id],
    );
    assert.equal(Number(used1[0].priority_bid_uses_consumed), 1);

    await assert.rejects(
      () =>
        priorityAuction.increasePriorityBid({
          auctionId: auction.id,
          freelancerUserId: f.id,
          newBidTokens: 100,
        }),
      (err) => err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_DECREASE_NOT_ALLOWED,
    );

    await priorityAuction.increasePriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      newBidTokens: 220,
    });
    assert.equal((await walletSnap(f.id)).availableTokens, 280);
    assert.equal((await walletSnap(f.id)).reservedTokens, 220);
    const { rows: used2 } = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
      [f.id],
    );
    assert.equal(Number(used2[0].priority_bid_uses_consumed), 1);
    await setEngines({ workTokens: false, priority: false });
  });

  it("PB use: loser keeps consumed use; cancel before resolution returns use", async () => {
    await setEngines({ workTokens: true, priority: true });
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await activateMembership(b.id, planId);
    await credit(a.id, 300);
    await credit(b.id, 300);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 100,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: b.id,
      bidTokens: 150,
    });
    await forceAuctionEnded(auction.id);
    await priorityAuction.resolvePriorityAuction({ auctionId: auction.id });
    const { rows: usedA } = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
      [a.id],
    );
    assert.equal(Number(usedA[0].priority_bid_uses_consumed), 1);

    const a2 = await seedUser("freelancer");
    await activateMembership(a2.id, planId);
    await credit(a2.id, 200);
    const order2 = await createOrder(admin.id);
    const auction2 = await createAuctionForOrder(order2.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction2.id,
      freelancerUserId: a2.id,
      bidTokens: 80,
    });
    await priorityAuction.cancelPriorityAuction({ auctionId: auction2.id, actorUserId: admin.id });
    const { rows: usedA2 } = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
      [a2.id],
    );
    assert.equal(Number(usedA2[0].priority_bid_uses_consumed), 0);
    assert.equal((await walletSnap(a2.id)).availableTokens, 200);
    await setEngines({ workTokens: false, priority: false });
  });

  it("duplicate concurrent submission: one bid / one use / one reservation", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 400);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    const results = await Promise.allSettled([
      priorityAuction.submitPriorityBid({ auctionId: auction.id, freelancerUserId: f.id, bidTokens: 100 }),
      priorityAuction.submitPriorityBid({ auctionId: auction.id, freelancerUserId: f.id, bidTokens: 100 }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM priority_auction_bids WHERE auction_id = $1`,
      [auction.id],
    );
    assert.equal(rows[0].c, 1);
    const { rows: used } = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
      [f.id],
    );
    assert.equal(Number(used[0].priority_bid_uses_consumed), 1);
    assert.equal((await walletSnap(f.id)).reservedTokens, 100);
    await setEngines({ workTokens: false, priority: false });
  });

  it("resolution race: one effective winner consume", async () => {
    await setEngines({ workTokens: true, priority: true });
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await activateMembership(b.id, planId);
    await credit(a.id, 300);
    await credit(b.id, 300);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 110,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: b.id,
      bidTokens: 130,
    });
    await forceAuctionEnded(auction.id);
    const raced = await Promise.all([
      priorityAuction.resolvePriorityAuction({ auctionId: auction.id }),
      priorityAuction.resolvePriorityAuction({ auctionId: auction.id }),
    ]);
    const winners = raced.filter((r) => r.resolved && r.winner);
    assert.ok(winners.length >= 1);
    assert.equal(String(winners[0].winner.freelancerUserId), String(b.id));
    const { rows: consumes } = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM work_token_ledger_entries e
       JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
       WHERE w.freelancer_user_id = $1 AND e.event_type = 'PRIORITY_BID_CONSUME'`,
      [b.id],
    );
    assert.equal(consumes[0].c, 1);
    await setEngines({ workTokens: false, priority: false });
  });

  it("end-time boundary rejects late bids", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 200);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await forceAuctionEnded(auction.id);
    await assert.rejects(
      () =>
        priorityAuction.submitPriorityBid({
          auctionId: auction.id,
          freelancerUserId: f.id,
          bidTokens: 50,
        }),
      (err) => err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_CLOSED,
    );
    await setEngines({ workTokens: false, priority: false });
  });

  it("fake/training poolKind cannot submit", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 200);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await assert.rejects(
      () =>
        priorityAuction.submitPriorityBid({
          auctionId: auction.id,
          freelancerUserId: f.id,
          bidTokens: 40,
          poolKind: "fake",
        }),
      (err) => err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_FAKE_TRAINING_FORBIDDEN,
    );
    await setEngines({ workTokens: false, priority: false });
  });

  it("duplicate visibility trigger: one auction", async () => {
    await setEngines({ workTokens: true, priority: true });
    const order = await createOrder(admin.id);
    const a = await priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
      orderId: order.id,
      actorUserId: admin.id,
      orderRow: order,
    });
    const b = await priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
      orderId: order.id,
      actorUserId: admin.id,
      orderRow: order,
    });
    assert.equal(a.created, true);
    assert.equal(b.reused, true);
    assert.equal(String(a.auction.id), String(b.auction.id));
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM priority_bid_auctions WHERE order_id = $1`,
      [order.id],
    );
    assert.equal(rows[0].c, 1);
    assert.equal(a.auction.creationSource, PRIORITY_AUCTION_CREATION_SOURCES.AUTOMATIC_PRICED_BIDDING_OPEN);
    await setEngines({ workTokens: false, priority: false });
  });

  it("concurrent automatic create attempts: one auction", async () => {
    await setEngines({ workTokens: true, priority: true });
    const order = await createOrder(admin.id);
    const raced = await Promise.all([
      priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
        orderId: order.id,
        actorUserId: admin.id,
      }),
      priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
        orderId: order.id,
        actorUserId: admin.id,
      }),
    ]);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM priority_bid_auctions WHERE order_id = $1`,
      [order.id],
    );
    assert.equal(rows[0].c, 1);
    const ids = raced.map((r) => r.auction && String(r.auction.id)).filter(Boolean);
    assert.equal(new Set(ids).size, 1);
    await setEngines({ workTokens: false, priority: false });
  });

  it("auto + Super Admin create concurrently: one auction", async () => {
    await setEngines({ workTokens: true, priority: true });
    const order = await createOrder(admin.id);
    const raced = await Promise.all([
      priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
        orderId: order.id,
        actorUserId: admin.id,
      }),
      priorityAuction.createPriorityAuctionForOrder({
        orderId: order.id,
        actorUserId: admin.id,
        creationSource: PRIORITY_AUCTION_CREATION_SOURCES.SUPER_ADMIN_MANUAL,
        idempotent: true,
      }),
    ]);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM priority_bid_auctions WHERE order_id = $1`,
      [order.id],
    );
    assert.equal(rows[0].c, 1);
    const ids = [
      raced[0].auction && String(raced[0].auction.id),
      raced[1].auction && String(raced[1].auction.id),
    ].filter(Boolean);
    assert.equal(new Set(ids).size, 1);
    await setEngines({ workTokens: false, priority: false });
  });

  it("cancel vs create race: no active auction on terminal Order", async () => {
    await setEngines({ workTokens: true, priority: true });
    const order = await createOrder(admin.id);
    const raced = await Promise.allSettled([
      priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
        orderId: order.id,
        actorUserId: admin.id,
      }),
      normalApp.endOpenBiddingOrderWithoutSelection({
        orderId: order.id,
        actorUserId: admin.id,
        actorRole: "super_admin",
      }),
    ]);
    assert.ok(raced.every((r) => r.status === "fulfilled" || r.status === "rejected"));
    const { rows: orderRows } = await pool.query(
      `SELECT order_status, is_open_for_pool FROM orders WHERE id = $1`,
      [order.id],
    );
    // If cancel won, order is cancelled; if create-only path somehow skipped cancel, still assert auction invariant when cancelled
    const auction = await priorityAuction.getAuctionByOrderId(order.id);
    if (String(orderRows[0].order_status) === "cancelled") {
      if (auction) {
        assert.equal(auction.status, "cancelled");
      }
    } else {
      // Cancel lost the race against create holding lock; force cancel and verify
      await normalApp.endOpenBiddingOrderWithoutSelection({
        orderId: order.id,
        actorUserId: admin.id,
        actorRole: "super_admin",
      });
      const after = await priorityAuction.getAuctionByOrderId(order.id);
      if (after) assert.equal(after.status, "cancelled");
    }
    await setEngines({ workTokens: false, priority: false });
  });

  it("assignment while auction active is blocked", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 200);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      bidTokens: 50,
    });
    const { rows: bidRows } = await pool.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
       VALUES ($1, $2, 40, 'pending')
       RETURNING id`,
      [order.id, f.id],
    );
    await assert.rejects(
      () =>
        ordersService.approveInternalPricedBidAdmin({
          actorUserId: admin.id,
          orderId: order.id,
          bidId: bidRows[0].id,
        }),
      (err) => err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_AUCTION_ACTIVE,
    );
    const { rows } = await pool.query(`SELECT assigned_freelancer_id FROM orders WHERE id = $1`, [order.id]);
    assert.equal(rows[0].assigned_freelancer_id, null);
    await setEngines({ workTokens: false, priority: false });
  });

  it("resolution vs normal assignment race: one canonical assignment", async () => {
    await setEngines({ workTokens: true, priority: true });
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await activateMembership(b.id, planId);
    await credit(a.id, 300);
    await credit(b.id, 300);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 120,
    });
    const { rows: moneyBid } = await pool.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
       VALUES ($1, $2, 55, 'pending')
       RETURNING id`,
      [order.id, b.id],
    );
    await forceAuctionEnded(auction.id);

    const raced = await Promise.allSettled([
      priorityAuction.resolvePriorityAuction({ auctionId: auction.id }),
      ordersService.approveInternalPricedBidAdmin({
        actorUserId: admin.id,
        orderId: order.id,
        bidId: moneyBid[0].id,
      }),
    ]);

    const assignmentBlocked = raced.some(
      (r) =>
        r.status === "rejected" &&
        r.reason?.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_AUCTION_ACTIVE,
    );
    const resolveFulfilled = raced.find((r) => r.status === "fulfilled" && r.value?.resolved);

    const { rows: orderRows } = await pool.query(
      `SELECT assigned_freelancer_id FROM orders WHERE id = $1`,
      [order.id],
    );
    const assigned = orderRows[0].assigned_freelancer_id;
    const afterAuction = await priorityAuction.getAuctionByOrderId(order.id);

    // Canonical outcomes:
    // 1) Resolver wins → A assigned, auction resolved
    // 2) Manual award blocked while auction open → A assigned by resolver (or retry resolve)
    if (resolveFulfilled?.value?.winner) {
      assert.equal(Number(assigned), Number(a.id));
      assert.equal(afterAuction.status, "resolved");
    } else if (assignmentBlocked) {
      // Manual path correctly blocked; ensure resolve can complete
      const resolved = await priorityAuction.resolvePriorityAuction({ auctionId: auction.id });
      assert.equal(resolved.resolved || resolved.idempotent, true);
      const { rows: again } = await pool.query(`SELECT assigned_freelancer_id FROM orders WHERE id = $1`, [
        order.id,
      ]);
      assert.equal(Number(again[0].assigned_freelancer_id), Number(a.id));
    } else {
      // Resolver already done idempotently; assignment may have raced after resolve
      assert.ok(assigned != null);
      assert.ok(["resolved", "cancelled"].includes(afterAuction.status));
    }

    // Never two Token consumes for winner path
    const { rows: consumes } = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM work_token_ledger_entries e
       JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
       WHERE w.freelancer_user_id = $1 AND e.event_type = 'PRIORITY_BID_CONSUME'`,
      [a.id],
    );
    assert.ok(consumes[0].c <= 1);
    await setEngines({ workTokens: false, priority: false });
  });

  it("fixed-take / non-priced-bidding skipped by automatic trigger", async () => {
    await setEngines({ workTokens: true, priority: true });
    const code = `PB6F-${crypto.randomBytes(4).toString("hex")}`;
    const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
    const { rows } = await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code,
         created_by_user_id, created_by_role, source_type,
         is_published, is_open_for_pool, payment_required, payment_status, order_status
       ) VALUES (
         $1, 'Fixed', 'no auction', $2, 'fixed',
         80, 'JOD',
         $3, 'super_admin', 'super_admin_created',
         TRUE, TRUE, FALSE, 'not_required', 'published'
       ) RETURNING *`,
      [code, cats[0]?.id || null, admin.id],
    );
    const out = await priorityAuction.maybeCreatePriorityAuctionOnPricedBiddingOpen({
      orderId: rows[0].id,
      orderRow: rows[0],
    });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "NOT_PRICED_BIDDING");
    await setEngines({ workTokens: false, priority: false });
  });

  // ========== Phase 6.1 concurrency hardening ==========

  it("Phase 6.1: cancel vs resolve — exactly one terminal path", async () => {
    await setEngines({ workTokens: true, priority: true });
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await activateMembership(b.id, planId);
    await credit(a.id, 400);
    await credit(b.id, 400);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 100,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: b.id,
      bidTokens: 150,
    });
    await forceAuctionEnded(auction.id);

    const raced = await Promise.all([
      priorityAuction.resolvePriorityAuction({ auctionId: auction.id }),
      priorityAuction.cancelPriorityAuction({ auctionId: auction.id, actorUserId: admin.id }),
    ]);

    const after = await priorityAuction.getAuctionByOrderId(order.id);
    assert.ok(["resolved", "cancelled"].includes(after.status));
    assert.notEqual(after.status, "active");
    assert.notEqual(after.status, "resolving");

    const resolveOut = raced.find((r) => r.resolved === true);
    const cancelOut = raced.find((r) => r.cancelled === true);

    if (after.status === "resolved") {
      assert.ok(resolveOut);
      assert.equal(String(after.winnerFreelancerUserId), String(b.id));
      assert.equal((await walletSnap(b.id)).reservedTokens, 0);
      assert.equal((await walletSnap(a.id)).reservedTokens, 0);
      assert.equal((await walletSnap(a.id)).availableTokens, 400);
      // Winner consumed 150 from reserved → available stays 250 (400-150)
      assert.equal((await walletSnap(b.id)).availableTokens, 250);
      const { rows: consumes } = await pool.query(
        `SELECT COUNT(*)::int AS c
         FROM work_token_ledger_entries e
         JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
         WHERE w.freelancer_user_id = $1 AND e.event_type = 'PRIORITY_BID_CONSUME'`,
        [b.id],
      );
      assert.equal(consumes[0].c, 1);
      const { rows: usedB } = await pool.query(
        `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
         JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
         WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
        [b.id],
      );
      assert.equal(Number(usedB[0].priority_bid_uses_consumed), 1);
      // Cancel must not have also won
      assert.ok(!cancelOut || cancelOut.cancelled !== true);
    } else {
      assert.equal(after.status, "cancelled");
      assert.ok(cancelOut);
      assert.equal(after.winnerFreelancerUserId, null);
      const { rows: orderRows } = await pool.query(
        `SELECT assigned_freelancer_id FROM orders WHERE id = $1`,
        [order.id],
      );
      assert.equal(orderRows[0].assigned_freelancer_id, null);
      assert.equal((await walletSnap(a.id)).availableTokens, 400);
      assert.equal((await walletSnap(b.id)).availableTokens, 400);
      assert.equal((await walletSnap(a.id)).reservedTokens, 0);
      assert.equal((await walletSnap(b.id)).reservedTokens, 0);
      const { rows: consumes } = await pool.query(
        `SELECT COUNT(*)::int AS c
         FROM work_token_ledger_entries e
         JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
         WHERE w.freelancer_user_id IN ($1,$2) AND e.event_type = 'PRIORITY_BID_CONSUME'`,
        [a.id, b.id],
      );
      assert.equal(consumes[0].c, 0);
      const { rows: usedA } = await pool.query(
        `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
         JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
         WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
        [a.id],
      );
      assert.equal(Number(usedA[0].priority_bid_uses_consumed), 0);
    }

    const { rows: releases } = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM work_token_ledger_entries e
       JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
       WHERE w.freelancer_user_id IN ($1,$2) AND e.event_type = 'PRIORITY_BID_RELEASE'`,
      [a.id, b.id],
    );
    // Exactly one release per losing/cancelled reservation (not double)
    if (after.status === "resolved") {
      assert.equal(releases[0].c, 1); // only A released
    } else {
      assert.equal(releases[0].c, 2); // A and B released once each
    }
    await setEngines({ workTokens: false, priority: false });
  });

  it("Phase 6.1: concurrent increases 100→180 and 100→220 converge to 220", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 500);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      bidTokens: 100,
    });

    const raced = await Promise.allSettled([
      priorityAuction.increasePriorityBid({
        auctionId: auction.id,
        freelancerUserId: f.id,
        newBidTokens: 180,
      }),
      priorityAuction.increasePriorityBid({
        auctionId: auction.id,
        freelancerUserId: f.id,
        newBidTokens: 220,
      }),
    ]);

    const fulfilled = raced.filter((r) => r.status === "fulfilled");
    assert.ok(fulfilled.length >= 1);
    // Stale lower increase may reject with DECREASE_NOT_ALLOWED after higher wins
    const rejected = raced.filter((r) => r.status === "rejected");
    for (const r of rejected) {
      assert.equal(
        r.reason?.publicCode,
        PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_DECREASE_NOT_ALLOWED,
      );
    }

    const bids = await priorityAuction.listAuctionBids(auction.id);
    assert.equal(bids.length, 1);
    assert.equal(bids[0].bidTokens, 220);

    const snap = await walletSnap(f.id);
    assert.equal(snap.reservedTokens, 220);
    assert.equal(snap.availableTokens, 280);

    const { rows: res } = await pool.query(
      `SELECT reserved_tokens, status FROM work_token_reservations WHERE id = $1`,
      [bids[0].reservationId],
    );
    assert.equal(Number(res[0].reserved_tokens), 220);
    assert.equal(res[0].status, "active");

    const { rows: used } = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles c
       JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.freelancer_user_id = $1 AND c.status = 'active'`,
      [f.id],
    );
    assert.equal(Number(used[0].priority_bid_uses_consumed), 1);

    const { rows: incLedger } = await pool.query(
      `SELECT amount_tokens::int AS amt
       FROM work_token_ledger_entries e
       JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
       WHERE w.freelancer_user_id = $1 AND e.event_type = 'PRIORITY_BID_INCREASE_RESERVE'
       ORDER BY e.id ASC`,
      [f.id],
    );
    const deltaSum = incLedger.reduce((s, r) => s + Number(r.amt), 0);
    assert.equal(deltaSum, 120); // 100 → 220
    await setEngines({ workTokens: false, priority: false });
  });

  it("Phase 6.1: stale lower increase after higher increase is rejected", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 500);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      bidTokens: 100,
    });
    await priorityAuction.increasePriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      newBidTokens: 220,
    });
    await assert.rejects(
      () =>
        priorityAuction.increasePriorityBid({
          auctionId: auction.id,
          freelancerUserId: f.id,
          newBidTokens: 180,
        }),
      (err) => err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_DECREASE_NOT_ALLOWED,
    );
    const bids = await priorityAuction.listAuctionBids(auction.id);
    assert.equal(bids[0].bidTokens, 220);
    assert.equal((await walletSnap(f.id)).reservedTokens, 220);
    await setEngines({ workTokens: false, priority: false });
  });

  it("Phase 6.1: increase idempotency key does not double-reserve", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 500);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    const submitted = await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      bidTokens: 100,
    });
    const first = await priorityAuction.increasePriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      newBidTokens: 180,
    });
    assert.equal(first.skipped, false);
    const second = await priorityAuction.increasePriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      newBidTokens: 180,
    });
    assert.equal(second.skipped, true);
    assert.equal(second.bid.bidTokens, 180);
    assert.equal((await walletSnap(f.id)).reservedTokens, 180);
    assert.equal((await walletSnap(f.id)).availableTokens, 320);

    const { rows: incLedger } = await pool.query(
      `SELECT COUNT(*)::int AS c, COALESCE(SUM(amount_tokens),0)::int AS sum
       FROM work_token_ledger_entries e
       JOIN freelancer_work_token_wallets w ON w.id = e.wallet_id
       WHERE w.freelancer_user_id = $1 AND e.event_type = 'PRIORITY_BID_INCREASE_RESERVE'`,
      [f.id],
    );
    assert.equal(incLedger[0].c, 1);
    assert.equal(incLedger[0].sum, 80);
    assert.equal(String(submitted.bid.id), String(second.bid.id));
    await setEngines({ workTokens: false, priority: false });
  });

  it("Phase 6.1: increase rejected once auction is resolving/resolved", async () => {
    await setEngines({ workTokens: true, priority: true });
    const f = await seedUser("freelancer");
    await activateMembership(f.id, planId);
    await credit(f.id, 400);
    const order = await createOrder(admin.id);
    const auction = await createAuctionForOrder(order.id, admin.id);
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: f.id,
      bidTokens: 100,
    });
    await forceAuctionEnded(auction.id);
    await priorityAuction.resolvePriorityAuction({ auctionId: auction.id });
    await assert.rejects(
      () =>
        priorityAuction.increasePriorityBid({
          auctionId: auction.id,
          freelancerUserId: f.id,
          newBidTokens: 150,
        }),
      (err) =>
        err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_ACTIVE ||
        err.publicCode === PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_CLOSED,
    );
    await setEngines({ workTokens: false, priority: false });
  });
});
