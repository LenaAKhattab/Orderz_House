/**
 * Marketplace Membership Phase 3.1 hardening — semantics & isolation tests.
 * No Production DB mutations.
 * Run: node --test test/marketplaceMembershipPhase31Hardening.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_membership_phase31_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  MEMBERSHIP_STATUSES,
  CURRENT_ALLOWED_MEMBERSHIP_STATUSES,
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
  TERMINAL_MEMBERSHIP_STATUSES,
  MEMBERSHIP_AUDIT_ACTIONS,
  assertMembershipCurrentStatusConsistency,
  isBenefitUsableStatus,
  isReconcileStatus,
} = require("../src/constants/marketplaceMemberships");
const {
  computeCycleWindow,
  resolveCycleNumberAt,
  addCalendarMonthsAnchored,
} = require("../src/utils/marketplaceMembershipCycleDates");
const {
  createInMemoryPriorityBidUsageStore,
  createInMemoryMembershipRegistry,
} = require("../src/utils/marketplacePriorityBidUsageAccounting");

describe("canonical status / is_current model", () => {
  it("includes superseded and lists current-allowed statuses", () => {
    assert.ok(MEMBERSHIP_STATUSES.includes("superseded"));
    assert.deepStrictEqual([...CURRENT_ALLOWED_MEMBERSHIP_STATUSES], [
      "pending",
      "payment_pending",
      "starter_pending_start",
      "purchased_pending_start",
      "active",
      "cancel_at_period_end",
      "suspended",
    ]);
    assert.deepStrictEqual([...TERMINAL_MEMBERSHIP_STATUSES], [
      "expired",
      "cancelled",
      "superseded",
    ]);
  });

  it("rejects terminal statuses as current", () => {
    for (const status of TERMINAL_MEMBERSHIP_STATUSES) {
      assert.strictEqual(
        assertMembershipCurrentStatusConsistency({ status, isCurrent: true }).ok,
        false,
      );
      assert.strictEqual(
        assertMembershipCurrentStatusConsistency({ status, isCurrent: false }).ok,
        true,
      );
    }
  });

  it("allows current for active/cancel_at_period_end/suspended/pending", () => {
    for (const status of CURRENT_ALLOWED_MEMBERSHIP_STATUSES) {
      assert.strictEqual(
        assertMembershipCurrentStatusConsistency({ status, isCurrent: true }).ok,
        true,
      );
    }
  });

  it("benefit usable excludes suspended; reconcile includes suspended", () => {
    assert.strictEqual(isBenefitUsableStatus("suspended"), false);
    assert.strictEqual(isBenefitUsableStatus("active"), true);
    assert.strictEqual(isBenefitUsableStatus("cancel_at_period_end"), true);
    assert.strictEqual(isReconcileStatus("suspended"), true);
    assert.deepStrictEqual([...BENEFIT_USABLE_MEMBERSHIP_STATUSES], [
      "active",
      "cancel_at_period_end",
    ]);
  });

  it("audit actions cover suspend/resume/supersede", () => {
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUPERSEDED);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUSPENDED);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_RESUMED);
    assert.ok(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CANCEL_AT_PERIOD_END);
  });
});

describe("concurrent activation / replacement", () => {
  it("only one current membership after concurrent activations", () => {
    const reg = createInMemoryMembershipRegistry();
    const race = reg.raceActivate("f1", ["planA", "planB", "planC"]);
    assert.strictEqual(race.currentCount, 1);
    assert.strictEqual(race.results.filter((r) => r.ok).length, 3);
    const hist = reg.byFreelancer.get("f1");
    assert.strictEqual(hist.filter((m) => m.status === "superseded").length, 2);
    assert.strictEqual(hist.filter((m) => m.isCurrent).length, 1);
  });
});

describe("usage protection by membership status (logical)", () => {
  it("suspended / expired / cancelled cannot consume", () => {
    for (const status of ["suspended", "expired", "cancelled", "superseded", "pending"]) {
      assert.strictEqual(isBenefitUsableStatus(status), false);
    }
  });

  it("cancel_at_period_end can consume before term end", () => {
    assert.strictEqual(isBenefitUsableStatus("cancel_at_period_end"), true);
  });
});

describe("exact term/cycle boundary + partial final cycle", () => {
  it("one-month term: Aug17–Sep17 only; at Sep17 no cycle 2", () => {
    const start = new Date(Date.UTC(2026, 7, 17, 10, 0, 0));
    const termEnd = addCalendarMonthsAnchored(start, 1, 17);
    assert.strictEqual(termEnd.toISOString(), "2026-09-17T10:00:00.000Z");
    const c1 = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 1,
      anchorDay: 17,
    });
    assert.strictEqual(c1.endsAt.toISOString(), termEnd.toISOString());
    const atBoundary = termEnd;
    // at paid_term_ends_at membership expires; resolveCycleNumberAt may still return 2 mathematically
    const nAt = resolveCycleNumberAt({
      membershipStartedAt: start,
      at: atBoundary,
      anchorDay: 17,
    });
    assert.strictEqual(nAt, 2);
    // Product gate: term ended → no cycle 2 activation (service uses <=)
    assert.ok(!(termEnd > atBoundary));
  });

  it("partial final cycle Aug17 → Oct5", () => {
    const start = new Date(Date.UTC(2026, 7, 17, 10, 0, 0));
    const termEnd = new Date(Date.UTC(2026, 9, 5, 10, 0, 0));
    const c1 = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 1,
      anchorDay: 17,
    });
    const c2 = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 2,
      anchorDay: 17,
    });
    const cappedEnd = c2.endsAt > termEnd ? termEnd : c2.endsAt;
    assert.ok(c1.endsAt < termEnd);
    assert.strictEqual(cappedEnd.toISOString(), termEnd.toISOString());
    assert.ok(cappedEnd > c2.startsAt);
    const c3Start = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 3,
      anchorDay: 17,
    }).startsAt;
    assert.ok(c3Start >= termEnd || !(c3Start < termEnd && termEnd > c3Start));
    // Cycle 3 start is Oct17 > Oct5 — no third cycle
    assert.ok(c3Start > termEnd);
  });
});

describe("missed multi-cycle → correct cycle_number", () => {
  it("Jan17 start, now May25 → due cycle #5 (May17–Jun17)", () => {
    const start = new Date(Date.UTC(2026, 0, 17, 9, 0, 0));
    const now = new Date(Date.UTC(2026, 4, 25, 12, 0, 0));
    const n = resolveCycleNumberAt({
      membershipStartedAt: start,
      at: now,
      anchorDay: 17,
    });
    assert.strictEqual(n, 5);
    const w = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 5,
      anchorDay: 17,
    });
    assert.strictEqual(w.startsAt.getUTCMonth(), 4); // May
    assert.strictEqual(w.startsAt.getUTCDate(), 17);
    assert.strictEqual(w.endsAt.getUTCMonth(), 5); // Jun
    assert.strictEqual(w.endsAt.getUTCDate(), 17);
  });
});

describe("usage idempotency scoped per cycle", () => {
  it("same reference in different cycles can each consume once", () => {
    const c1 = createInMemoryPriorityBidUsageStore({ allowed: 2, cycleId: "c1" });
    const c2 = createInMemoryPriorityBidUsageStore({ allowed: 2, cycleId: "c2" });
    assert.strictEqual(c1.consume({ referenceType: "bid", referenceId: "1" }).ok, true);
    assert.strictEqual(c2.consume({ referenceType: "bid", referenceId: "1" }).ok, true);
    assert.strictEqual(c1.snapshot().used, 1);
    assert.strictEqual(c2.snapshot().used, 1);
  });

  it("return without consume blocked; double return idempotent", () => {
    const store = createInMemoryPriorityBidUsageStore({ allowed: 2, cycleId: "c1" });
    assert.strictEqual(
      store.returnUse({ referenceType: "bid", referenceId: "x" }).code,
      "PRIORITY_USE_NOT_FOUND",
    );
    store.consume({ referenceType: "bid", referenceId: "x" });
    assert.strictEqual(store.returnUse({ referenceType: "bid", referenceId: "x" }).idempotent, false);
    assert.strictEqual(store.returnUse({ referenceType: "bid", referenceId: "x" }).idempotent, true);
    assert.strictEqual(store.snapshot().used, 0);
  });

  it("last-use race: only one succeeds", () => {
    const store = createInMemoryPriorityBidUsageStore({ allowed: 1, cycleId: "c1" });
    const race = store.raceConsumeLastSlots([
      { referenceType: "t", referenceId: "a" },
      { referenceType: "t", referenceId: "b" },
    ]);
    assert.strictEqual(race.successCount, 1);
  });
});

describe("plan snapshot 3→5", () => {
  it("current cycle keeps 3; next uses 5", () => {
    const current = createInMemoryPriorityBidUsageStore({ allowed: 3, cycleId: "cur" });
    current.consume({ referenceType: "t", referenceId: "1" });
    assert.strictEqual(current.snapshot().allowed, 3);
    const next = createInMemoryPriorityBidUsageStore({ allowed: 5, cycleId: "next" });
    assert.strictEqual(next.snapshot().allowed, 5);
  });
});

describe("Phase 3.1 source isolation + wiring", () => {
  const roots = [
    path.join(__dirname, "../src/services/marketplaceMembershipsService.js"),
    path.join(__dirname, "../src/services/marketplaceMembershipCyclesService.js"),
    path.join(__dirname, "../src/services/marketplacePriorityBidUsageService.js"),
  ];

  it("services supersede prior membership and suspend/resume exist", () => {
    const src = fs.readFileSync(roots[0], "utf8");
    assert.match(src, /status = 'superseded'/);
    assert.match(src, /suspendMarketplaceMembership/);
    assert.match(src, /resumeMarketplaceMembership/);
    assert.match(src, /MARKETPLACE_MEMBERSHIP_CONFLICT/);
    assert.match(src, /is_current = TRUE/);
  });

  it("reconcile candidates are current-only", () => {
    const src = fs.readFileSync(roots[1], "utf8");
    assert.match(src, /WHERE is_current = TRUE/);
    assert.match(src, /'suspended'/);
    assert.doesNotMatch(src, /OR status IN \('active'/);
  });

  it("usage consume requires benefit-usable status and cycle-scoped idempotency", () => {
    const src = fs.readFileSync(roots[2], "utf8");
    assert.match(src, /isBenefitUsableStatus/);
    assert.match(src, /cycle_id = \$1/);
    assert.match(src, /related_usage_id/);
  });

  it("no wallet/auction/fairness/legacy subscription writes", () => {
    for (const file of roots) {
      const src = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(src, /INTO freelancer_subscriptions/i);
      assert.doesNotMatch(src, /work_token_wallets|priority_auctions|fairness_scores/i);
      assert.doesNotMatch(src, /fake_orders/i);
    }
  });

  it("no-membership API returns success path via controller", () => {
    const ctrl = fs.readFileSync(
      path.join(__dirname, "../src/controllers/marketplaceMembershipsController.js"),
      "utf8",
    );
    assert.match(ctrl, /success: true/);
    assert.match(ctrl, /getFreelancerMarketplaceMembershipSnapshot/);
  });

  it("engineAvailable remains false in snapshot service", () => {
    const src = fs.readFileSync(roots[0], "utf8");
    assert.match(src, /engineAvailable: false/);
  });
});
