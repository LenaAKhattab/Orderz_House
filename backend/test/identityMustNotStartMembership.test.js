/**
 * Identity and company approval must not start the marketplace membership countdown.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildAdminEntitlementFields,
  planFirstRealOrderStart,
  classifyPrematureAdminEntitlement,
  classifyFabricatedFirstOrderWithoutRealOrder,
} = require("../src/utils/adminPackageEntitlement");
const { evaluateFreelancerTakeOrdersEligibility } = require("../src/services/subscriptionsService");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function sliceBetween(src, start, end) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start);
  const j = src.indexOf(end, i + start.length);
  assert.ok(j > i, end);
  return src.slice(i, j);
}

const subsSrc = read("src/services/subscriptionsService.js");
const kycSrc = read("src/services/freelancerAccountActivationKycService.js");
const usersSrc = read("src/services/superAdminUsersControlService.js");
const legacySrc = read("src/services/legacyFreelancerInviteService.js");

describe("identity and company approval do not start membership", () => {
  const kycBlock = sliceBetween(
    subsSrc,
    "async function activateAccountAfterKycApproval",
    "async function recalculateSubscriptionDates",
  );
  const companyBlock = sliceBetween(
    subsSrc,
    "async function activateCompanyApprovalForSubscription",
    "async function ensureMarketplaceMembershipForSelfActivate",
  );
  const manualBlock = sliceBetween(usersSrc, "async function applyManualIdentityAction", "async function cancelCurrentPlan");
  const approveBlock = sliceBetween(kycSrc, "async function approveActivationRequest", "async function rejectActivationRequest");

  it("normal KYC approval does not write membership dates or a first order", () => {
    assert.doesNotMatch(kycBlock, /has_first_order = CASE/);
    assert.doesNotMatch(kycBlock, /actual_start_date = CASE/);
    assert.doesNotMatch(kycBlock, /first_order_date = CASE/);
    assert.doesNotMatch(kycBlock, /expiry_date = CASE/);
    assert.doesNotMatch(kycBlock, /status = 'active'/);
    assert.match(kycBlock, /assigned_not_started/);
    assert.match(kycBlock, /company_approved/);
    assert.match(approveBlock, /reviewed_at = NOW\(\)/);
    assert.match(approveBlock, /status = 'approved'/);
  });

  it("manual identity approval records identity timestamps only", () => {
    assert.match(manualBlock, /verified_at = NOW\(\)/);
    assert.match(manualBlock, /freelancer_identity_manual_verifications/);
    assert.doesNotMatch(manualBlock, /actual_start_date|expiry_date|has_first_order|first_order_date/);
  });

  it("company approval does not write membership dates", () => {
    assert.match(companyBlock, /activation_status = 'company_approved'/);
    assert.match(companyBlock, /assigned_not_started/);
    assert.doesNotMatch(companyBlock, /actual_start_date =/);
    assert.doesNotMatch(companyBlock, /expiry_date =/);
    assert.doesNotMatch(companyBlock, /has_first_order =/);
  });

  it("keeps an approved unstarted membership eligible", () => {
    const fields = buildAdminEntitlementFields({ durationMonths: 1 });
    const result = evaluateFreelancerTakeOrdersEligibility({
      status: "assigned_not_started",
      activationStatus: "company_approved",
      paymentStatus: fields.paymentStatus,
      hasFirstOrder: false,
      expiryDate: null,
    });
    assert.equal(fields.actualStartDate, null);
    assert.equal(result.eligible, true);
  });

  it("starts once on the first real order and ignores the second", () => {
    const firstAt = new Date("2026-11-02T09:30:00.000Z");
    const awaiting = {
      status: "assigned_not_started",
      has_first_order: false,
      actual_start_date: null,
      entitlement_duration_months: 1,
      notes: "ADMIN_PACKAGE_ENTITLEMENT",
      source: "admin",
      payment_status: "not_required",
    };
    const first = planFirstRealOrderStart(awaiting, firstAt);
    assert.equal(first.mode, "start");
    assert.equal(first.actual_start_date.toISOString(), firstAt.toISOString());
    assert.equal(first.first_order_date.toISOString(), firstAt.toISOString());
    const second = planFirstRealOrderStart(
      { ...awaiting, has_first_order: true, status: "active", actual_start_date: first.actual_start_date },
      new Date("2026-12-01T00:00:00.000Z"),
    );
    assert.equal(second.mode, "unchanged");
    assert.equal(second.reason, "already_started");
  });

  it("keeps the first-order update conditional", () => {
    const block = sliceBetween(
      subsSrc,
      "async function activateCurrentSubscriptionOnFirstAcceptedOrder",
      "async function fulfillFreelancerSubscriptionStripePayment",
    );
    assert.match(block, /AND has_first_order = FALSE/);
    assert.match(block, /AND first_order_date IS NULL/);
  });

  it("does not create Stripe or wallet rows from KYC approval", () => {
    assert.doesNotMatch(kycBlock, /stripe_session_id|wallet|invoice/i);
  });

  it("leaves legacy fixed-window assignment on its own dated insert", () => {
    const block = sliceBetween(legacySrc, "async function assignLegacySubscription", "async function ");
    assert.match(block, /actual_start_date/);
    assert.match(block, /LEGACY_ADMIN_ASSIGNMENT/);
    assert.match(block, /has_first_order/);
    const decision = classifyPrematureAdminEntitlement({
      notes: "LEGACY_ADMIN_ASSIGNMENT",
      has_first_order: false,
      actual_start_date: "2026-01-01T00:00:00.000Z",
      expiry_date: "2026-04-01T00:00:00.000Z",
    });
    assert.equal(decision.action, "skip");
  });
});

describe("fabricated first-order classification", () => {
  it("corrects an identity-started row with no real order", () => {
    const decision = classifyFabricatedFirstOrderWithoutRealOrder({
      has_first_order: true,
      first_order_id: null,
      hasAcceptedRealOrder: false,
      legacyAssignment: false,
      actual_start_date: "2026-09-01T00:00:00.000Z",
      expiry_date: "2026-10-01T00:00:00.000Z",
      notes: null,
    });
    assert.equal(decision.action, "correct");
    assert.equal(decision.has_first_order, false);
    assert.equal(decision.actual_start_date, null);
    assert.equal(decision.expiry_date, null);
    assert.equal(decision.status, "assigned_not_started");
    assert.equal(decision.entitlement_duration_months, 1);
  });

  it("does not correct a real first order, legacy row, or stripe recurring row", () => {
    assert.equal(
      classifyFabricatedFirstOrderWithoutRealOrder({
        has_first_order: true,
        hasAcceptedRealOrder: true,
        actual_start_date: "2026-09-01T00:00:00.000Z",
        expiry_date: "2026-10-01T00:00:00.000Z",
      }).reason,
      "real_order",
    );
    assert.equal(
      classifyFabricatedFirstOrderWithoutRealOrder({
        has_first_order: true,
        legacyAssignment: true,
        actual_start_date: "2026-09-01T00:00:00.000Z",
        expiry_date: "2026-10-01T00:00:00.000Z",
      }).reason,
      "legacy_assignment",
    );
    assert.equal(
      classifyFabricatedFirstOrderWithoutRealOrder({
        has_first_order: true,
        stripe_subscription_id: "sub_123",
        actual_start_date: "2026-09-01T00:00:00.000Z",
        expiry_date: "2026-10-01T00:00:00.000Z",
      }).reason,
      "stripe_recurring",
    );
  });
});
