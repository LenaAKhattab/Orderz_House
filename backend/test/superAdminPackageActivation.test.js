/**
 * Super Admin package assignment vs administrative activation.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveAdminEntitlementDuration,
  buildAdminEntitlementFields,
} = require("../src/utils/adminPackageEntitlement");
const { evaluateFreelancerTakeOrdersEligibility } = require("../src/services/subscriptionsService");

const root = path.join(__dirname, "..");
const subsSrc = fs.readFileSync(path.join(root, "src/services/subscriptionsService.js"), "utf8");
const usersSrc = fs.readFileSync(path.join(root, "src/services/superAdminUsersControlService.js"), "utf8");

function sliceBetween(src, start, end) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, end);
  return src.slice(i, j);
}

describe("package change without activation", () => {
  it("keeps assigned_not_started and company_pending on the existing assign path", () => {
    const block = sliceBetween(
      subsSrc,
      "async function assignPlanToFreelancer",
      "async function getCurrentSubscriptionForFreelancer",
    );
    assert.match(block, /ASSIGNED_NOT_STARTED/);
    assert.match(block, /COMPANY_PENDING/);
    assert.doesNotMatch(block, /SUBSCRIPTION_STATUSES\.ACTIVE/);
    assert.doesNotMatch(block, /SUBSCRIPTION_ACTIVATION_STATUSES\.COMPANY_APPROVED/);
  });

  it("does not treat that pending assignment as a valid package", () => {
    const result = evaluateFreelancerTakeOrdersEligibility({
      status: "assigned_not_started",
      activationStatus: "company_pending",
      paymentStatus: "paid",
      hasFirstOrder: false,
      expiryDate: null,
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "company_activation_pending");
  });
});

describe("admin activation entitlement", () => {
  it("approves the package without starting the countdown", () => {
    const duration = resolveAdminEntitlementDuration(1);
    assert.equal(duration.ok, true);
    const fields = buildAdminEntitlementFields({ durationMonths: 1 });
    assert.equal(fields.status, "assigned_not_started");
    assert.equal(fields.source, "admin");
    assert.equal(fields.paymentStatus, "not_required");
    assert.equal(fields.activationStatus, "company_approved");
    assert.equal(fields.hasFirstOrder, false);
    assert.equal(fields.firstOrderDate, null);
    assert.equal(fields.actualStartDate, null);
    assert.equal(fields.expiryDate, null);
    assert.equal(fields.entitlementDurationMonths, 1);
  });

  it("makes the package gate true before the first order", () => {
    const fields = buildAdminEntitlementFields({ durationMonths: 1 });
    const result = evaluateFreelancerTakeOrdersEligibility({
      status: fields.status,
      activationStatus: fields.activationStatus,
      paymentStatus: fields.paymentStatus,
      hasFirstOrder: fields.hasFirstOrder,
      expiryDate: fields.expiryDate,
    });
    assert.equal(result.eligible, true);
    assert.equal(result.reason, "assigned_not_started");
  });

  it("accepts preset and custom durations and rejects zero", () => {
    assert.equal(resolveAdminEntitlementDuration(12).preset, true);
    assert.equal(resolveAdminEntitlementDuration(8).preset, false);
    assert.equal(resolveAdminEntitlementDuration(8).ok, true);
    assert.equal(resolveAdminEntitlementDuration(0).ok, false);
  });
});

describe("activation source contracts", () => {
  it("writes not_required admin entitlement without payments or a first order", () => {
    const block = sliceBetween(
      subsSrc,
      "async function activateAdminPackageEntitlement",
      "async function assertFreelancerMayAccessRealPoolOrders",
    );
    assert.match(block, /'assigned_not_started',FALSE,NULL,NULL,NULL/);
    assert.match(block, /'not_required'/);
    assert.match(block, /'company_approved'/);
    assert.match(block, /entitlement_duration_months/);
    assert.match(block, /has_first_order = TRUE/);
    assert.match(block, /endCurrentSubscription/);
    assert.doesNotMatch(block, /markActivationFeePaidOffline|stripe|wallet|invoice/i);
    assert.match(usersSrc, /activate_plan/);
    assert.match(usersSrc, /activateAdminPackageEntitlement/);
  });

  it("leaves the paid Stripe fulfillment path on payment_status paid", () => {
    const block = sliceBetween(
      subsSrc,
      "async function fulfillFreelancerSubscriptionStripePayment",
      "async function ",
    );
    assert.match(block, /paid|PAID/);
    assert.doesNotMatch(block, /activateAdminPackageEntitlement/);
  });

  it("still cancels by closing the current row", () => {
    const block = sliceBetween(usersSrc, "async function cancelCurrentPlan", "async function patchMembership");
    assert.match(block, /status = 'cancelled'/);
    assert.match(block, /is_current = FALSE/);
  });
});
