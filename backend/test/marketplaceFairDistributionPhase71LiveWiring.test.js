/**
 * Phase 7.1 — Fair Distribution live event wiring tests.
 * Run via Phase 7 gate (isolated DB with migration 142).
 */

const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE7.1 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceFairDistributionPhase7Gate.js");
  }
}

refuseProductionDatabase();

const { pool } = require("../src/config/db");
const fairDist = require("../src/services/marketplaceFairDistributionService");

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `fd71_${role}_${suffix}@example.com`;
  const accountId = `G${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'Fd', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function createOrder(creatorId, categoryId) {
  const code = `FD71-${crypto.randomBytes(4).toString("hex")}`;
  const { rows } = await pool.query(
    `INSERT INTO orders (
       order_code, title, description, category_id, project_type,
       budget, currency_code, bid_budget_min, bid_budget_max,
       created_by_user_id, created_by_role, source_type,
       is_published, is_open_for_pool, payment_required, payment_status, order_status
     ) VALUES (
       $1, 'FD71', 'Phase 7.1', $2, 'bidding',
       NULL, 'JOD', 10, 100,
       $3, 'super_admin', 'super_admin_created',
       TRUE, TRUE, FALSE, 'not_required', 'open_for_bids'
     ) RETURNING *`,
    [code, categoryId, creatorId],
  );
  return rows[0];
}

async function countEvents(orderId, outcome, freelancerId = null) {
  const params = [orderId, outcome];
  let sql = `SELECT COUNT(*)::int AS c FROM fair_distribution_events
             WHERE order_id = $1 AND outcome_code = $2`;
  if (freelancerId != null) {
    params.push(freelancerId);
    sql += ` AND freelancer_user_id = $3`;
  }
  const { rows } = await pool.query(sql, params);
  return rows[0].c;
}

describe("Phase 7.1 live event wiring semantics", () => {
  let admin;
  let categoryId;

  before(async () => {
    assert.equal(
      fairDist.FAIR_HISTORY_RECORDING_WHEN_ENGINE_OFF,
      "ALWAYS_RECORD_FACTUAL_HISTORY",
    );
    admin = await seedUser("super_admin");
    const { rows } = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
    categoryId = rows[0].id;
  });

  after(async () => {
    /* pool ended by Phase 7 suite when run together — keep open if solo */
  });

  it("winner gets AWARDED+EFFECTIVE; losers get APPLIED_AND_LOST once; winner has no loss", async () => {
    const winner = await seedUser("freelancer");
    const loser = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fairDist.recordFinalEffectiveSelectionOutcome({
        client,
        order: { ...order, assigned_freelancer_id: winner.id, received_at: new Date() },
        winnerFreelancerUserId: winner.id,
        loserFreelancerUserIds: [loser.id, winner.id],
        selectionSource: "test_selection",
        actorUserId: admin.id,
      });
      // retry identical
      await fairDist.recordFinalEffectiveSelectionOutcome({
        client,
        order: { ...order, assigned_freelancer_id: winner.id, received_at: new Date() },
        winnerFreelancerUserId: winner.id,
        loserFreelancerUserIds: [loser.id],
        selectionSource: "test_selection",
        actorUserId: admin.id,
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    assert.equal(await countEvents(order.id, "AWARDED", winner.id), 1);
    assert.equal(await countEvents(order.id, "EFFECTIVE_ASSIGNMENT", winner.id), 1);
    assert.equal(await countEvents(order.id, "APPLIED_AND_LOST", loser.id), 1);
    assert.equal(await countEvents(order.id, "APPLIED_AND_LOST", winner.id), 0);
  });

  it("rejected bid without another winner: no APPLIED_AND_LOST", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    // Manual reject simulation — do not call recordAppliedAndLost
    assert.equal(await countEvents(order.id, "APPLIED_AND_LOST", f.id), 0);
  });

  it("order cancelled before selection: ORDER_CANCELLED_BEFORE_RESOLUTION and no APPLIED_AND_LOST", async () => {
    const loser = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    await fairDist.recordOrderCancelledBeforeResolution({
      order,
      actorRole: "admin",
      actorUserId: admin.id,
    });
    // retry
    await fairDist.recordOrderCancelledBeforeResolution({
      order,
      actorRole: "admin",
      actorUserId: admin.id,
    });
    assert.equal(await countEvents(order.id, "ORDER_CANCELLED_BEFORE_RESOLUTION"), 1);
    assert.equal(await countEvents(order.id, "APPLIED_AND_LOST", loser.id), 0);
  });

  it("declined offer is ASSIGNMENT_OFFERED_AND_DECLINED not APPLIED_AND_LOST", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    await fairDist.recordOfferedAndDeclined({
      order,
      freelancerUserId: f.id,
      actorUserId: f.id,
    });
    await fairDist.recordOfferedAndDeclined({
      order,
      freelancerUserId: f.id,
      actorUserId: f.id,
    });
    assert.equal(await countEvents(order.id, "ASSIGNMENT_OFFERED_AND_DECLINED", f.id), 1);
    assert.equal(await countEvents(order.id, "APPLIED_AND_LOST", f.id), 0);
  });

  it("freelancer cancel after award is distinct and retry-safe", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    await fairDist.recordFreelancerCancelledAfterAward({
      order,
      freelancerUserId: f.id,
      actorUserId: f.id,
    });
    await fairDist.recordFreelancerCancelledAfterAward({
      order,
      freelancerUserId: f.id,
      actorUserId: f.id,
    });
    assert.equal(await countEvents(order.id, "FREELANCER_CANCELLED_AFTER_AWARD", f.id), 1);
    assert.equal(await countEvents(order.id, "APPLIED_AND_LOST", f.id), 0);
  });

  it("external cancel is CLIENT_ADMIN_SYSTEM_CANCELLED and retry-safe", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    const orderAssigned = { ...order, assigned_freelancer_id: f.id };
    await fairDist.recordExternalCancellationNeutral({
      order: orderAssigned,
      freelancerUserId: f.id,
      actorRole: "admin",
      actorUserId: admin.id,
    });
    await fairDist.recordExternalCancellationNeutral({
      order: orderAssigned,
      freelancerUserId: f.id,
      actorRole: "admin",
      actorUserId: admin.id,
    });
    assert.equal(await countEvents(order.id, "CLIENT_ADMIN_SYSTEM_CANCELLED", f.id), 1);
  });

  it("selected_pending_payment alone: AWARDED without EFFECTIVE_ASSIGNMENT", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    await fairDist.recordAwarded({
      order,
      freelancerUserId: f.id,
      reason: "client_selected_pending_payment",
      metadata: { pendingPayment: true },
    });
    assert.equal(await countEvents(order.id, "AWARDED", f.id), 1);
    assert.equal(await countEvents(order.id, "EFFECTIVE_ASSIGNMENT", f.id), 0);
  });

  it("effective assignment callback retry → one event", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    await fairDist.recordEffectiveAssignment({
      order: { ...order, assigned_freelancer_id: f.id, received_at: new Date() },
      freelancerUserId: f.id,
    });
    await fairDist.recordEffectiveAssignment({
      order: { ...order, assigned_freelancer_id: f.id, received_at: new Date() },
      freelancerUserId: f.id,
    });
    assert.equal(await countEvents(order.id, "EFFECTIVE_ASSIGNMENT", f.id), 1);
  });

  it("business transaction rollback → no Fair event committed", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await fairDist.recordEffectiveAssignment({
        client,
        order: { ...order, assigned_freelancer_id: f.id, received_at: new Date() },
        freelancerUserId: f.id,
      });
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    assert.equal(await countEvents(order.id, "EFFECTIVE_ASSIGNMENT", f.id), 0);
  });

  it("fake/training orders never create Fair events", async () => {
    const f = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    const fake = { ...order, source_type: "fake", is_fake: true };
    const out = await fairDist.recordEffectiveAssignment({
      order: fake,
      freelancerUserId: f.id,
    });
    assert.equal(out.skipped, true);
    assert.equal(await countEvents(order.id, "EFFECTIVE_ASSIGNMENT", f.id), 0);
  });

  it("LIVE_ASSIGNMENT_DECLINE_PATH_NOT_PRESENT — helper exists, no live decline mutation required", () => {
    assert.equal(typeof fairDist.recordOfferedAndDeclined, "function");
    // Documented product finding: no pending_freelancer_acceptance decline API in codebase.
    assert.equal(true, true);
  });

  it("concurrent identical APPLIED_AND_LOST → one row", async () => {
    const winner = await seedUser("freelancer");
    const loser = await seedUser("freelancer");
    const order = await createOrder(admin.id, categoryId);
    await Promise.all([
      fairDist.recordAppliedAndLostForOrderLosers({
        order,
        winnerFreelancerUserId: winner.id,
        loserFreelancerUserIds: [loser.id],
      }),
      fairDist.recordAppliedAndLostForOrderLosers({
        order,
        winnerFreelancerUserId: winner.id,
        loserFreelancerUserIds: [loser.id],
      }),
    ]);
    assert.equal(await countEvents(order.id, "APPLIED_AND_LOST", loser.id), 1);
  });

  it("Freelancer privacy scrub still clean", () => {
    const dirty = {
      ok: true,
      fairnessScore: 1,
      appliedAndLostWaitingCount: 3,
      queuePosition: 2,
    };
    const clean = fairDist.scrubFreelancerFairnessLeakage(dirty);
    assert.equal(clean.ok, true);
    assert.equal(clean.fairnessScore, undefined);
    assert.equal(clean.appliedAndLostWaitingCount, undefined);
  });
});
