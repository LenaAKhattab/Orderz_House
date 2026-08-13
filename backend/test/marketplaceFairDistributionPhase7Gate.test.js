/**
 * Phase 7 Fair Distribution — lexicographic COUNT-ONLY queue gate.
 * Run via: node scripts/runMarketplaceFairDistributionPhase7Gate.js
 *
 * NO numeric fairness_score. Migration 142 applied only on isolated gate DB.
 */

const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const { FREELANCER_FORBIDDEN_FAIRNESS_FIELDS } = require("../src/constants/marketplaceEconomy");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE7 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceFairDistributionPhase7Gate.js");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-fair-distribution-phase7-gate-secret";
}
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";
process.env.PRIORITY_AUCTION_RESOLVE_ENABLED = "0";

const { pool } = require("../src/config/db");
const walletService = require("../src/services/marketplaceWorkTokenWalletService");
const membershipsService = require("../src/services/marketplaceMembershipsService");
const priorityAuction = require("../src/services/marketplacePriorityAuctionService");
const fairDist = require("../src/services/marketplaceFairDistributionService");
const { mergePatch, MARKETPLACE_ECONOMY_DEFAULTS } = require("../src/services/marketplaceEconomySettingsService");
const { PRIORITY_AUCTION_CREATION_SOURCES } = require("../src/constants/marketplacePriorityAuction");
const {
  FAIR_DISTRIBUTION_ERROR_CODES,
} = require("../src/constants/marketplaceFairDistribution");

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `fd7_${role}_${suffix}@example.com`;
  const accountId = `F${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'Fd', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id, account_id, email, role`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function setEngines({
  workTokens = false,
  priority = false,
  fair = false,
  assignmentStrategy = "HIGHEST_TOKEN_ONLY",
  priorityStrategy = "HIGHEST_TOKEN_ONLY",
  lookbackDays = 30,
} = {}) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET work_tokens_enabled = $1,
            priority_bidding_enabled = $2,
            fair_work_distribution_enabled = $3,
            assignment_strategy = $4,
            priority_bid_assignment_strategy = $5,
            fair_distribution_lookback_days = $6,
            updated_at = NOW()
      WHERE id = 1`,
    [
      Boolean(workTokens),
      Boolean(priority),
      Boolean(fair),
      assignmentStrategy,
      priorityStrategy,
      Number(lookbackDays),
    ],
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
    referenceId: `fd7-seed-${freelancerUserId}-${crypto.randomBytes(3).toString("hex")}`,
    idempotencyKey: `fd7-credit-${freelancerUserId}-${crypto.randomBytes(4).toString("hex")}`,
  });
}

async function ensureCategories() {
  let catY = await pool.query(`SELECT id FROM categories WHERE slug = 'fair-y' LIMIT 1`);
  if (!catY.rows[0]) {
    catY = await pool.query(
      `INSERT INTO categories (slug, name, description)
       VALUES ('fair-y', 'Fair Y', 'Phase 7 category Y')
       RETURNING id`,
    );
  }
  let catX = await pool.query(`SELECT id FROM categories WHERE slug = 'fair-x' LIMIT 1`);
  if (!catX.rows[0]) {
    catX = await pool.query(
      `INSERT INTO categories (slug, name, description)
       VALUES ('fair-x', 'Fair X', 'Phase 7 category X')
       RETURNING id`,
    );
  }
  const yId = catY.rows[0].id;
  const xId = catX.rows[0].id;

  let sub = await pool.query(
    `SELECT id FROM subcategories WHERE category_id = $1 AND slug = 'fair-y-sub' LIMIT 1`,
    [yId],
  );
  if (!sub.rows[0]) {
    // subcategories may or may not exist in gate schema
    try {
      sub = await pool.query(
        `INSERT INTO subcategories (category_id, slug, name, description)
         VALUES ($1, 'fair-y-sub', 'Fair Y Sub', 'sub')
         RETURNING id`,
        [yId],
      );
    } catch {
      sub = { rows: [] };
    }
  }
  return { categoryY: yId, categoryX: xId, subcategoryY: sub.rows[0]?.id || null };
}

async function createOrder(creatorId, { categoryId, subcategoryId = null } = {}) {
  const code = `FD7-${crypto.randomBytes(4).toString("hex")}`;
  const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  const cat = categoryId || cats[0]?.id;
  if (subcategoryId) {
    const { rows } = await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, subcategory_id, project_type,
         budget, currency_code, bid_budget_min, bid_budget_max,
         created_by_user_id, created_by_role, source_type,
         is_published, is_open_for_pool, payment_required, payment_status, order_status
       ) VALUES (
         $1, 'FD7 Fair Order', 'Phase 7 gate', $2, $3, 'bidding',
         NULL, 'JOD', 10, 100,
         $4, 'super_admin', 'super_admin_created',
         TRUE, TRUE, FALSE, 'not_required', 'open_for_bids'
       ) RETURNING *`,
      [code, cat, subcategoryId, creatorId],
    );
    return rows[0];
  }
  const { rows } = await pool.query(
    `INSERT INTO orders (
       order_code, title, description, category_id, project_type,
       budget, currency_code, bid_budget_min, bid_budget_max,
       created_by_user_id, created_by_role, source_type,
       is_published, is_open_for_pool, payment_required, payment_status, order_status
     ) VALUES (
       $1, 'FD7 Fair Order', 'Phase 7 gate', $2, 'bidding',
       NULL, 'JOD', 10, 100,
       $3, 'super_admin', 'super_admin_created',
       TRUE, TRUE, FALSE, 'not_required', 'open_for_bids'
     ) RETURNING *`,
    [code, cat, creatorId],
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

function cand(partial) {
  return {
    freelancerUserId: partial.freelancerUserId,
    candidateKey: partial.candidateKey || `c:${partial.freelancerUserId}`,
    stableId: String(partial.stableId || partial.freelancerUserId),
    eligible: true,
    recentEffectiveAssignmentsCount: partial.recent ?? 0,
    appliedAndLostWaitingCount: partial.losses ?? 0,
    activeWorkloadCount: partial.workload ?? 0,
    lastEffectiveAssignmentAt: partial.last ?? null,
    priorityBidTokens: partial.tokens ?? null,
    submittedAt: partial.submittedAt || "2026-01-01T00:00:00.000Z",
  };
}

describe("Phase 7 Fair Distribution — lexicographic unit ranking", () => {
  it("recent assignments ASC is first key (A before B)", () => {
    const A = cand({ freelancerUserId: 1, recent: 0, losses: 1, workload: 0, last: null });
    const B = cand({
      freelancerUserId: 2,
      recent: 1,
      losses: 5,
      workload: 0,
      last: "2025-01-01T00:00:00.000Z",
    });
    const ranked = fairDist.rankFairDistributionCandidates([B, A], { includePriorityTokens: false });
    assert.equal(ranked[0].freelancerUserId, 1);
  });

  it("waiting losses DESC when recent equal", () => {
    const A = cand({ freelancerUserId: 1, recent: 1, losses: 3 });
    const B = cand({ freelancerUserId: 2, recent: 1, losses: 1 });
    const ranked = fairDist.rankFairDistributionCandidates([B, A]);
    assert.equal(ranked[0].freelancerUserId, 1);
  });

  it("active workload ASC when assignments+losses equal", () => {
    const A = cand({ freelancerUserId: 1, recent: 1, losses: 1, workload: 0 });
    const B = cand({ freelancerUserId: 2, recent: 1, losses: 1, workload: 2 });
    const ranked = fairDist.rankFairDistributionCandidates([B, A]);
    assert.equal(ranked[0].freelancerUserId, 1);
  });

  it("recency ASC NULLS FIRST", () => {
    const older = cand({
      freelancerUserId: 1,
      recent: 1,
      losses: 1,
      workload: 0,
      last: "2026-01-01T00:00:00.000Z",
    });
    const newer = cand({
      freelancerUserId: 2,
      recent: 1,
      losses: 1,
      workload: 0,
      last: "2026-08-06T00:00:00.000Z",
    });
    const never = cand({
      freelancerUserId: 3,
      recent: 0,
      losses: 1,
      workload: 0,
      last: null,
    });
    // For recency-only compare, equalize recent first
    older.recentEffectiveAssignmentsCount = 0;
    newer.recentEffectiveAssignmentsCount = 0;
    never.recentEffectiveAssignmentsCount = 0;
    const ranked = fairDist.rankFairDistributionCandidates([newer, older, never]);
    assert.equal(ranked[0].freelancerUserId, 3);
    assert.equal(ranked[1].freelancerUserId, 1);
    assert.equal(ranked[2].freelancerUserId, 2);
  });

  it("Priority tokens only after fairness keys (fair-first)", () => {
    const A = cand({
      freelancerUserId: 1,
      recent: 0,
      losses: 0,
      workload: 0,
      tokens: 100,
    });
    const B = cand({
      freelancerUserId: 2,
      recent: 2,
      losses: 0,
      workload: 0,
      tokens: 500,
    });
    const ranked = fairDist.rankFairDistributionCandidates([B, A], { includePriorityTokens: true });
    assert.equal(ranked[0].freelancerUserId, 1);
  });

  it("Priority token tie-break when fairness equal", () => {
    const A = cand({ freelancerUserId: 1, recent: 0, losses: 0, workload: 0, tokens: 100 });
    const B = cand({ freelancerUserId: 2, recent: 0, losses: 0, workload: 0, tokens: 150 });
    const ranked = fairDist.rankFairDistributionCandidates([A, B], { includePriorityTokens: true });
    assert.equal(ranked[0].freelancerUserId, 2);
  });

  it("no fairness_score field on ranked candidates", () => {
    const A = cand({ freelancerUserId: 1 });
    const ranked = fairDist.rankFairDistributionCandidates([A]);
    assert.equal(Object.prototype.hasOwnProperty.call(ranked[0], "fairnessScore"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(ranked[0], "fairness_score"), false);
  });

  it("HYBRID mergePatch rejects with FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED", () => {
    assert.throws(
      () => mergePatch(MARKETPLACE_ECONOMY_DEFAULTS, { assignmentStrategy: "HYBRID" }),
      (err) =>
        err.publicCode ===
        FAIR_DISTRIBUTION_ERROR_CODES.FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED,
    );
  });

  it("Freelancer privacy scrub removes forbidden fields", () => {
    const dirty = {
      id: "1",
      fairnessScore: 99,
      queuePosition: 3,
      recentEffectiveAssignmentsCount: 2,
      appliedAndLostWaitingCount: 4,
      ok: true,
    };
    const clean = fairDist.scrubFreelancerFairnessLeakage(dirty);
    assert.equal(clean.ok, true);
    assert.equal(clean.fairnessScore, undefined);
    assert.equal(clean.queuePosition, undefined);
    assert.equal(clean.recentEffectiveAssignmentsCount, undefined);
    for (const f of FREELANCER_FORBIDDEN_FAIRNESS_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(clean, f), false);
    }
    assert.throws(() =>
      fairDist.assertNoFreelancerFairnessLeakage({ fairness_score: 1 }),
    );
  });
});

describe("Phase 7 Fair Distribution — isolated DB gate", () => {
  let admin;
  let planId;
  let cats;

  before(async () => {
    admin = await seedUser("super_admin");
    planId = await ensurePlan();
    cats = await ensureCategories();
    await setEngines({ workTokens: false, priority: false, fair: false });
  });

  after(async () => {
    await setEngines({ workTokens: false, priority: false, fair: false });
    // Do not pool.end() here — Phase 7.1 suite shares the same process pool.
  });

  it("schema 142 present: decisions/events/lookback", async () => {
    const ready = await fairDist.fairDistributionSchemaReady(pool);
    assert.equal(ready, true);
    const { rows } = await pool.query(
      `SELECT fair_distribution_lookback_days FROM marketplace_economy_settings WHERE id = 1`,
    );
    assert.equal(Number(rows[0].fair_distribution_lookback_days), 30);
  });

  it("category-aware: Category X history does not reduce Category Y priority", async () => {
    const f = await seedUser("freelancer");
    // Plant effective assignment in Category X
    await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, created_by_user_id, created_by_role, source_type,
         assigned_freelancer_id, received_at, order_status, is_published, is_open_for_pool,
         payment_required, payment_status
       ) VALUES (
         $1, 'hist X', 'x', $2, 'fixed',
         10, 'JOD', $3, 'super_admin', 'super_admin_created',
         $4, NOW() - INTERVAL '2 days', 'completed', TRUE, FALSE,
         FALSE, 'not_required'
       )`,
      [`FD7X-${crypto.randomBytes(3).toString("hex")}`, cats.categoryX, admin.id, f.id],
    );

    const orderY = await createOrder(admin.id, { categoryId: cats.categoryY });
    const metrics = await fairDist.computeCandidateMetrics({
      client: pool,
      freelancerUserId: f.id,
      scope: fairDist.resolveFairnessScope(orderY),
      lookbackDays: 30,
    });
    assert.equal(metrics.recentEffectiveAssignmentsCount, 0);
    assert.equal(metrics.lastEffectiveAssignmentAt, null);
  });

  it("subcategory scope preferred when present", () => {
    if (!cats.subcategoryY) return;
    const scope = fairDist.resolveFairnessScope({
      category_id: cats.categoryY,
      subcategory_id: cats.subcategoryY,
    });
    assert.equal(scope.scopeKind, "subcategory");
    assert.equal(scope.subcategoryId, Number(cats.subcategoryY));
  });

  it("APPLIED_AND_LOST idempotent once per freelancer+order", async () => {
    const loser = await seedUser("freelancer");
    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    const scope = fairDist.resolveFairnessScope(order);
    const once = await fairDist.recordFairDistributionEvent({
      freelancerUserId: loser.id,
      orderId: order.id,
      outcomeCode: "APPLIED_AND_LOST",
      scope,
      referenceType: "test",
      referenceId: "1",
      idempotencyKey: `applied_and_lost:order:${order.id}:freelancer:${loser.id}`,
    });
    assert.equal(once.recorded, true);
    const twice = await fairDist.recordFairDistributionEvent({
      freelancerUserId: loser.id,
      orderId: order.id,
      outcomeCode: "APPLIED_AND_LOST",
      scope,
      referenceType: "test",
      referenceId: "2",
      idempotencyKey: `applied_and_lost:order:${order.id}:freelancer:${loser.id}`,
    });
    assert.equal(twice.idempotent, true);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM fair_distribution_events
       WHERE freelancer_user_id = $1 AND order_id = $2 AND outcome_code = 'APPLIED_AND_LOST'`,
      [loser.id, order.id],
    );
    assert.equal(rows[0].c, 1);
  });

  it("OFFERED_AND_DECLINED does not increase APPLIED_AND_LOST waiting count", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    await fairDist.recordOfferedAndDeclined({
      order,
      freelancerUserId: f.id,
      referenceId: order.id,
    });
    const metrics = await fairDist.computeCandidateMetrics({
      client: pool,
      freelancerUserId: f.id,
      scope: fairDist.resolveFairnessScope(order),
      lookbackDays: 30,
    });
    assert.equal(metrics.appliedAndLostWaitingCount, 0);
  });

  it("freelancer cancel after award does not create APPLIED_AND_LOST; recency remains", async () => {
    const f = await seedUser("freelancer");
    const { rows } = await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, created_by_user_id, created_by_role, source_type,
         assigned_freelancer_id, received_at, order_status, is_published, is_open_for_pool,
         payment_required, payment_status
       ) VALUES (
         $1, 'cancel after', 'c', $2, 'fixed',
         10, 'JOD', $3, 'super_admin', 'super_admin_created',
         $4, NOW() - INTERVAL '1 day', 'cancelled', TRUE, FALSE,
         FALSE, 'not_required'
       ) RETURNING *`,
      [`FD7C-${crypto.randomBytes(3).toString("hex")}`, cats.categoryY, admin.id, f.id],
    );
    const order = rows[0];
    await fairDist.recordFreelancerCancelledAfterAward({
      order,
      freelancerUserId: f.id,
      actorUserId: f.id,
    });
    const lost = await pool.query(
      `SELECT COUNT(*)::int AS c FROM fair_distribution_events
       WHERE freelancer_user_id = $1 AND order_id = $2 AND outcome_code = 'APPLIED_AND_LOST'`,
      [f.id, order.id],
    );
    assert.equal(lost.rows[0].c, 0);
    const metrics = await fairDist.computeCandidateMetrics({
      client: pool,
      freelancerUserId: f.id,
      scope: fairDist.resolveFairnessScope(order),
      lookbackDays: 30,
    });
    assert.ok(metrics.lastEffectiveAssignmentAt);
    assert.equal(metrics.recentEffectiveAssignmentsCount, 1);
  });

  it("client/admin/system cancel before received_at is not effective assignment", async () => {
    const f = await seedUser("freelancer");
    const { rows } = await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, created_by_user_id, created_by_role, source_type,
         assigned_freelancer_id, received_at, order_status, is_published, is_open_for_pool,
         payment_required, payment_status
       ) VALUES (
         $1, 'ext cancel', 'e', $2, 'fixed',
         10, 'JOD', $3, 'super_admin', 'super_admin_created',
         $4, NULL, 'cancelled', TRUE, FALSE,
         FALSE, 'not_required'
       ) RETURNING *`,
      [`FD7E-${crypto.randomBytes(3).toString("hex")}`, cats.categoryY, admin.id, f.id],
    );
    const order = rows[0];
    await fairDist.recordExternalCancellationNeutral({
      order,
      freelancerUserId: f.id,
      actorRole: "admin",
      actorUserId: admin.id,
    });
    const metrics = await fairDist.computeCandidateMetrics({
      client: pool,
      freelancerUserId: f.id,
      scope: fairDist.resolveFairnessScope(order),
      lookbackDays: 30,
    });
    assert.equal(metrics.recentEffectiveAssignmentsCount, 0);
    assert.equal(metrics.lastEffectiveAssignmentAt, null);
  });

  it("decision snapshot immutable after history mutation", async () => {
    const a = await seedUser("freelancer");
    const b = await seedUser("freelancer");
    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    const decision = await fairDist.decideFairDistributionFirst({
      order,
      candidates: [
        {
          freelancerUserId: a.id,
          candidateKey: `app:${a.id}`,
          stableId: String(a.id),
          eligible: true,
          submittedAt: "2026-01-01T00:00:00Z",
          applicationOrBidId: 1,
        },
        {
          freelancerUserId: b.id,
          candidateKey: `app:${b.id}`,
          stableId: String(b.id),
          eligible: true,
          submittedAt: "2026-01-02T00:00:00Z",
          applicationOrBidId: 2,
        },
      ],
      lookbackDays: 30,
      persistDecision: true,
      includePriorityTokens: false,
    });
    assert.ok(decision.decisionId);
    assert.equal(Object.prototype.hasOwnProperty.call(decision.winner, "fairnessScore"), false);

    // Mutate live settings / plant assignment — snapshot must stay
    await setEngines({ lookbackDays: 7, fair: false });
    await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, created_by_user_id, created_by_role, source_type,
         assigned_freelancer_id, received_at, order_status, is_published, is_open_for_pool,
         payment_required, payment_status
       ) VALUES (
         $1, 'mutate', 'm', $2, 'fixed',
         10, 'JOD', $3, 'super_admin', 'super_admin_created',
         $4, NOW(), 'in_progress', TRUE, FALSE,
         FALSE, 'not_required'
       )`,
      [`FD7M-${crypto.randomBytes(3).toString("hex")}`, cats.categoryY, admin.id, a.id],
    );

    const snap = await fairDist.getFairDistributionDecisionByOrderId(order.id);
    assert.equal(snap.lookbackDays, 30);
    assert.equal(snap.candidates[0].recentEffectiveAssignmentsCount, 0);
    assert.equal(snap.humanSummaryEn.includes("%"), false);
  });

  it("engine OFF: Priority resolve ignores Fair ranking (HIGHEST_TOKEN wins)", async () => {
    await setEngines({
      workTokens: true,
      priority: true,
      fair: false,
      priorityStrategy: "FAIR_DISTRIBUTION_FIRST",
    });
    const [a, b] = await Promise.all([seedUser("freelancer"), seedUser("freelancer")]);
    for (const f of [a, b]) {
      // eslint-disable-next-line no-await-in-loop
      await activateMembership(f.id, planId);
      // eslint-disable-next-line no-await-in-loop
      await credit(f.id, 500);
    }
    // Give A better fairness history (zero assignments) vs B (many) — but tokens decide
    await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, created_by_user_id, created_by_role, source_type,
         assigned_freelancer_id, received_at, order_status, is_published, is_open_for_pool,
         payment_required, payment_status
       ) VALUES (
         $1, 'b hist', 'h', $2, 'fixed',
         10, 'JOD', $3, 'super_admin', 'super_admin_created',
         $4, NOW() - INTERVAL '3 days', 'completed', TRUE, FALSE,
         FALSE, 'not_required'
       )`,
      [`FD7H-${crypto.randomBytes(3).toString("hex")}`, cats.categoryY, admin.id, b.id],
    );

    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    const auction = await createAuctionForOrder(order.id, admin.id);
    // Snapshot strategy FAIR but engine OFF → highest token
    await pool.query(
      `UPDATE priority_bid_auctions SET assignment_strategy = 'FAIR_DISTRIBUTION_FIRST' WHERE id = $1`,
      [auction.id],
    );
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
    const resolved = await priorityAuction.resolvePriorityAuction({
      auctionId: auction.id,
      actorUserId: admin.id,
    });
    assert.equal(Number(resolved.winner?.freelancerUserId || resolved.auction?.winner_freelancer_user_id), Number(b.id));
  });

  it("FAIR_DISTRIBUTION_FIRST + engine ON: better fairness beats higher tokens", async () => {
    await setEngines({
      workTokens: true,
      priority: true,
      fair: true,
      priorityStrategy: "FAIR_DISTRIBUTION_FIRST",
      assignmentStrategy: "FAIR_DISTRIBUTION_FIRST",
    });
    const [a, b] = await Promise.all([seedUser("freelancer"), seedUser("freelancer")]);
    for (const f of [a, b]) {
      // eslint-disable-next-line no-await-in-loop
      await activateMembership(f.id, planId);
      // eslint-disable-next-line no-await-in-loop
      await credit(f.id, 600);
    }
    // B has recent assignment in same category → A should win despite lower tokens
    await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, created_by_user_id, created_by_role, source_type,
         assigned_freelancer_id, received_at, order_status, is_published, is_open_for_pool,
         payment_required, payment_status
       ) VALUES (
         $1, 'b recent', 'h', $2, 'fixed',
         10, 'JOD', $3, 'super_admin', 'super_admin_created',
         $4, NOW() - INTERVAL '2 days', 'completed', TRUE, FALSE,
         FALSE, 'not_required'
       )`,
      [`FD7R-${crypto.randomBytes(3).toString("hex")}`, cats.categoryY, admin.id, b.id],
    );

    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    const auction = await createAuctionForOrder(order.id, admin.id);
    await pool.query(
      `UPDATE priority_bid_auctions SET assignment_strategy = 'FAIR_DISTRIBUTION_FIRST' WHERE id = $1`,
      [auction.id],
    );
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 100,
    });
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: b.id,
      bidTokens: 500,
    });
    await forceAuctionEnded(auction.id);
    const resolved = await priorityAuction.resolvePriorityAuction({
      auctionId: auction.id,
      actorUserId: admin.id,
    });
    const winnerId =
      resolved.winner?.freelancer_user_id ||
      resolved.winner?.freelancerUserId ||
      resolved.auction?.winner_freelancer_user_id;
    assert.equal(Number(winnerId), Number(a.id));
  });

  it("FAIR_DISTRIBUTION_FIRST equal fairness → higher Priority Token wins", async () => {
    await setEngines({
      workTokens: true,
      priority: true,
      fair: true,
      priorityStrategy: "FAIR_DISTRIBUTION_FIRST",
    });
    const [a, b] = await Promise.all([seedUser("freelancer"), seedUser("freelancer")]);
    for (const f of [a, b]) {
      // eslint-disable-next-line no-await-in-loop
      await activateMembership(f.id, planId);
      // eslint-disable-next-line no-await-in-loop
      await credit(f.id, 400);
    }
    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    const auction = await createAuctionForOrder(order.id, admin.id);
    await pool.query(
      `UPDATE priority_bid_auctions SET assignment_strategy = 'FAIR_DISTRIBUTION_FIRST' WHERE id = $1`,
      [auction.id],
    );
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
    const resolved = await priorityAuction.resolvePriorityAuction({
      auctionId: auction.id,
      actorUserId: admin.id,
    });
    const winnerId =
      resolved.winner?.freelancer_user_id ||
      resolved.winner?.freelancerUserId ||
      resolved.auction?.winner_freelancer_user_id;
    assert.equal(Number(winnerId), Number(b.id));
  });

  it("HIGHEST_TOKEN_ONLY regression: tokens win regardless of fair history", async () => {
    await setEngines({
      workTokens: true,
      priority: true,
      fair: true,
      priorityStrategy: "HIGHEST_TOKEN_ONLY",
      assignmentStrategy: "HIGHEST_TOKEN_ONLY",
    });
    const [a, b] = await Promise.all([seedUser("freelancer"), seedUser("freelancer")]);
    for (const f of [a, b]) {
      // eslint-disable-next-line no-await-in-loop
      await activateMembership(f.id, planId);
      // eslint-disable-next-line no-await-in-loop
      await credit(f.id, 400);
    }
    await pool.query(
      `INSERT INTO orders (
         order_code, title, description, category_id, project_type,
         budget, currency_code, created_by_user_id, created_by_role, source_type,
         assigned_freelancer_id, received_at, order_status, is_published, is_open_for_pool,
         payment_required, payment_status
       ) VALUES (
         $1, 'b hist2', 'h', $2, 'fixed',
         10, 'JOD', $3, 'super_admin', 'super_admin_created',
         $4, NOW() - INTERVAL '1 day', 'completed', TRUE, FALSE,
         FALSE, 'not_required'
       )`,
      [`FD7T-${crypto.randomBytes(3).toString("hex")}`, cats.categoryY, admin.id, b.id],
    );
    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    const auction = await createAuctionForOrder(order.id, admin.id);
    await pool.query(
      `UPDATE priority_bid_auctions SET assignment_strategy = 'HIGHEST_TOKEN_ONLY' WHERE id = $1`,
      [auction.id],
    );
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
    const resolved = await priorityAuction.resolvePriorityAuction({
      auctionId: auction.id,
      actorUserId: admin.id,
    });
    const winnerId =
      resolved.winner?.freelancer_user_id ||
      resolved.winner?.freelancerUserId ||
      resolved.auction?.winner_freelancer_user_id;
    assert.equal(Number(winnerId), Number(b.id));
  });

  it("HYBRID resolve fails closed without assignment", async () => {
    await setEngines({ workTokens: true, priority: true, fair: true });
    const a = await seedUser("freelancer");
    await activateMembership(a.id, planId);
    await credit(a.id, 200);
    const order = await createOrder(admin.id, { categoryId: cats.categoryY });
    const auction = await createAuctionForOrder(order.id, admin.id);
    await pool.query(
      `UPDATE priority_bid_auctions SET assignment_strategy = 'HYBRID' WHERE id = $1`,
      [auction.id],
    );
    await priorityAuction.submitPriorityBid({
      auctionId: auction.id,
      freelancerUserId: a.id,
      bidTokens: 100,
    });
    await forceAuctionEnded(auction.id);
    await assert.rejects(
      () =>
        priorityAuction.resolvePriorityAuction({
          auctionId: auction.id,
          actorUserId: admin.id,
        }),
      (err) =>
        err.publicCode ===
        FAIR_DISTRIBUTION_ERROR_CODES.FAIR_DISTRIBUTION_HYBRID_WEIGHT_POLICY_REQUIRED,
    );
    const { rows } = await pool.query(
      `SELECT assigned_freelancer_id FROM orders WHERE id = $1`,
      [order.id],
    );
    assert.equal(rows[0].assigned_freelancer_id, null);
  });
});
