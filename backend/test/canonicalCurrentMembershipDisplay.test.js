/**
 * Current marketplace membership display follows the canonical
 * freelancer_subscriptions row. Display only — no status or date writes.
 * Run: node --test test/canonicalCurrentMembershipDisplay.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveCanonicalMarketplaceDisplay,
  alignMembershipSnapshotToCanonical,
} = require("../src/services/canonicalCurrentMembershipDisplay");

const SUBS_PATH = path.join(__dirname, "..", "src", "services", "subscriptionsService.js");
const SNAPSHOT_PATH = path.join(__dirname, "..", "src", "services", "marketplaceMembershipsService.js");
const DISPLAY_PATH = path.join(__dirname, "..", "src", "services", "canonicalCurrentMembershipDisplay.js");

function proAssigned(overrides = {}) {
  return {
    isCurrent: true,
    status: "assigned_not_started",
    activationStatus: "company_approved",
    hasFirstOrder: false,
    actualStartDate: null,
    expiryDate: null,
    plan: { name: "marketplace_membership_pro", title: "PRO" },
    ...overrides,
  };
}

function starterMarketplaceSnapshot() {
  return {
    hasMembership: true,
    membership: {
      id: "m-starter",
      status: "starter_pending_start",
      starterPendingStart: true,
      canStartStarterTrial: true,
      paidTermStartsAt: null,
      paidTermEndsAt: null,
      plan: { tierCode: "STARTER", nameAr: "البداية" },
    },
    currentCycle: { id: "cycle-1", endsAt: "2026-01-01" },
  };
}

describe("canonical current membership display", () => {
  it("PRO company_approved assigned_not_started is the current PRO membership", () => {
    const canonical = resolveCanonicalMarketplaceDisplay(proAssigned());
    const snap = alignMembershipSnapshotToCanonical(starterMarketplaceSnapshot(), canonical);
    assert.equal(canonical.tierCode, "PRO");
    assert.equal(canonical.membershipStatus, "assigned_not_started");
    assert.equal(canonical.countdownStarted, false);
    assert.equal(snap.currentPlanCode, "PRO");
    assert.equal(snap.membershipStatus, "assigned_not_started");
    assert.equal(snap.companyApproval, "company_approved");
    assert.equal(snap.membership.plan.tierCode, "PRO");
    assert.equal(snap.membership.status, "assigned_not_started");
    assert.equal(snap.membership.starterPendingStart, false);
    assert.equal(snap.membership.paidTermStartsAt, null);
    assert.equal(snap.membership.paidTermEndsAt, null);
    assert.equal(snap.currentCycle, null);
  });

  it("does not treat STARTER marketplace row as current when PRO is assigned", () => {
    const snap = alignMembershipSnapshotToCanonical(
      starterMarketplaceSnapshot(),
      resolveCanonicalMarketplaceDisplay(proAssigned()),
    );
    assert.notEqual(snap.membership.plan.tierCode, "STARTER");
    assert.equal(snap.currentPlanCode, "PRO");
  });

  it("keeps active PRO current after the first real order starts the countdown", () => {
    const canonical = resolveCanonicalMarketplaceDisplay(
      proAssigned({
        status: "active",
        hasFirstOrder: true,
        actualStartDate: "2026-09-01T00:00:00.000Z",
        expiryDate: "2026-10-01T00:00:00.000Z",
      }),
    );
    const snap = alignMembershipSnapshotToCanonical(starterMarketplaceSnapshot(), canonical);
    assert.equal(canonical.countdownStarted, true);
    assert.equal(canonical.waitingForFirstOrder, false);
    assert.equal(snap.currentPlanCode, "PRO");
    assert.equal(snap.membership.status, "active");
    assert.equal(snap.membership.paidTermStartsAt, "2026-09-01T00:00:00.000Z");
    assert.equal(snap.membership.paidTermEndsAt, "2026-10-01T00:00:00.000Z");
  });

  it("expired PRO is not current, so a valid STARTER subscription is selected", () => {
    assert.equal(
      resolveCanonicalMarketplaceDisplay(proAssigned({ status: "expired" })),
      null,
    );
    const starter = resolveCanonicalMarketplaceDisplay({
      isCurrent: true,
      status: "active",
      activationStatus: "company_approved",
      actualStartDate: "2026-08-01T00:00:00.000Z",
      expiryDate: "2026-09-01T00:00:00.000Z",
      plan: { name: "marketplace_membership_starter", title: "STARTER" },
    });
    assert.equal(starter.tierCode, "STARTER");
    assert.equal(starter.membershipStatus, "active");
  });

  it("historical Starter does not win over the newer current PRO assignment", () => {
    assert.equal(
      resolveCanonicalMarketplaceDisplay(
        proAssigned({
          isCurrent: false,
          status: "active",
          plan: { name: "marketplace_membership_starter", title: "STARTER" },
        }),
      ),
      null,
    );
    assert.equal(resolveCanonicalMarketplaceDisplay(proAssigned()).tierCode, "PRO");
  });

  it("cancelled and superseded plans are not current", () => {
    assert.equal(resolveCanonicalMarketplaceDisplay(proAssigned({ status: "cancelled" })), null);
    assert.equal(resolveCanonicalMarketplaceDisplay(proAssigned({ status: "superseded" })), null);
    assert.equal(
      resolveCanonicalMarketplaceDisplay(
        proAssigned({ activationStatus: "pending_company" }),
      ),
      null,
    );
  });

  it("no subscription leaves the existing snapshot untouched", () => {
    const empty = { hasMembership: false, membership: null, currentCycle: null };
    assert.equal(resolveCanonicalMarketplaceDisplay(null), null);
    assert.equal(alignMembershipSnapshotToCanonical(empty, null), empty);
    const starter = starterMarketplaceSnapshot();
    assert.equal(alignMembershipSnapshotToCanonical(starter, null), starter);
  });

  it("admin current plan and freelancer current plan use the same subscription tier", () => {
    const subscription = proAssigned();
    const adminPlan = String(subscription.plan.title).toUpperCase();
    const freelancer = alignMembershipSnapshotToCanonical(
      starterMarketplaceSnapshot(),
      resolveCanonicalMarketplaceDisplay(subscription),
    );
    assert.equal(adminPlan, "PRO");
    assert.equal(freelancer.currentPlanCode, adminPlan);
  });

  it("maps a PRO title even when the bridge name is absent", () => {
    const canonical = resolveCanonicalMarketplaceDisplay(
      proAssigned({ plan: { name: "hidden_plan_row", title: "PRO" } }),
    );
    assert.equal(canonical.tierCode, "PRO");
  });

  it("does not invent dates while waiting for the first order", () => {
    const canonical = resolveCanonicalMarketplaceDisplay(proAssigned());
    assert.equal(canonical.actualStartDate, null);
    assert.equal(canonical.expiryDate, null);
    assert.equal(canonical.waitingForFirstOrder, true);
  });
});

describe("first-order timing stays on the subscription activator", () => {
  it("display resolver does not write subscriptions or start the countdown", () => {
    const src = fs.readFileSync(DISPLAY_PATH, "utf8");
    assert.doesNotMatch(src, /UPDATE|INSERT|activateCurrentSubscriptionOnFirst/);
  });

  it("first accepted order still starts assigned_not_started only inside the activator", () => {
    const src = fs.readFileSync(SUBS_PATH, "utf8");
    const fnStart = src.indexOf("async function activateCurrentSubscriptionOnFirstOrder");
    const fnEnd = src.indexOf("async function activateCurrentSubscriptionOnFirstAcceptedOrder", fnStart);
    const block = src.slice(fnStart, fnEnd);
    assert.match(block, /actual_start_date = \$2/);
    assert.match(block, /status = 'assigned_not_started' AND actual_start_date IS NULL/);
    assert.match(block, /SUBSCRIPTION_STATUSES\.ACTIVE/);
    assert.match(src, /async function activateCurrentSubscriptionOnFirstAcceptedOrder/);
  });

  it("packages snapshot reads the current subscription and does not create STARTER over it", () => {
    const src = fs.readFileSync(SNAPSHOT_PATH, "utf8");
    assert.match(src, /getCurrentSubscriptionForFreelancer/);
    assert.match(src, /!membership && !canonicalDisplay && options\.ensureStarterPending !== false/);
    assert.match(src, /alignMembershipSnapshotToCanonical/);
  });
});
