/**
 * Postgres integration: marketplace membership checkout — real parallel purchase requests against a real
 * database (advisory lock + partial unique index) produce ONE Stripe Checkout Session per freelancer + plan.
 *
 * Run: node --test test/marketplaceMembershipCheckoutAttempts.integration.test.js
 * Requires: INTEGRATION_TEST_DATABASE_URL (explicit non-Production DB; never DATABASE_URL), JWT_SECRET (16+ chars),
 * migration 209 applied. Stripe is a fake provider (no network). Removes only the attempt rows it creates.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const integrationEnvOk = isIntegrationEnvConfigured();
process.env.CLIENT_URL = process.env.CLIENT_URL || "https://staging.orderzhouse.test";

function fakeStripe() {
  const sessions = new Map();
  const stripe = {
    createCalls: 0,
    checkout: {
      sessions: {
        create: async (payload) => {
          stripe.createCalls += 1;
          // Widen the race window: the session is created while other requests are arriving.
          await new Promise((r) => setTimeout(r, 150));
          const id = `cs_test_integration_${Date.now()}_${stripe.createCalls}`;
          const s = { id, url: `https://checkout.stripe.test/${id}`, status: "open", payment_status: "unpaid", metadata: payload.metadata };
          sessions.set(id, s);
          return { ...s };
        },
        retrieve: async (id) => ({ ...sessions.get(id) }),
        expire: async (id) => {
          const s = sessions.get(id);
          if (s) s.status = "expired";
          return { ...s };
        },
      },
    },
  };
  return { stripe, sessions };
}

describe("membership checkout attempts — real Postgres concurrency", { skip: !integrationEnvOk }, () => {
  let pool;
  let createMarketplaceMembershipCheckoutSession;
  let userId;
  const createdAttemptIds = [];

  before(async () => {
    ({ pool } = require("../src/config/db"));
    ({ createMarketplaceMembershipCheckoutSession } = require("../src/services/marketplaceMembershipCheckoutService"));
    const { rows: ready } = await pool.query(`SELECT to_regclass('public.marketplace_membership_checkout_attempts') AS t`);
    assert.ok(ready[0].t, "migration 209 must be applied on the integration database");
    const membershipsService = require("../src/services/marketplaceMembershipsService");
    const { rows } = await pool.query(
      `SELECT u.id FROM users u
        WHERE u.role = 'freelancer' AND u.is_active = TRUE
          AND NOT EXISTS (SELECT 1 FROM marketplace_membership_checkout_attempts a WHERE a.freelancer_user_id = u.id)
        ORDER BY u.id DESC LIMIT 25`,
    );
    for (const r of rows) {
      const current = await membershipsService.resolveCurrentMarketplaceMembershipForFreelancer(Number(r.id), { client: pool });
      if (!current) {
        userId = Number(r.id);
        break;
      }
    }
    assert.ok(userId, "an active freelancer without a current marketplace membership");
  });

  after(async () => {
    if (pool && userId) {
      await pool.query(`DELETE FROM marketplace_membership_checkout_attempts WHERE freelancer_user_id = $1`, [userId]);
    }
    if (pool) await pool.end();
  });

  const buy = (stripe, planCode) =>
    createMarketplaceMembershipCheckoutSession({ freelancerUserId: userId, planCode }, { stripe });

  it("5 simultaneous SILVER requests → one session, one pending attempt", async () => {
    const { stripe } = fakeStripe();
    const results = await Promise.all(Array.from({ length: 5 }, () => buy(stripe, "silver")));
    assert.equal(stripe.createCalls, 1);
    assert.equal(new Set(results.map((r) => r.sessionId)).size, 1);
    assert.equal(results.filter((r) => r.checkoutState === "created").length, 1);
    assert.equal(results.filter((r) => r.checkoutState === "resume").length, 4);
    const { rows } = await pool.query(
      `SELECT id, plan_code, status FROM marketplace_membership_checkout_attempts WHERE freelancer_user_id = $1`,
      [userId],
    );
    createdAttemptIds.push(...rows.map((r) => r.id));
    assert.deepEqual(rows.map((r) => [r.plan_code, r.status]), [["silver", "pending"]]);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ scenario: "silver_parallel_5", stripeSessions: stripe.createCalls, pendingAttempts: rows.length }));
  });

  it("Annual SILVER in parallel → one session; SILVER and Annual are separate products", async () => {
    const { stripe } = fakeStripe();
    const results = await Promise.all(Array.from({ length: 4 }, () => buy(stripe, "annual_basic")));
    assert.equal(stripe.createCalls, 1);
    assert.equal(new Set(results.map((r) => r.sessionId)).size, 1);
    const { rows } = await pool.query(
      `SELECT plan_code, status FROM marketplace_membership_checkout_attempts
        WHERE freelancer_user_id = $1 AND status = 'pending' ORDER BY plan_code`,
      [userId],
    );
    assert.deepEqual(rows.map((r) => r.plan_code), ["annual_basic", "silver"]);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ scenario: "annual_parallel_4", stripeSessions: stripe.createCalls, pendingTargets: rows.length }));
  });

  it("the partial unique index rejects a second pending attempt even without the lock", async () => {
    const { rows } = await pool.query(
      `SELECT marketplace_plan_id FROM marketplace_membership_checkout_attempts
        WHERE freelancer_user_id = $1 AND plan_code = 'silver' AND status = 'pending'`,
      [userId],
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO marketplace_membership_checkout_attempts (freelancer_user_id, marketplace_plan_id, plan_code, status)
           VALUES ($1, $2, 'silver', 'pending')`,
          [userId, rows[0].marketplace_plan_id],
        ),
      (e) => e.code === "23505",
    );
  });
});
