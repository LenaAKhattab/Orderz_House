/**
 * Marketplace membership countdown starts on the first real order, not on admin approval.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildAdminEntitlementFields,
  planFirstRealOrderStart,
  classifyPrematureAdminEntitlement,
} = require("../src/utils/adminPackageEntitlement");
const { evaluateFreelancerTakeOrdersEligibility } = require("../src/services/subscriptionsService");

const root = path.join(__dirname, "..");
const subsSrc = fs.readFileSync(path.join(root, "src/services/subscriptionsService.js"), "utf8");
const usersSrc = fs.readFileSync(path.join(root, "src/services/superAdminUsersControlService.js"), "utf8");
const ordersSrc = fs.readFileSync(path.join(root, "src/services/ordersService.js"), "utf8");
const fakeSrc = fs.readFileSync(path.join(root, "src/services/fakeOrdersService.js"), "utf8");

function sliceBetween(src, start, end) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, end);
  return src.slice(i, j);
}

const awaiting = {
  status: "assigned_not_started",
  source: "admin",
  payment_status: "not_required",
  activation_status: "company_approved",
  has_first_order: false,
  actual_start_date: null,
  expiry_date: null,
  first_order_date: null,
  entitlement_duration_months: 1,
  notes: "ADMIN_PACKAGE_ENTITLEMENT",
  plan_duration_days: 365,
};

describe("pre-first-order admin entitlement", () => {
  it("exposes the stored duration on the user drawer subscription", () => {
    const block = sliceBetween(usersSrc, "function sanitizeSubscription", "async function writeAudit");
    assert.match(block, /entitlementDurationMonths/);
  });

  it("stores one month without start or expiry", () => {
    const fields = buildAdminEntitlementFields({ durationMonths: 1 });
    assert.equal(fields.hasFirstOrder, false);
    assert.equal(fields.actualStartDate, null);
    assert.equal(fields.expiryDate, null);
    assert.equal(fields.firstOrderDate, null);
    assert.equal(fields.entitlementDurationMonths, 1);
    assert.equal(fields.status, "assigned_not_started");
    assert.equal(fields.activationStatus, "company_approved");
  });

  it("treats that approved membership as a valid package", () => {
    const fields = buildAdminEntitlementFields({ durationMonths: 1 });
    const result = evaluateFreelancerTakeOrdersEligibility({
      status: fields.status,
      activationStatus: fields.activationStatus,
      paymentStatus: fields.paymentStatus,
      hasFirstOrder: false,
      expiryDate: null,
    });
    assert.equal(result.eligible, true);
    assert.notEqual(result.reason, "expired");
    assert.notEqual(result.reason, "no_subscription");
  });
});

describe("first real order transition", () => {
  const firstAt = new Date("2026-11-02T09:30:00.000Z");
  const secondAt = new Date("2026-12-01T09:30:00.000Z");

  it("sets the first-order timestamp and the same start timestamp", () => {
    const planned = planFirstRealOrderStart(awaiting, firstAt);
    assert.equal(planned.mode, "start");
    assert.equal(planned.has_first_order, true);
    assert.equal(planned.first_order_date.toISOString(), firstAt.toISOString());
    assert.equal(planned.actual_start_date.toISOString(), firstAt.toISOString());
    assert.equal(planned.status, "active");
  });

  it("calculates expiry from the stored duration", () => {
    const planned = planFirstRealOrderStart(awaiting, firstAt);
    assert.equal(planned.expiry_date.toISOString(), "2026-12-02T09:30:00.000Z");
    assert.equal(planned.entitlement_duration_months, 1);
  });

  it("does not move dates on a later order", () => {
    const first = planFirstRealOrderStart(awaiting, firstAt);
    const again = planFirstRealOrderStart(
      {
        ...awaiting,
        has_first_order: true,
        status: "active",
        actual_start_date: first.actual_start_date,
        expiry_date: first.expiry_date,
        first_order_date: first.first_order_date,
      },
      secondAt,
    );
    assert.equal(again.mode, "unchanged");
    assert.equal(again.reason, "already_started");
  });

  it("uses the stored months instead of the plan day length", () => {
    const planned = planFirstRealOrderStart({ ...awaiting, plan_duration_days: 400, entitlement_duration_months: 3 }, firstAt);
    assert.equal(planned.expiry_date.toISOString(), "2027-02-02T09:30:00.000Z");
  });
});

describe("orders that must not start the countdown", () => {
  it("does not start from the fake/training order service", () => {
    assert.doesNotMatch(fakeSrc, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
    assert.doesNotMatch(fakeSrc, /activateCurrentSubscriptionOnFirstOrder/);
  });

  it("does not start from bid submission", () => {
    const block = sliceBetween(ordersSrc, "async function submitPoolOrderBid", "async function claimPoolOrder");
    assert.doesNotMatch(block, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
  });

  it("keeps the existing real-assignment callers", () => {
    for (const name of [
      "async function claimPoolOrder",
      "async function approvePoolClaimAdmin",
      "async function approveInternalPricedBidAdmin",
      "async function approvePoolClaimClient",
    ]) {
      const block = sliceBetween(ordersSrc, name, "async function ");
      assert.match(block, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
    }
  });
});

describe("package change and financial boundary", () => {
  it("inserts a pre-first-order row and does not restart a started countdown", () => {
    const block = sliceBetween(
      subsSrc,
      "async function activateAdminPackageEntitlement",
      "async function assertFreelancerMayAccessRealPoolOrders",
    );
    assert.match(block, /'assigned_not_started',FALSE,NULL,NULL,NULL/);
    assert.match(block, /entitlement_duration_months/);
    assert.match(block, /has_first_order = TRUE/);
    assert.match(block, /actual_start_date IS NOT NULL/);
    assert.doesNotMatch(block, /markActivationFeePaidOffline/);
    assert.doesNotMatch(block, /stripe_session_id|wallet|invoice/i);
  });
});

describe("premature countdown correction", () => {
  it("clears dates when the drawer entitlement has no real first order", () => {
    const decision = classifyPrematureAdminEntitlement({
      notes: "ADMIN_PACKAGE_ENTITLEMENT",
      has_first_order: false,
      first_order_id: null,
      hasAcceptedRealOrder: false,
      legacyAssignment: false,
      actual_start_date: "2026-09-27T00:00:00.000Z",
      expiry_date: "2026-10-27T00:00:00.000Z",
      source: "admin",
      payment_status: "not_required",
    });
    assert.equal(decision.action, "correct");
    assert.equal(decision.status, "assigned_not_started");
    assert.equal(decision.actual_start_date, null);
    assert.equal(decision.expiry_date, null);
    assert.equal(decision.first_order_date, null);
    assert.equal(decision.has_first_order, false);
    assert.equal(decision.entitlement_duration_months, 1);
    assert.equal(decision.activation_status, "company_approved");
  });

  it("does not correct a row that already has a real order", () => {
    const decision = classifyPrematureAdminEntitlement({
      notes: "ADMIN_PACKAGE_ENTITLEMENT",
      has_first_order: false,
      hasAcceptedRealOrder: true,
      actual_start_date: "2026-09-27T00:00:00.000Z",
      expiry_date: "2026-10-27T00:00:00.000Z",
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.reason, "real_order");
  });

  it("does not correct a legacy dated assignment", () => {
    const decision = classifyPrematureAdminEntitlement({
      notes: "LEGACY_ADMIN_ASSIGNMENT",
      has_first_order: false,
      actual_start_date: "2026-09-01T00:00:00.000Z",
      expiry_date: "2026-12-01T00:00:00.000Z",
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.reason, "not_drawer_entitlement");
  });
});
