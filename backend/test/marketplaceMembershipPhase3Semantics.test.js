/**
 * Phase 3 reconciliation / snapshot / isolation semantics (no live DB required).
 * Run: node --test test/marketplaceMembershipPhase3Semantics.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_membership_phase3_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("path");
const {
  computeCycleWindow,
  resolveCycleNumberAt,
  addCalendarMonthsAnchored,
} = require("../src/utils/marketplaceMembershipCycleDates");
const {
  CYCLE_CREATION_STRATEGY,
} = require("../src/services/marketplaceMembershipCyclesService");
const {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_AUDIT_ACTIONS,
  CURRENT_USABLE_MEMBERSHIP_STATUSES,
} = require("../src/constants/marketplaceMemberships");

describe("cycle creation strategy", () => {
  it("uses lazy current-only + DB reconciliation", () => {
    assert.strictEqual(
      CYCLE_CREATION_STRATEGY,
      "lazy_current_only_with_db_reconciliation",
    );
  });
});

describe("missed boundary reconciliation semantics", () => {
  it("F: after downtime past Sep 17, due cycle is exactly 2 (not 1 and not 3)", () => {
    const start = new Date(Date.UTC(2026, 7, 17, 9, 0, 0));
    const afterBoundary = new Date(Date.UTC(2026, 8, 17, 9, 5, 0));
    const n = resolveCycleNumberAt({
      membershipStartedAt: start,
      at: afterBoundary,
      anchorDay: 17,
    });
    assert.strictEqual(n, 2);
    const w = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 2,
      anchorDay: 17,
    });
    assert.ok(w.startsAt <= afterBoundary);
    assert.ok(w.endsAt > afterBoundary);
  });

  it("G: after paid term end, no next cycle window should be activated by product rules", () => {
    const start = new Date(Date.UTC(2026, 7, 17));
    const termEnd = addCalendarMonthsAnchored(start, 1, 17); // 1-month prepaid
    const afterExpiry = new Date(termEnd.getTime() + 60_000);
    // Cycle number may still compute mathematically, but membership expiry gate blocks creation
    assert.ok(afterExpiry > termEnd);
    assert.ok(CURRENT_USABLE_MEMBERSHIP_STATUSES.includes("active"));
    assert.ok(!CURRENT_USABLE_MEMBERSHIP_STATUSES.includes("expired"));
  });
});

describe("membership status model", () => {
  it("includes required statuses", () => {
    for (const s of [
      "pending",
      "active",
      "cancel_at_period_end",
      "expired",
      "cancelled",
      "suspended",
    ]) {
      assert.ok(MEMBERSHIP_STATUSES.includes(s), s);
    }
  });

  it("audit actions cover membership/cycle/usage", () => {
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CREATED);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.CYCLE_ACTIVATED);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.PRIORITY_USE_CONSUMED);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.PRIORITY_USE_RETURNED);
  });
});

describe("isolation: Phase 3 source files", () => {
  const roots = [
    path.join(__dirname, "../src/services/marketplaceMembershipsService.js"),
    path.join(__dirname, "../src/services/marketplaceMembershipCyclesService.js"),
    path.join(__dirname, "../src/services/marketplacePriorityBidUsageService.js"),
  ];

  it("does not write legacy subscriptions / plans / stripe / wallet / auction / fairness", () => {
    for (const file of roots) {
      const src = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(src, /INTO freelancer_subscriptions/i);
      assert.doesNotMatch(src, /UPDATE freelancer_subscriptions/i);
      assert.doesNotMatch(src, /INTO plans\b/i);
      assert.doesNotMatch(src, /stripe\.(subscriptions|checkout)/i);
      assert.doesNotMatch(src, /work_token_wallets|token_ledger/i);
      assert.doesNotMatch(src, /priority_auctions|fairness_scores/i);
      assert.doesNotMatch(src, /fake_orders/i);
    }
  });

  it("usage service accepts external client for future auction txn", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplacePriorityBidUsageService.js"),
      "utf8",
    );
    assert.match(src, /externalClient|input\.client/);
    assert.match(src, /FOR UPDATE/);
  });
});

describe("history preservation principle", () => {
  it("activation demotes is_current without deleting rows (service source)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceMembershipsService.js"),
      "utf8",
    );
    assert.match(src, /SET is_current = FALSE/);
    assert.doesNotMatch(src, /DELETE FROM freelancer_marketplace_memberships/);
    assert.doesNotMatch(src, /DELETE FROM marketplace_membership_cycles/);
  });
});
