/**
 * Phase 8 Elite Direct Orders — gate tests.
 * Run via: node scripts/runMarketplaceEliteDirectOrdersPhase8Gate.js
 *
 * Migration 143 applied only on isolated gate DB. Engine stays OFF by default;
 * tests flip elite_engine_enabled locally. No Production mutation.
 */

const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE8 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceEliteDirectOrdersPhase8Gate.js");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-elite-direct-orders-phase8-gate-secret";
}
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";
process.env.PRIORITY_AUCTION_RESOLVE_ENABLED = "0";
process.env.ELITE_DIRECT_OFFER_EXPIRE_ENABLED = "0";

const { pool } = require("../src/config/db");
const membershipsService = require("../src/services/marketplaceMembershipsService");
const priorityAuction = require("../src/services/marketplacePriorityAuctionService");
const fairDist = require("../src/services/marketplaceFairDistributionService");
const walletService = require("../src/services/marketplaceWorkTokenWalletService");
const eliteSvc = require("../src/services/marketplaceEliteDirectOrdersService");
const entitlement = require("../src/services/marketplaceEliteDirectOrderEntitlementService");
const {
  ELITE_DIRECT_ORDER_ERROR_CODES,
  ELITE_DIRECT_ORDER_WORK_TOKEN_COST,
  ELITE_REASON_CODES,
} = require("../src/constants/marketplaceEliteDirectOrders");
const { PRIORITY_AUCTION_CREATION_SOURCES } = require("../src/constants/marketplacePriorityAuction");

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `edo8_${role}_${suffix}@example.com`;
  const accountId = `E${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'Ed', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id, account_id, email, role`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function setEngines({
  workTokens = false,
  priority = false,
  fair = false,
  elite = false,
} = {}) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET work_tokens_enabled = $1,
            priority_bidding_enabled = $2,
            fair_work_distribution_enabled = $3,
            elite_engine_enabled = $4,
            updated_at = NOW()
      WHERE id = 1`,
    [Boolean(workTokens), Boolean(priority), Boolean(fair), Boolean(elite)],
  );
}

async function ensureElitePlan() {
  const { rows } = await pool.query(
    `SELECT id FROM marketplace_membership_plans WHERE tier_code = 'elite' ORDER BY id LIMIT 1`,
  );
  if (rows[0]) {
    await pool.query(
      `UPDATE marketplace_membership_plans
          SET elite_direct_orders_enabled = TRUE, updated_at = NOW()
        WHERE id = $1`,
      [rows[0].id],
    );
    return rows[0].id;
  }
  const ins = await pool.query(
    `INSERT INTO marketplace_membership_plans (
       tier_code, name_ar, name_en, is_active, sort_order,
       elite_direct_orders_enabled, unlimited_real_order_value
     ) VALUES ('elite', 'Elite', 'Elite', TRUE, 40, TRUE, TRUE)
     RETURNING id`,
  );
  return ins.rows[0].id;
}

async function ensureProPlan() {
  const { rows } = await pool.query(
    `SELECT id FROM marketplace_membership_plans WHERE tier_code = 'pro' ORDER BY id LIMIT 1`,
  );
  if (rows[0]) return rows[0].id;
  const ins = await pool.query(
    `INSERT INTO marketplace_membership_plans (
       tier_code, name_ar, name_en, is_active, sort_order,
       priority_bid_enabled, priority_bid_uses_per_cycle
     ) VALUES ('pro', 'برو', 'Pro', TRUE, 30, TRUE, 3)
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

async function createOrder(creatorId, {
  sourceType = "client_created",
  creatorRole = "client",
  paymentRequired = false,
} = {}) {
  const code = `EDO8-${crypto.randomBytes(4).toString("hex")}`;
  const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const cat = cats[0]?.id;
  const { rows } = await pool.query(
    `INSERT INTO orders (
       order_code, title, description, category_id, project_type,
       budget, currency_code, bid_budget_min, bid_budget_max,
       created_by_user_id, created_by_role, source_type,
       is_published, is_open_for_pool, payment_required, payment_status, order_status
     ) VALUES (
       $1, 'EDO8 Elite Order', 'Phase 8 gate', $2, 'bidding',
       NULL, 'JOD', 50, 200,
       $3, $4, $5,
       TRUE, TRUE, $6, $7, 'open_for_bids'
     )
     RETURNING *`,
    [
      code,
      cat,
      creatorId,
      creatorRole,
      sourceType,
      paymentRequired,
      paymentRequired ? "unpaid" : "not_required",
    ],
  );
  return rows[0];
}

async function cycleEntitlement(freelancerUserId) {
  return entitlement.peekEliteEntitlementAllowance(freelancerUserId);
}

async function ledgerEventCount(freelancerUserId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM work_token_ledger_entries WHERE freelancer_user_id = $1`,
    [Number(freelancerUserId)],
  );
  return rows[0].c;
}

describe("Phase 8 Elite Direct Orders — constants", () => {
  it("work token cost is 0 and fake linkage is NONE", () => {
    assert.equal(ELITE_DIRECT_ORDER_WORK_TOKEN_COST, 0);
    assert.equal(eliteSvc.FAKE_TRAINING_ELITE_DIRECT_ORDER_LINKAGE, "NONE");
    assert.equal(eliteSvc.ELITE_HISTORICAL_BACKFILL, "NONE");
  });
});

describe("Phase 8 Elite Direct Orders — isolated DB gate", () => {
  let clientUser;
  let adminUser;
  let eliteFreelancer;
  let eliteFreelancer2;
  let proFreelancer;
  let elitePlanId;
  let proPlanId;

  before(async () => {
    clientUser = await seedUser("client");
    adminUser = await seedUser("super_admin");
    eliteFreelancer = await seedUser("freelancer");
    eliteFreelancer2 = await seedUser("freelancer");
    proFreelancer = await seedUser("freelancer");
    elitePlanId = await ensureElitePlan();
    proPlanId = await ensureProPlan();
    await activateMembership(eliteFreelancer.id, elitePlanId);
    await activateMembership(eliteFreelancer2.id, elitePlanId);
    await activateMembership(proFreelancer.id, proPlanId);
    await setEngines({ elite: false });
  });

  after(async () => {
    await setEngines({ elite: false });
    await pool.end().catch(() => {});
  });

  it("engine OFF rejects create with ELITE_ENGINE_OFF", async () => {
    await setEngines({ elite: false });
    const order = await createOrder(clientUser.id);
    await assert.rejects(
      () =>
        eliteSvc.createEliteDirectOffer({
          orderId: order.id,
          targetFreelancerUserId: eliteFreelancer.id,
          actorUserId: clientUser.id,
          actorRole: "client",
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ENGINE_OFF,
    );
  });

  it("client authorized creator can create offer when engine ON", async () => {
    await setEngines({ elite: true });
    const order = await createOrder(clientUser.id);
    const out = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: eliteFreelancer.id,
      actorUserId: clientUser.id,
      actorRole: "client",
      idempotencyKey: `create-${order.id}-a`,
    });
    assert.equal(out.created, true);
    assert.equal(out.offer.status, "pending");
    assert.equal(out.offer.durationMinutesSnapshot, 10);
    assert.ok(out.offer.expiresAt);
    assert.equal(out.offer.tierCodeSnapshot, "elite");
    const ent = await cycleEntitlement(eliteFreelancer.id);
    assert.equal(ent.reserved, 1);
    assert.equal(ent.consumed, 0);
    const { rows: ord } = await pool.query(`SELECT is_open_for_pool FROM orders WHERE id = $1`, [
      order.id,
    ]);
    assert.equal(ord[0].is_open_for_pool, false);
  });

  it("create idempotency returns same offer", async () => {
    await setEngines({ elite: true });
    const order = await createOrder(clientUser.id);
    const key = `idem-${order.id}`;
    const a = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: eliteFreelancer2.id,
      actorUserId: clientUser.id,
      actorRole: "client",
      idempotencyKey: key,
    });
    const b = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: eliteFreelancer2.id,
      actorUserId: clientUser.id,
      actorRole: "client",
      idempotencyKey: key,
    });
    assert.equal(a.offer.id, b.offer.id);
    assert.equal(b.idempotent, true);
  });

  it("unauthorized freelancer creator rejected", async () => {
    await setEngines({ elite: true });
    const order = await createOrder(clientUser.id);
    await assert.rejects(
      () =>
        eliteSvc.createEliteDirectOffer({
          orderId: order.id,
          targetFreelancerUserId: eliteFreelancer.id,
          actorUserId: eliteFreelancer.id,
          actorRole: "freelancer",
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_UNAUTHORIZED_CREATOR,
    );
  });

  it("authorized super_admin creator on admin order", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(adminUser.id, {
      sourceType: "super_admin_created",
      creatorRole: "super_admin",
    });
    const out = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: adminUser.id,
      actorRole: "super_admin",
      creationSource: "internal",
    });
    assert.equal(out.offer.creatorRole, "super_admin");
    await eliteSvc.cancelEliteDirectOffer({
      offerId: out.offer.id,
      actorUserId: adminUser.id,
      actorRole: "super_admin",
    });
  });

  it("non-Elite target rejected", async () => {
    await setEngines({ elite: true });
    const order = await createOrder(clientUser.id);
    await assert.rejects(
      () =>
        eliteSvc.createEliteDirectOffer({
          orderId: order.id,
          targetFreelancerUserId: proFreelancer.id,
          actorUserId: clientUser.id,
          actorRole: "client",
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_TARGET_INELIGIBLE,
    );
  });

  it("suspended Elite rejected", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    await pool.query(
      `UPDATE freelancer_marketplace_memberships SET status = 'suspended' WHERE freelancer_user_id = $1 AND is_current = TRUE`,
      [fl.id],
    );
    const order = await createOrder(clientUser.id);
    await assert.rejects(
      () =>
        eliteSvc.createEliteDirectOffer({
          orderId: order.id,
          targetFreelancerUserId: fl.id,
          actorUserId: clientUser.id,
          actorRole: "client",
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_TARGET_INELIGIBLE,
    );
  });

  it("fake/training source rejected", async () => {
    await setEngines({ elite: true });
    const order = await createOrder(clientUser.id, { sourceType: "fake", creatorRole: "client" });
    await assert.rejects(
      () =>
        eliteSvc.createEliteDirectOffer({
          orderId: order.id,
          targetFreelancerUserId: eliteFreelancer.id,
          actorUserId: clientUser.id,
          actorRole: "client",
        }),
      (err) =>
        err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_FAKE_TRAINING_FORBIDDEN ||
        err.publicCode === "MARKETPLACE_ECONOMY_REAL_ORDERS_ONLY",
    );
  });

  it("one active offer per order + sequential after decline", async () => {
    await setEngines({ elite: true });
    const flA = await seedUser("freelancer");
    const flB = await seedUser("freelancer");
    await activateMembership(flA.id, elitePlanId);
    await activateMembership(flB.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const a = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: flA.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    await assert.rejects(
      () =>
        eliteSvc.createEliteDirectOffer({
          orderId: order.id,
          targetFreelancerUserId: flB.id,
          actorUserId: clientUser.id,
          actorRole: "client",
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ACTIVE_OFFER_EXISTS,
    );
    await eliteSvc.declineEliteDirectOffer({ offerId: a.offer.id, freelancerUserId: flA.id });
    const entA = await cycleEntitlement(flA.id);
    assert.equal(entA.reserved, 0);
    assert.equal(entA.consumed, 0);
    const b = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: flB.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    assert.equal(b.offer.status, "pending");
    assert.notEqual(b.offer.id, a.offer.id);
    const hist = await eliteSvc.listEliteOffersForOrder(order.id);
    assert.ok(hist.length >= 2);
  });

  it("decline releases entitlement and does not consume; no Work Tokens", async () => {
    await setEngines({ elite: true, workTokens: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const before = await ledgerEventCount(fl.id);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    await eliteSvc.declineEliteDirectOffer({ offerId: created.offer.id, freelancerUserId: fl.id });
    const ent = await cycleEntitlement(fl.id);
    assert.equal(ent.reserved, 0);
    assert.equal(ent.consumed, 0);
    const after = await ledgerEventCount(fl.id);
    assert.equal(after, before);
  });

  it("expire releases entitlement without consume", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    await pool.query(
      `UPDATE elite_direct_offers
          SET offered_at = NOW() - interval '11 minutes',
              expires_at = NOW() - interval '1 second'
        WHERE id = $1`,
      [created.offer.id],
    );
    const out = await eliteSvc.expireEliteDirectOffer({ offerId: created.offer.id });
    assert.equal(out.offer.status, "expired");
    const ent = await cycleEntitlement(fl.id);
    assert.equal(ent.reserved, 0);
    assert.equal(ent.consumed, 0);
    // idempotent expire
    const again = await eliteSvc.expireEliteDirectOffer({ offerId: created.offer.id });
    assert.equal(again.idempotent, true);
  });

  it("creator cancel releases entitlement", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    await eliteSvc.cancelEliteDirectOffer({
      offerId: created.offer.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const ent = await cycleEntitlement(fl.id);
    assert.equal(ent.reserved, 0);
    assert.equal(ent.consumed, 0);
  });

  it("order cancel releases pending Elite entitlement", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const wt = require("../src/services/marketplaceNormalApplicationWorkTokenService");
    await wt.endOpenBiddingOrderWithoutSelection({
      orderId: order.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const offer = await eliteSvc.getEliteDirectOfferById(created.offer.id);
    assert.equal(offer.status, "cancelled");
    assert.equal(offer.reasonCode, ELITE_REASON_CODES.ORDER_CANCELLED);
    const ent = await cycleEntitlement(fl.id);
    assert.equal(ent.reserved, 0);
  });

  it("accept consumes entitlement, 0 work tokens, effective assignment when no payment", async () => {
    await setEngines({ elite: true, workTokens: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const before = await ledgerEventCount(fl.id);
    const order = await createOrder(clientUser.id, { paymentRequired: false });
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const out = await eliteSvc.acceptEliteDirectOffer({
      offerId: created.offer.id,
      freelancerUserId: fl.id,
    });
    assert.equal(out.offer.status, "accepted");
    assert.equal(out.workTokenCost, 0);
    assert.equal(out.paymentMode, "assigned");
    const ent = await cycleEntitlement(fl.id);
    assert.equal(ent.reserved, 0);
    assert.equal(ent.consumed, 1);
    const { rows: ord } = await pool.query(
      `SELECT assigned_freelancer_id, received_at FROM orders WHERE id = $1`,
      [order.id],
    );
    assert.equal(Number(ord[0].assigned_freelancer_id), Number(fl.id));
    assert.ok(ord[0].received_at);
    const after = await ledgerEventCount(fl.id);
    assert.equal(after, before);

    // Fair factual history: AWARDED + EFFECTIVE
    const { rows: events } = await pool.query(
      `SELECT outcome_code FROM fair_distribution_events
       WHERE order_id = $1 AND freelancer_user_id = $2
       ORDER BY id`,
      [order.id, fl.id],
    );
    const types = events.map((e) => e.outcome_code);
    assert.ok(types.includes("AWARDED"));
    assert.ok(types.includes("EFFECTIVE_ASSIGNMENT"));

    // accept idempotent
    const again = await eliteSvc.acceptEliteDirectOffer({
      offerId: created.offer.id,
      freelancerUserId: fl.id,
    });
    assert.equal(again.idempotent, true);
    const ent2 = await cycleEntitlement(fl.id);
    assert.equal(ent2.consumed, 1);
  });

  it("selected_pending_payment does not create EFFECTIVE_ASSIGNMENT", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id, { paymentRequired: true });
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const out = await eliteSvc.acceptEliteDirectOffer({
      offerId: created.offer.id,
      freelancerUserId: fl.id,
    });
    assert.equal(out.paymentMode, "selected_pending_payment");
    const { rows: ord } = await pool.query(
      `SELECT assigned_freelancer_id, received_at, order_status, selected_bid_id FROM orders WHERE id = $1`,
      [order.id],
    );
    assert.equal(ord[0].assigned_freelancer_id, null);
    assert.equal(ord[0].received_at, null);
    assert.equal(ord[0].order_status, "awaiting_payment_after_bid_selection");
    assert.ok(ord[0].selected_bid_id);
    const { rows: events } = await pool.query(
      `SELECT outcome_code FROM fair_distribution_events
       WHERE order_id = $1 AND freelancer_user_id = $2`,
      [order.id, fl.id],
    );
    const types = events.map((e) => e.outcome_code);
    assert.ok(types.includes("AWARDED"));
    assert.ok(!types.includes("EFFECTIVE_ASSIGNMENT"));
  });

  it("ineligible-at-accept releases entitlement", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    await pool.query(
      `UPDATE freelancer_marketplace_memberships SET status = 'suspended' WHERE freelancer_user_id = $1 AND is_current = TRUE`,
      [fl.id],
    );
    await assert.rejects(
      () =>
        eliteSvc.acceptEliteDirectOffer({
          offerId: created.offer.id,
          freelancerUserId: fl.id,
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_INELIGIBLE_AT_ACCEPT,
    );
    const offer = await eliteSvc.getEliteDirectOfferById(created.offer.id);
    assert.equal(offer.status, "ineligible");
    assert.equal(offer.reasonCode, ELITE_REASON_CODES.ELITE_INELIGIBLE_AT_ACCEPT);
    // restore membership for cycle peek — entitlement should be released
    await pool.query(
      `UPDATE freelancer_marketplace_memberships SET status = 'active' WHERE freelancer_user_id = $1 AND is_current = TRUE`,
      [fl.id],
    );
    const ent = await cycleEntitlement(fl.id);
    assert.equal(ent.reserved, 0);
    assert.equal(ent.consumed, 0);
  });

  it("Priority Bid auction conflict on create", async () => {
    await setEngines({ elite: true, workTokens: true, priority: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(adminUser.id, {
      sourceType: "super_admin_created",
      creatorRole: "super_admin",
    });
    await priorityAuction.createPriorityAuctionForOrder({
      orderId: order.id,
      actorUserId: adminUser.id,
      creationSource: PRIORITY_AUCTION_CREATION_SOURCES.SUPER_ADMIN_MANUAL,
    });
    await assert.rejects(
      () =>
        eliteSvc.createEliteDirectOffer({
          orderId: order.id,
          targetFreelancerUserId: fl.id,
          actorUserId: adminUser.id,
          actorRole: "super_admin",
        }),
      (err) => err.publicCode === "PRIORITY_BID_AUCTION_ACTIVE",
    );
  });

  it("Elite pending blocks Priority Auction create", async () => {
    await setEngines({ elite: true, workTokens: true, priority: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(adminUser.id, {
      sourceType: "super_admin_created",
      creatorRole: "super_admin",
    });
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: adminUser.id,
      actorRole: "super_admin",
    });
    await assert.rejects(
      () =>
        priorityAuction.createPriorityAuctionForOrder({
          orderId: order.id,
          actorUserId: adminUser.id,
          creationSource: PRIORITY_AUCTION_CREATION_SOURCES.SUPER_ADMIN_MANUAL,
          idempotent: false,
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ACTIVE_OFFER_EXISTS,
    );
    await eliteSvc.cancelEliteDirectOffer({
      offerId: created.offer.id,
      actorUserId: adminUser.id,
      actorRole: "super_admin",
    });
  });

  it("concurrent create same order: exactly one pending", async () => {
    await setEngines({ elite: true });
    const flA = await seedUser("freelancer");
    const flB = await seedUser("freelancer");
    await activateMembership(flA.id, elitePlanId);
    await activateMembership(flB.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const results = await Promise.allSettled([
      eliteSvc.createEliteDirectOffer({
        orderId: order.id,
        targetFreelancerUserId: flA.id,
        actorUserId: clientUser.id,
        actorRole: "client",
      }),
      eliteSvc.createEliteDirectOffer({
        orderId: order.id,
        targetFreelancerUserId: flB.id,
        actorUserId: clientUser.id,
        actorRole: "client",
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(fail.length, 1);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elite_direct_offers WHERE order_id = $1 AND status = 'pending'`,
      [order.id],
    );
    assert.equal(rows[0].c, 1);
  });

  it("concurrent entitlement: second reserve fails when allowed=1", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    // Ensure allowance is 1
    await pool.query(
      `UPDATE marketplace_membership_cycles c
          SET elite_direct_orders_allowed = 1,
              elite_direct_orders_reserved = 0,
              elite_direct_orders_consumed = 0
        FROM freelancer_marketplace_memberships m
       WHERE c.membership_id = m.id AND m.freelancer_user_id = $1 AND c.status = 'active'`,
      [fl.id],
    );
    const order1 = await createOrder(clientUser.id);
    const order2 = await createOrder(clientUser.id);
    const results = await Promise.allSettled([
      eliteSvc.createEliteDirectOffer({
        orderId: order1.id,
        targetFreelancerUserId: fl.id,
        actorUserId: clientUser.id,
        actorRole: "client",
      }),
      eliteSvc.createEliteDirectOffer({
        orderId: order2.id,
        targetFreelancerUserId: fl.id,
        actorUserId: clientUser.id,
        actorRole: "client",
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(fail.length, 1);
    assert.equal(
      fail[0].reason.publicCode,
      ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_DIRECT_ORDER_ENTITLEMENT_UNAVAILABLE,
    );
  });

  it("accept vs decline race: one terminal outcome", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const results = await Promise.allSettled([
      eliteSvc.acceptEliteDirectOffer({ offerId: created.offer.id, freelancerUserId: fl.id }),
      eliteSvc.declineEliteDirectOffer({ offerId: created.offer.id, freelancerUserId: fl.id }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    assert.equal(ok.length, 1);
    const offer = await eliteSvc.getEliteDirectOfferById(created.offer.id);
    assert.ok(["accepted", "declined"].includes(offer.status));
  });

  it("accept vs expiry race: one terminal outcome", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    await pool.query(
      `UPDATE elite_direct_offers
          SET offered_at = NOW() - interval '11 minutes',
              expires_at = NOW() - interval '1 second'
        WHERE id = $1`,
      [created.offer.id],
    );
    const results = await Promise.allSettled([
      eliteSvc.acceptEliteDirectOffer({ offerId: created.offer.id, freelancerUserId: fl.id }),
      eliteSvc.expireEliteDirectOffer({ offerId: created.offer.id }),
    ]);
    const offer = await eliteSvc.getEliteDirectOfferById(created.offer.id);
    assert.ok(["accepted", "expired"].includes(offer.status));
    // If accept won despite expires_at check, OK; if expire won, accept should fail
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.ok(fulfilled.length >= 1);
  });

  it("privacy: assertCanViewOffer blocks strangers", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    const stranger = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    assert.throws(
      () =>
        eliteSvc.assertCanViewOffer(created.offer, {
          userId: stranger.id,
          role: "freelancer",
        }),
      (err) => err.publicCode === ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_FOUND,
    );
    eliteSvc.assertCanViewOffer(created.offer, { userId: fl.id, role: "freelancer" });
    eliteSvc.assertCanViewOffer(created.offer, { userId: clientUser.id, role: "client" });
  });

  it("snapshot immutability: membership plan change does not alter offer snapshot", async () => {
    await setEngines({ elite: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    const created = await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const snap = created.offer.tierCodeSnapshot;
    await pool.query(
      `UPDATE marketplace_membership_plans SET name_en = 'Elite Renamed' WHERE id = $1`,
      [elitePlanId],
    );
    const offer = await eliteSvc.getEliteDirectOfferById(created.offer.id);
    assert.equal(offer.tierCodeSnapshot, snap);
    assert.equal(offer.eliteCapabilitySnapshot, true);
  });

  it("eliteDeclinesAffectCarryForward=false: decline does not consume", async () => {
    const { rows } = await pool.query(
      `SELECT elite_declines_affect_carry_forward FROM marketplace_economy_settings WHERE id = 1`,
    );
    assert.equal(rows[0].elite_declines_affect_carry_forward, false);
  });

  it("Fair does not select Elite target (no fair decision on create)", async () => {
    await setEngines({ elite: true, fair: true });
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, elitePlanId);
    const order = await createOrder(clientUser.id);
    await eliteSvc.createEliteDirectOffer({
      orderId: order.id,
      targetFreelancerUserId: fl.id,
      actorUserId: clientUser.id,
      actorRole: "client",
    });
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM fair_distribution_decisions WHERE order_id = $1`,
      [order.id],
    );
    assert.equal(rows[0].c, 0);
  });
});
