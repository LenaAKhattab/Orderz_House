/**
 * STARTER pending trial + start-trial gates (unit / service-level).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  isStarterPendingStartStatus,
  isApplicationEligibleStatus,
  STARTER_TRIAL_DURATION_DAYS,
  computePaidTermWindowFromDurationDays,
} = require("../src/utils/marketplaceMembershipPendingStart");
const {
  MEMBERSHIP_STATUSES,
  CURRENT_ALLOWED_MEMBERSHIP_STATUSES,
} = require("../src/constants/marketplaceMemberships");

describe("STARTER pending trial helpers", () => {
  it("recognizes starter_pending_start and excludes it from application eligibility", () => {
    assert.equal(isStarterPendingStartStatus("starter_pending_start"), true);
    assert.equal(isApplicationEligibleStatus("starter_pending_start"), false);
    assert.equal(isApplicationEligibleStatus("active"), true);
    assert.equal(isApplicationEligibleStatus("purchased_pending_start"), true);
  });

  it("includes starter_pending_start in membership status constants", () => {
    assert.ok(MEMBERSHIP_STATUSES.includes("starter_pending_start"));
    assert.ok(CURRENT_ALLOWED_MEMBERSHIP_STATUSES.includes("starter_pending_start"));
  });

  it("trial window is 10 days from startsAt", () => {
    assert.equal(STARTER_TRIAL_DURATION_DAYS, 10);
    const startsAt = new Date("2026-08-25T12:00:00.000Z");
    const { paidTermStartsAt, paidTermEndsAt } = computePaidTermWindowFromDurationDays({
      startsAt,
      durationDays: STARTER_TRIAL_DURATION_DAYS,
    });
    assert.equal(paidTermStartsAt.toISOString(), "2026-08-25T12:00:00.000Z");
    assert.equal(paidTermEndsAt.toISOString(), "2026-09-04T12:00:00.000Z");
  });

  it("migration 182 is additive and not auto-applied", () => {
    const mig = path.join(
      __dirname,
      "../sql/migrations/182_marketplace_membership_starter_pending_start.sql",
    );
    assert.ok(fs.existsSync(mig));
    const raw = fs.readFileSync(mig, "utf8");
    assert.match(raw, /starter_pending_start/);
    assert.doesNotMatch(raw, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(raw, /\bTRUNCATE\b/i);
    assert.doesNotMatch(raw, /\bDELETE\s+FROM\b/i);
  });

  it("routes expose start-trial and legacy activate alias", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/routes/freelancerMarketplaceMembershipRoutes.js"),
      "utf8",
    );
    assert.match(routes, /starter\/start-trial/);
    assert.match(routes, /starter\/activate/);
    assert.match(routes, /startStarterTrial/);
  });

  it("account activation grants pending entitlement, not immediate active", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceMembershipActivationRequestService.js"),
      "utf8",
    );
    assert.match(src, /ensureStarterPendingEntitlement/);
    assert.doesNotMatch(
      src,
      /activateStarterMembership\(\{[\s\S]*skipVerification:\s*true[\s\S]*createAndActivateMarketplaceMembership/,
    );
  });

  it("startStarterTrial service requires verification + training gates", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceMembershipsService.js"),
      "utf8",
    );
    assert.match(src, /async function startStarterTrial/);
    assert.match(src, /assertMarketplaceVerificationComplete/);
    assert.match(src, /assertPaidTrainingComplete/);
    assert.match(src, /starter_pending_start/);
    assert.match(src, /idempotent/);
  });
});
