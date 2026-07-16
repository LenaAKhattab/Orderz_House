/**
 * Canonical plan resolution for admin assign + display-plan order bands.
 * Run: node --test test/canonicalPlanAssignmentResolution.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/canonical_plan_assignment_test";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = path.join(__dirname, "..", "src", "config", "db.js");
const PLANS_SERVICE_PATH = path.join(__dirname, "..", "src", "services", "plansService.js");
const PLAN_ELIG_PATH = path.join(__dirname, "..", "src", "services", "planOrderValueEligibility.js");
const SUBS_SERVICE_PATH = path.join(__dirname, "..", "src", "services", "subscriptionsService.js");

function createMockClient(handlers) {
  return {
    query: async (sql, params) => {
      const key = String(sql).replace(/\s+/g, " ").trim();
      for (const [pattern, fn] of handlers) {
        if (typeof pattern === "string" ? key.includes(pattern) : pattern.test(key)) {
          return fn(sql, params);
        }
      }
      throw new Error(`Unexpected query: ${key.slice(0, 160)}`);
    },
  };
}

function loadPlansServiceWithMockPool(mockPool) {
  delete require.cache[DB_PATH];
  delete require.cache[PLANS_SERVICE_PATH];
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: { pool: mockPool, connectDB: async () => {} },
  };
  return require("../src/services/plansService");
}

function loadPlanEligWithMockPool(mockPool) {
  delete require.cache[DB_PATH];
  delete require.cache[PLAN_ELIG_PATH];
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: { pool: mockPool, connectDB: async () => {} },
  };
  return require("../src/services/planOrderValueEligibility");
}

afterEach(() => {
  delete require.cache[DB_PATH];
  delete require.cache[PLANS_SERVICE_PATH];
  delete require.cache[PLAN_ELIG_PATH];
});

describe("assignPlanToFreelancer source contract", () => {
  it("resolves assignable plan via subscription_plan_id before insert", () => {
    const src = fs.readFileSync(SUBS_SERVICE_PATH, "utf8");
    const fnStart = src.indexOf("async function assignPlanToFreelancer");
    const fnEnd = src.indexOf("async function getCurrentSubscriptionForFreelancer", fnStart);
    const block = src.slice(fnStart, fnEnd);
    assert.ok(block.includes("resolveAssignableSubscriptionPlanId"));
    assert.ok(block.includes("assignmentPlanId"));
    assert.ok(!/Number\(planId\)/.test(block.split("INSERT INTO freelancer_subscriptions")[1]?.slice(0, 400) || ""));
  });

  it("keeps assigned_not_started and does not force active on assign", () => {
    const src = fs.readFileSync(SUBS_SERVICE_PATH, "utf8");
    const fnStart = src.indexOf("async function assignPlanToFreelancer");
    const fnEnd = src.indexOf("async function getCurrentSubscriptionForFreelancer", fnStart);
    const block = src.slice(fnStart, fnEnd);
    assert.ok(block.includes("SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED"));
    assert.ok(!block.includes("SUBSCRIPTION_STATUSES.ACTIVE"));
  });
});

describe("resolveAssignableSubscriptionPlanId", () => {
  it("assigns canonical plan directly when no subscription_plan_id", async () => {
    const client = createMockClient([
      [
        "FROM plans WHERE id = $1",
        (_sql, params) => {
          if (Number(params[0]) === 3) {
            return {
              rows: [
                {
                  id: 3,
                  is_active: true,
                  deleted_at: null,
                  subscription_plan_id: null,
                  duration_days: 365,
                  name: "orderzhouse_platinum",
                  title: "Platinum",
                },
              ],
            };
          }
          return { rows: [] };
        },
      ],
    ]);
    const plansService = loadPlansServiceWithMockPool(client);
    const resolved = await plansService.resolveAssignableSubscriptionPlanId(3, client);
    assert.strictEqual(resolved.assignmentPlanId, 3);
    assert.strictEqual(resolved.resolvedFromDisplay, false);
    assert.strictEqual(resolved.displayPlanId, null);
  });

  it("maps display plan with subscription_plan_id to canonical plan", async () => {
    const client = createMockClient([
      [
        "FROM plans WHERE id = $1",
        (_sql, params) => {
          const id = Number(params[0]);
          if (id === 23) {
            return {
              rows: [
                {
                  id: 23,
                  is_active: true,
                  deleted_at: null,
                  subscription_plan_id: 3,
                  duration_days: 365,
                  name: "freelancers_platinum",
                  title: "Display Platinum",
                },
              ],
            };
          }
          if (id === 3) {
            return {
              rows: [
                {
                  id: 3,
                  is_active: true,
                  deleted_at: null,
                  subscription_plan_id: null,
                  duration_days: 365,
                  name: "orderzhouse_platinum",
                  title: "Platinum",
                },
              ],
            };
          }
          return { rows: [] };
        },
      ],
    ]);
    const plansService = loadPlansServiceWithMockPool(client);
    const resolved = await plansService.resolveAssignableSubscriptionPlanId(23, client);
    assert.strictEqual(resolved.assignmentPlanId, 3);
    assert.strictEqual(resolved.selectedPlanId, 23);
    assert.strictEqual(resolved.displayPlanId, 23);
    assert.strictEqual(resolved.resolvedFromDisplay, true);
  });

  it("fails clearly when canonical plan is missing", async () => {
    const client = createMockClient([
      [
        "FROM plans WHERE id = $1",
        (_sql, params) => {
          if (Number(params[0]) === 99) {
            return {
              rows: [
                {
                  id: 99,
                  is_active: true,
                  deleted_at: null,
                  subscription_plan_id: 9999,
                  duration_days: 30,
                  name: "broken_display",
                  title: "Broken",
                },
              ],
            };
          }
          return { rows: [] };
        },
      ],
    ]);
    const plansService = loadPlansServiceWithMockPool(client);
    await assert.rejects(
      () => plansService.resolveAssignableSubscriptionPlanId(99, client),
      (err) => {
        assert.strictEqual(err.reason, "canonical_plan_not_found");
        assert.strictEqual(err.statusCode, 400);
        return true;
      },
    );
  });
});

describe("display plan order-value band resolution", () => {
  it("does not treat null display limits as a usable range", () => {
    const planElig = require("../src/services/planOrderValueEligibility");
    assert.strictEqual(
      planElig.isUsableOrderValueRange({ planId: 23, minOrderValue: null, maxOrderValue: null }),
      false,
    );
    const locked = planElig.computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 50 },
      { planId: 23, minOrderValue: null, maxOrderValue: null },
    );
    assert.strictEqual(locked.isLockedByPlan, true);
    assert.strictEqual(locked.planConfigurationError, true);
  });

  it("resolves display clone null band via subscription_plan_id to canonical band", async () => {
    const client = createMockClient([
      [
        "FROM plans WHERE id = $1",
        (_sql, params) => {
          const id = Number(params[0]);
          if (id === 23) {
            return {
              rows: [
                {
                  id: 23,
                  name: "freelancers_platinum",
                  order_value_min_jod: null,
                  order_value_max_jod: null,
                  subscription_plan_id: 3,
                  deleted_at: null,
                },
              ],
            };
          }
          if (id === 3) {
            return {
              rows: [
                {
                  id: 3,
                  name: "orderzhouse_platinum",
                  order_value_min_jod: "10.00",
                  order_value_max_jod: null,
                  subscription_plan_id: null,
                  deleted_at: null,
                },
              ],
            };
          }
          return { rows: [] };
        },
      ],
    ]);
    const planElig = loadPlanEligWithMockPool(client);
    const range = await planElig.resolvePlanOrderValueRange(23, client);
    assert.ok(range);
    assert.strictEqual(range.minOrderValue, 10);
    assert.strictEqual(range.maxOrderValue, null);
    assert.strictEqual(range.resolvedFromPlanId, 3);

    const inBand = planElig.computePoolOrderPlanEligibility(
      { project_type: "bidding", bid_budget_min: 50, bid_budget_max: 100 },
      range,
    );
    assert.strictEqual(inBand.isLockedByPlan, false);
    assert.strictEqual(inBand.canBid, true);
  });

  it("canonical plan 3 remains unaffected", async () => {
    const planElig = require("../src/services/planOrderValueEligibility");
    const range = planElig.getPlanOrderValueRange(3);
    assert.strictEqual(range.minOrderValue, 10);
    assert.strictEqual(range.maxOrderValue, null);
    const ok = planElig.computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 15 },
      range,
    );
    assert.strictEqual(ok.isLockedByPlan, false);
  });
});

describe("activation fee remains independent of company approval", () => {
  it("company_approved + unpaid fee stays ineligible (non-admin-assignment path)", () => {
    const {
      evaluateFreelancerTakeOrdersEligibility,
      applyActivationFeeEligibilityGate,
      SUBSCRIPTION_PAYMENT_STATUSES,
      SUBSCRIPTION_ACTIVATION_STATUSES,
      SUBSCRIPTION_STATUSES,
    } = require("../src/services/subscriptionsService");
    const base = evaluateFreelancerTakeOrdersEligibility({
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
      activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      expiryDate: null,
    });
    assert.strictEqual(base.eligible, true);
    const gated = applyActivationFeeEligibilityGate(base, { needsPayment: true, isCurrent: false });
    assert.strictEqual(gated.eligible, false);
    assert.strictEqual(gated.reason, "activation_fee_unpaid");
  });

  it("paid fee + approved + assigned_not_started is eligible (starts after first order)", () => {
    const {
      evaluateFreelancerTakeOrdersEligibility,
      applyActivationFeeEligibilityGate,
      SUBSCRIPTION_PAYMENT_STATUSES,
      SUBSCRIPTION_ACTIVATION_STATUSES,
      SUBSCRIPTION_STATUSES,
    } = require("../src/services/subscriptionsService");
    const base = evaluateFreelancerTakeOrdersEligibility({
      paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PAID,
      activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      expiryDate: null,
    });
    const gated = applyActivationFeeEligibilityGate(base, { needsPayment: false, isCurrent: true });
    assert.strictEqual(gated.eligible, true);
    assert.strictEqual(gated.reason, "assigned_not_started");
  });
});

describe("Admin assignment offline payment contract", () => {
  it("assignPlanToFreelancer marks activation fee offline and paid/not_required subscription", () => {
    const src = fs.readFileSync(SUBS_SERVICE_PATH, "utf8");
    const fnStart = src.indexOf("async function assignPlanToFreelancer");
    const fnEnd = src.indexOf("async function applyOfflinePaymentsToExistingAdminAssignment", fnStart);
    const block = src.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 5000);
    assert.ok(block.includes("markActivationFeePaidOffline"));
    assert.ok(block.includes("ADMIN_ASSIGNMENT_OFFLINE_PAYMENT_NOTE"));
    assert.ok(block.includes("SUBSCRIPTION_PAYMENT_STATUSES.PAID"));
    assert.ok(block.includes("SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED"));
    assert.ok(block.includes("SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED"));
    assert.ok(!block.includes("SUBSCRIPTION_STATUSES.ACTIVE"));
  });

  it("correction helper reuses shared offline payment path without new current subscription insert", () => {
    const src = fs.readFileSync(SUBS_SERVICE_PATH, "utf8");
    const fnStart = src.indexOf("async function applyOfflinePaymentsToExistingAdminAssignment");
    const block = src.slice(fnStart, fnStart + 3500);
    assert.ok(block.includes("applyAdminAssignmentOfflinePayments"));
    assert.ok(!block.includes("INSERT INTO freelancer_subscriptions"));
    assert.ok(block.includes("is_current !== true") || block.includes("is_current = TRUE"));
  });
});
