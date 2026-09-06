/**
 * Marketplace Membership Phase 3 — Priority Bid usage accounting (in-memory).
 * Run: node --test test/marketplacePriorityBidUsageAccounting.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  priorityBidRemaining,
  createInMemoryPriorityBidUsageStore,
} = require("../src/utils/marketplacePriorityBidUsageAccounting");

describe("priorityBidRemaining", () => {
  it("never goes negative", () => {
    assert.strictEqual(priorityBidRemaining(3, 1), 2);
    assert.strictEqual(priorityBidRemaining(1, 1), 0);
    assert.strictEqual(priorityBidRemaining(1, 5), 0);
  });
});

describe("plan allowances", () => {
  it("Pay As You Work allowed=1", () => {
    const store = createInMemoryPriorityBidUsageStore({ allowed: 1 });
    const first = store.consume({ referenceType: "test", referenceId: "a" });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.idempotent, false);
    assert.strictEqual(first.allowed, 1);
    assert.strictEqual(first.used, 1);
    assert.strictEqual(first.remaining, 0);
    const second = store.consume({ referenceType: "test", referenceId: "b" });
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.code, "PRIORITY_BID_USES_EXHAUSTED");
  });

  it("Active allowed=2 blocks third", () => {
    const store = createInMemoryPriorityBidUsageStore({ allowed: 2 });
    store.consume({ referenceType: "t", referenceId: "1" });
    store.consume({ referenceType: "t", referenceId: "2" });
    const third = store.consume({ referenceType: "t", referenceId: "3" });
    assert.strictEqual(third.ok, false);
  });

  it("Pro=3 Elite=4", () => {
    const pro = createInMemoryPriorityBidUsageStore({ allowed: 3 });
    for (let i = 0; i < 3; i += 1) {
      assert.strictEqual(pro.consume({ referenceType: "t", referenceId: `p${i}` }).ok, true);
    }
    assert.strictEqual(pro.consume({ referenceType: "t", referenceId: "px" }).ok, false);

    const elite = createInMemoryPriorityBidUsageStore({ allowed: 4 });
    for (let i = 0; i < 4; i += 1) {
      assert.strictEqual(elite.consume({ referenceType: "t", referenceId: `e${i}` }).ok, true);
    }
    assert.strictEqual(elite.consume({ referenceType: "t", referenceId: "ex" }).ok, false);
  });
});

describe("return + idempotency", () => {
  it("return restores once; second return is idempotent", () => {
    const store = createInMemoryPriorityBidUsageStore({ allowed: 2 });
    store.consume({ referenceType: "auction_bid", referenceId: "bid-1" });
    assert.strictEqual(store.snapshot().remaining, 1);
    const r1 = store.returnUse({ referenceType: "auction_bid", referenceId: "bid-1" });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.idempotent, false);
    assert.strictEqual(r1.remaining, 2);
    const r2 = store.returnUse({ referenceType: "auction_bid", referenceId: "bid-1" });
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r2.idempotent, true);
    assert.strictEqual(r2.remaining, 2);
  });

  it("consume idempotent on same reference", () => {
    const store = createInMemoryPriorityBidUsageStore({ allowed: 2 });
    const a = store.consume({ referenceType: "x", referenceId: "same" });
    const b = store.consume({ referenceType: "x", referenceId: "same" });
    assert.strictEqual(a.idempotent, false);
    assert.strictEqual(b.idempotent, true);
    assert.strictEqual(store.snapshot().used, 1);
  });
});

describe("concurrency last-use race", () => {
  it("only one succeeds when remaining=1", () => {
    const store = createInMemoryPriorityBidUsageStore({ allowed: 1 });
    const race = store.raceConsumeLastSlots([
      { referenceType: "t", referenceId: "r1" },
      { referenceType: "t", referenceId: "r2" },
      { referenceType: "t", referenceId: "r3" },
    ]);
    assert.strictEqual(race.successCount, 1);
    assert.strictEqual(race.remaining, 0);
    assert.strictEqual(race.used, 1);
  });
});

describe("plan snapshot semantics (cycle keeps old allowance)", () => {
  it("current cycle stays at 3 after plan moves to 5", () => {
    const currentCycleAllowed = 3;
    const store = createInMemoryPriorityBidUsageStore({ allowed: currentCycleAllowed });
    store.consume({ referenceType: "t", referenceId: "1" });
    const planUpdatedAllowed = 5;
    // Next cycle would use planUpdatedAllowed — current store unchanged
    assert.strictEqual(store.snapshot().allowed, 3);
    assert.notStrictEqual(store.snapshot().allowed, planUpdatedAllowed);
    const next = createInMemoryPriorityBidUsageStore({ allowed: planUpdatedAllowed });
    assert.strictEqual(next.snapshot().allowed, 5);
  });
});
