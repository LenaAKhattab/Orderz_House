/**
 * Pool/bid eligibility: paid or not_required only; pending Stripe checkout does not unlock work.
 * Run: npm run test:subscriptions-eligibility  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/subscriptions_eligibility_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  evaluateFreelancerTakeOrdersEligibility,
  applyActivationFeeEligibilityGate,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_ACTIVATION_STATUSES,
  SUBSCRIPTION_STATUSES,
} = require("../src/services/subscriptionsService");

function sub(overrides) {
  return {
    paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PAID,
    activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
    status: SUBSCRIPTION_STATUSES.ACTIVE,
    expiryDate: null,
    ...overrides,
  };
}

describe("evaluateFreelancerTakeOrdersEligibility", () => {
  it("blocks when there is no subscription", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(null);
    assert.deepStrictEqual(r, { eligible: false, reason: "no_subscription" });
  });

  it("blocks pending Stripe payment before company approval (checkout / unpaid)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      sub({
        paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PENDING,
        activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
        status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      }),
    );
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "payment_not_completed");
  });

  it("blocks failed payment", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(sub({ paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.FAILED }));
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "payment_not_completed");
  });

  it("allows paid + company_approved + active", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(sub({}));
    assert.strictEqual(r.eligible, true);
    assert.strictEqual(r.reason, "active");
  });

  it("allows not_required (admin-assigned / no payment) with company_approved + active", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      sub({ paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED }),
    );
    assert.strictEqual(r.eligible, true);
    assert.strictEqual(r.reason, "active");
  });

  it("allows not_required + assigned_not_started (first order not yet taken)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      sub({
        paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
        status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      }),
    );
    assert.strictEqual(r.eligible, true);
    assert.strictEqual(r.reason, "assigned_not_started");
  });

  it("does not allow assigned_not_started if payment is still pending and company has not approved", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      sub({
        paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PENDING,
        activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
        status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      }),
    );
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "payment_not_completed");
  });

  it("allows pending payment once company_approved (admin activation after pay / legacy DB row)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      sub({
        paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PENDING,
        activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
        status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      }),
    );
    assert.strictEqual(r.eligible, true);
    assert.strictEqual(r.reason, "assigned_not_started");
  });

  it("blocks company activation pending for paid subscription", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      sub({
        paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.PAID,
        activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
      }),
    );
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "company_activation_pending");
  });

  it("blocks default free plan bootstrap (not_required + company_pending)", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(
      sub({
        paymentStatus: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
        activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
        status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      }),
    );
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "company_activation_pending");
  });

  it("blocks inactive status", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(sub({ status: SUBSCRIPTION_STATUSES.INACTIVE }));
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "status_inactive");
  });

  it("blocks cancelled status", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(sub({ status: SUBSCRIPTION_STATUSES.CANCELLED }));
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "status_cancelled");
  });

  it("blocks expired status", () => {
    const r = evaluateFreelancerTakeOrdersEligibility(sub({ status: SUBSCRIPTION_STATUSES.EXPIRED }));
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "expired");
  });

  it("blocks active subscription past expiryDate", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const r = evaluateFreelancerTakeOrdersEligibility(sub({ expiryDate: past }));
    assert.strictEqual(r.eligible, false);
    assert.strictEqual(r.reason, "expired");
  });
});

describe("applyActivationFeeEligibilityGate", () => {
  it("blocks otherwise eligible freelancer when activation fee is unpaid", () => {
    const base = evaluateFreelancerTakeOrdersEligibility(sub({}));
    assert.strictEqual(base.eligible, true);
    const gated = applyActivationFeeEligibilityGate(base, {
      needsPayment: true,
      amountJod: 25,
      isCurrent: false,
    });
    assert.strictEqual(gated.eligible, false);
    assert.strictEqual(gated.reason, "activation_fee_unpaid");
    assert.strictEqual(gated.activationFeeStatus.needsPayment, true);
  });

  it("passes through when activation fee is current", () => {
    const base = evaluateFreelancerTakeOrdersEligibility(sub({}));
    const gated = applyActivationFeeEligibilityGate(base, {
      needsPayment: false,
      isCurrent: true,
    });
    assert.deepStrictEqual(gated, base);
  });

  it("does not override subscription ineligibility with activation fee reason", () => {
    const base = evaluateFreelancerTakeOrdersEligibility(
      sub({ activationStatus: SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING }),
    );
    assert.strictEqual(base.eligible, false);
    const gated = applyActivationFeeEligibilityGate(base, { needsPayment: true });
    assert.deepStrictEqual(gated, base);
  });
});
