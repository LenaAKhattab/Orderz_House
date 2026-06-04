/**
 * Default free-plan bootstrap must start company_pending (admin approval before pool work).
 * Run: node --test test/freelancerDefaultFreePlanBootstrap.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/freelancer_default_free_plan_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  evaluateFreelancerTakeOrdersEligibility,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_ACTIVATION_STATUSES,
  SUBSCRIPTION_STATUSES,
  ORDERZHOUSE_FREE_PLAN_ID,
} = require("../src/services/subscriptionsService");
const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const SUBSCRIPTIONS_SERVICE_PATH = path.join(__dirname, "..", "src", "services", "subscriptionsService.js");

function defaultFreePlanPendingSub(overrides = {}) {
  return {
    planId: ORDERZHOUSE_FREE_PLAN_ID,
    paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
    activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
    status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
    expiryDate: null,
    ...overrides,
  };
}

describe("ensureFreelancerDefaultFreePlan source — activation on insert", () => {
  it("bootstrap insert uses company_pending (not assignPlanToFreelancer)", () => {
    const src = fs.readFileSync(SUBSCRIPTIONS_SERVICE_PATH, "utf8");
    const fnStart = src.indexOf("async function ensureFreelancerDefaultFreePlan");
    assert.ok(fnStart >= 0);
    const fnEnd = src.indexOf("async function maybeEnsureFreelancerDefaultFreePlan", fnStart);
    const block = src.slice(fnStart, fnEnd);
    assert.ok(block.includes("SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING"));
    assert.ok(!block.includes("assignPlanToFreelancer("), "default bootstrap must not auto-approve via assignPlan");
  });

  it("manual assignPlanToFreelancer still uses company_approved for admin assignments", () => {
    const src = fs.readFileSync(SUBSCRIPTIONS_SERVICE_PATH, "utf8");
    const fnStart = src.indexOf("async function assignPlanToFreelancer");
    const fnEnd = src.indexOf("async function getCurrentSubscriptionForFreelancer", fnStart);
    const block = src.slice(fnStart, fnEnd);
    assert.ok(block.includes("SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED"));
  });
});

describe("default free plan eligibility (unit)", () => {
  it("A — pending default free plan cannot take orders", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(defaultFreePlanPendingSub());
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "company_activation_pending");
  });

  it("B — after company approval can take orders (assigned_not_started)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      defaultFreePlanPendingSub({
        activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      }),
    );
    assert.strictEqual(r.eligible, true);
    assert.strictEqual(r.reason, "assigned_not_started");
  });

  it("C — in-range order gate: subscription pending blocks before plan check matters", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(defaultFreePlanPendingSub());
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "company_activation_pending");
  });

  it("D — approved + active still eligible for pool work", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      defaultFreePlanPendingSub({
        activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
        status: SUBSCRIPTION_STATUSES.ACTIVE,
      }),
    );
    assert.strictEqual(r.eligible, true);
  });

  it("E — fake/training uses same subscription gate (pending blocks)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(defaultFreePlanPendingSub());
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "company_activation_pending");
  });
});

const describeIntegration = isIntegrationEnvConfigured() ? describe : describe.skip;

describeIntegration("ensureFreelancerDefaultFreePlan integration", () => {
  it("creates free plan with company_pending and blocks take until approved", async () => {
    const { pool } = require("../src/config/db");
    const subscriptionsService = require("../src/services/subscriptionsService");

    const email = `free-bootstrap-${Date.now()}@test.local`;
    const { rows: users } = await pool.query(
      `INSERT INTO users (account_id, first_name, father_name, family_name, email, password_hash, role, country, is_active, email_verified)
       VALUES ($1,'Test','User','Bootstrap', $2, 'hash', 'freelancer', 'JO', TRUE, TRUE)
       RETURNING id`,
      [`T${Date.now()}`, email],
    );
    const uid = Number(users[0].id);

    try {
      const out = await subscriptionsService.ensureFreelancerDefaultFreePlan(uid);
      assert.strictEqual(out.created, true);
      assert.strictEqual(Number(out.subscription.planId), ORDERZHOUSE_FREE_PLAN_ID);
      assert.strictEqual(out.subscription.paymentStatus, SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED);
      assert.strictEqual(out.subscription.activationStatus, SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING);

      const before = await subscriptionsService.canFreelancerTakeOrders(uid);
      assert.strictEqual(before.eligible, false);
      assert.strictEqual(before.reason, "company_activation_pending");

      const approved = await subscriptionsService.activateCompanyApprovalForSubscription({
        actorUserId: null,
        subscriptionId: out.subscription.id,
      });
      assert.strictEqual(approved.activationStatus, SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED);

      const after = await subscriptionsService.canFreelancerTakeOrders(uid);
      assert.strictEqual(after.eligible, true);
    } finally {
      await pool.query(`DELETE FROM freelancer_subscriptions WHERE freelancer_user_id = $1`, [uid]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
    }
  });
});
