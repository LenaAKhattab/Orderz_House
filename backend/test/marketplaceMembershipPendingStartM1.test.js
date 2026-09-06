/**
 * Marketplace-M1 — purchased_pending_start model (static + pure helpers).
 * Does NOT apply migration 181. Does NOT touch Production / Stripe / seed.
 *
 * Run: node --test test/marketplaceMembershipPendingStartM1.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_membership_m1_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { scanSqlForDangerousStatements } = require("../scripts/lib/assertScriptDatabaseAllowed");
const {
  MEMBERSHIP_STATUSES,
  CURRENT_ALLOWED_MEMBERSHIP_STATUSES,
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
  MEMBERSHIP_AUDIT_ACTIONS,
  assertMembershipCurrentStatusConsistency,
  isBenefitUsableStatus,
} = require("../src/constants/marketplaceMemberships");
const {
  PAID_MEMBERSHIP_PERIOD_START,
  PAID_MEMBERSHIP_STRIPE_PERIOD_START,
  PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES,
  PAID_MEMBERSHIP_ACTIVATION_REQUIRES_TRAINING,
  MEMBERSHIP_ACTIVATION_REQUIRES_VERIFICATION,
} = require("../src/constants/marketplaceMembershipPlans");
const {
  PURCHASED_PENDING_START_MESSAGE_AR,
  isPaidMarketplaceMembershipTier,
  isPurchasedPendingStartStatus,
  isApplicationEligibleStatus,
  computePaidTermWindowFromDurationDays,
  isRealOrderForMarketplaceMembershipStart,
  decideMarketplaceMembershipFirstOrderStart,
} = require("../src/utils/marketplaceMembershipPendingStart");
const membershipsService = require("../src/services/marketplaceMembershipsService");
const eligibilityService = require("../src/services/marketplaceMembershipEligibilityService");
const activationRequestService = require("../src/services/marketplaceMembershipActivationRequestService");

const root = path.join(__dirname, "..");
const migrationPath = path.join(
  root,
  "sql/migrations/181_marketplace_membership_purchased_pending_start_m1.sql",
);

describe("M1 migration 181 additive safety", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("adds purchased_pending_start + payment_pending to status CHECK", () => {
    assert.match(sql, /'purchased_pending_start'/);
    assert.match(sql, /'payment_pending'/);
    assert.match(sql, /freelancer_marketplace_memberships_status_check/);
    assert.match(sql, /freelancer_marketplace_memberships_current_status_consistency/);
  });

  it("adds nullable pending-start columns and purchase ref unique", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS purchased_at/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS first_order_started_at/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS start_trigger_order_id/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS purchase_payment_reference/);
    assert.match(sql, /freelancer_marketplace_memberships_purchase_payment_ref_uidx/);
  });

  it("is additive only — no DROP TABLE/COLUMN; dangerous scan clean", () => {
    assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
    assert.doesNotMatch(sql, /\bDROP\s+COLUMN\b/i);
    assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/i);
    // Allow DROP CONSTRAINT IF EXISTS (required to widen status CHECK additively).
    assert.match(sql, /DROP CONSTRAINT IF EXISTS freelancer_marketplace_memberships_status_check/);
    const scan = scanSqlForDangerousStatements(sql);
    assert.equal(scan.dangerous, false);
  });

  it("registers schema_migrations 181", () => {
    assert.match(
      sql,
      /INSERT INTO schema_migrations \(version\)\s*VALUES \('181_marketplace_membership_purchased_pending_start_m1'\)/,
    );
  });
});

describe("M1 status model constants", () => {
  it("includes payment_pending and purchased_pending_start as current-allowed", () => {
    assert.ok(MEMBERSHIP_STATUSES.includes("payment_pending"));
    assert.ok(MEMBERSHIP_STATUSES.includes("purchased_pending_start"));
    assert.ok(CURRENT_ALLOWED_MEMBERSHIP_STATUSES.includes("purchased_pending_start"));
    assert.ok(CURRENT_ALLOWED_MEMBERSHIP_STATUSES.includes("payment_pending"));
    assert.equal(
      assertMembershipCurrentStatusConsistency({
        status: "purchased_pending_start",
        isCurrent: true,
      }).ok,
      true,
    );
  });

  it("does not treat purchased_pending_start as benefit-usable (bid consume)", () => {
    assert.equal(isBenefitUsableStatus("purchased_pending_start"), false);
    assert.deepEqual([...BENEFIT_USABLE_MEMBERSHIP_STATUSES], ["active", "cancel_at_period_end"]);
    assert.equal(isApplicationEligibleStatus("purchased_pending_start"), true);
    assert.equal(isApplicationEligibleStatus("active"), true);
    assert.equal(isApplicationEligibleStatus("suspended"), false);
  });

  it("locks Stripe period start vs admin approval start policies", () => {
    assert.equal(PAID_MEMBERSHIP_PERIOD_START, "COMPANY_APPROVAL_TIME");
    assert.equal(PAID_MEMBERSHIP_STRIPE_PERIOD_START, "FIRST_REAL_ORDER");
    assert.ok(PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES.includes("silver"));
    assert.ok(PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES.includes("pro"));
    assert.ok(PAID_MARKETPLACE_MEMBERSHIP_TIER_CODES.includes("elite"));
    assert.equal(isPaidMarketplaceMembershipTier("starter"), false);
    assert.equal(isPaidMarketplaceMembershipTier("SILVER"), true);
    assert.equal(isPaidMarketplaceMembershipTier("special_offer"), true);
    assert.equal(isPaidMarketplaceMembershipTier("special_offer_v2"), true);
  });

  it("exposes Arabic purchased_pending_start message", () => {
    assert.match(PURCHASED_PENDING_START_MESSAGE_AR, /تم شراء العضوية بنجاح/);
    assert.match(PURCHASED_PENDING_START_MESSAGE_AR, /أول طلب/);
    assert.match(PURCHASED_PENDING_START_MESSAGE_AR, /توثيق الهوية والتدريب/);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_PURCHASED_PENDING_START);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_TERM_STARTED_ON_FIRST_ORDER);
  });
});

describe("M1 create purchased_pending_start semantics (pure)", () => {
  it("paid plan creates pending-start shape: term null, purchased set", () => {
    const purchasedAt = new Date("2026-08-25T10:00:00.000Z");
    const row = {
      id: 1,
      freelancer_user_id: 9,
      marketplace_plan_id: 3,
      is_current: true,
      status: "purchased_pending_start",
      source: "stripe",
      cycle_anchor_day: 25,
      started_at: null,
      paid_term_starts_at: null,
      paid_term_ends_at: null,
      purchased_at: purchasedAt,
      first_order_started_at: null,
      start_trigger_order_id: null,
      purchase_payment_reference: "cs_test_abc",
      cancel_at_period_end: false,
      auto_renew: false,
    };
    const m = membershipsService.mapMembership(row);
    assert.equal(m.status, "purchased_pending_start");
    assert.equal(m.paidTermStartsAt, null);
    assert.equal(m.paidTermEndsAt, null);
    assert.ok(m.purchasedAt);
    assert.equal(m.startTriggerOrderId, null);
    assert.equal(m.purchasePaymentReference, "cs_test_abc");
    assert.equal(m.statusMessageAr, PURCHASED_PENDING_START_MESSAGE_AR);
    assert.equal(isPurchasedPendingStartStatus(m.status), true);
  });

  it("idempotency key uniqueness is modeled via purchase_payment_reference", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /purchase_payment_reference/);
    assert.match(sql, /UNIQUE INDEX[\s\S]*purchase_payment_ref_uidx/);
  });
});

describe("M1 start on first real order (pure)", () => {
  it("starts term: ends_at = starts_at + duration days", () => {
    const startsAt = new Date("2026-08-25T12:00:00.000Z");
    const { paidTermStartsAt, paidTermEndsAt } = computePaidTermWindowFromDurationDays({
      startsAt,
      durationDays: 30,
    });
    assert.equal(paidTermStartsAt.toISOString(), startsAt.toISOString());
    assert.equal(
      paidTermEndsAt.toISOString(),
      new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("accepts real orders; rejects fake/training/simulation markers", () => {
    assert.equal(
      isRealOrderForMarketplaceMembershipStart({
        id: 10,
        source_type: "client_created",
      }),
      true,
    );
    assert.equal(
      isRealOrderForMarketplaceMembershipStart({
        id: 11,
        source_type: "admin_created",
        is_fake: true,
      }),
      false,
    );
    assert.equal(
      isRealOrderForMarketplaceMembershipStart({
        id: 12,
        source_type: "admin_created",
        is_fake_or_training: true,
      }),
      false,
    );
    assert.equal(
      isRealOrderForMarketplaceMembershipStart({
        id: 13,
        source_type: "admin_created",
        is_simulation: true,
      }),
      false,
    );
    assert.equal(isRealOrderForMarketplaceMembershipStart(null), false);
  });

  it("decision: start once, noop on second, skip non-pending / non-real", () => {
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: { id: 1, source_type: "client_created" },
      }),
      "start",
    );
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "active",
        paidTermStartsAt: new Date("2026-08-01T00:00:00.000Z"),
        firstOrderStartedAt: new Date("2026-08-01T00:00:00.000Z"),
        orderRow: { id: 2, source_type: "client_created" },
      }),
      "noop_already_active",
    );
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: { id: 3, source_type: "admin_created", is_fake: true },
      }),
      "reject_non_real",
    );
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "expired",
        orderRow: { id: 4, source_type: "client_created" },
      }),
      "skip_wrong_status",
    );
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "cancelled",
        orderRow: { id: 5, source_type: "client_created" },
      }),
      "skip_wrong_status",
    );
    assert.equal(
      decideMarketplaceMembershipFirstOrderStart({
        membershipStatus: "purchased_pending_start",
        orderRow: null,
      }),
      "reject_missing_order",
    );
  });

  it("second order does not reset window when already active", () => {
    const firstStart = new Date("2026-08-01T00:00:00.000Z");
    const firstEnd = computePaidTermWindowFromDurationDays({
      startsAt: firstStart,
      durationDays: 30,
    }).paidTermEndsAt;
    const decision = decideMarketplaceMembershipFirstOrderStart({
      membershipStatus: "active",
      paidTermStartsAt: firstStart,
      firstOrderStartedAt: firstStart,
      orderRow: { id: 99, source_type: "client_created" },
    });
    assert.equal(decision, "noop_already_active");
    // Window unchanged by decision (service must not rewrite dates on noop).
    assert.equal(firstEnd.toISOString(), "2026-08-31T00:00:00.000Z");
  });
});

describe("M1 admin approval flow + gates preserved", () => {
  it("exports createAndActivate unchanged and pending-start helpers", () => {
    assert.equal(typeof membershipsService.createAndActivateMarketplaceMembership, "function");
    assert.equal(typeof membershipsService.createPurchasedPendingStartMembership, "function");
    assert.equal(typeof membershipsService.startMarketplaceMembershipOnFirstRealOrder, "function");
    assert.equal(typeof activationRequestService.approveActivationRequest, "function");
  });

  it("identity/training gates remain required for activation path constants", () => {
    assert.equal(MEMBERSHIP_ACTIVATION_REQUIRES_VERIFICATION, "YES");
    assert.equal(PAID_MEMBERSHIP_ACTIVATION_REQUIRES_TRAINING, "YES");
    assert.equal(typeof eligibilityService.assertMarketplaceVerificationComplete, "function");
    assert.equal(typeof eligibilityService.assertPaidTrainingComplete, "function");
  });

  it("article application service allows application-eligible pending-start + apply gates", () => {
    const src = fs.readFileSync(
      path.join(root, "src/services/marketplaceArticleApplicationsService.js"),
      "utf8",
    );
    assert.match(src, /isApplicationEligibleStatus/);
    assert.match(src, /assertMarketplaceApplyGates/);
    // Priority Bid / benefit consume remains benefit-usable only.
    assert.match(src, /isBenefitUsableStatus/);
  });

  it("ordersService still activates legacy subscription on first accepted order (M4 wires via subscriptionsService)", () => {
    const ordersSrc = fs.readFileSync(path.join(root, "src/services/ordersService.js"), "utf8");
    const subsSrc = fs.readFileSync(path.join(root, "src/services/subscriptionsService.js"), "utf8");
    assert.match(ordersSrc, /activateCurrentSubscriptionOnFirstAcceptedOrder/);
    assert.match(subsSrc, /maybeStartMarketplaceMembershipOnFirstRealOrder/);
  });
});
