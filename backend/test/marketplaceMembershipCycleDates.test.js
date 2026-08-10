/**
 * Marketplace Membership Phase 3 — anniversary cycle date helpers.
 * Run: node --test test/marketplaceMembershipCycleDates.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  addCalendarMonthsAnchored,
  computeCycleWindow,
  resolveCycleNumberAt,
  resolveCycleAnchorDay,
  utcDateClamped,
} = require("../src/utils/marketplaceMembershipCycleDates");

describe("anniversary cycle windows", () => {
  it("A: start Aug 17 → cycle Aug17–Sep17", () => {
    const start = new Date(Date.UTC(2026, 7, 17, 12, 0, 0));
    const w = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 1,
      anchorDay: 17,
    });
    assert.strictEqual(w.startsAt.toISOString(), start.toISOString());
    assert.strictEqual(w.endsAt.getUTCFullYear(), 2026);
    assert.strictEqual(w.endsAt.getUTCMonth(), 8); // Sep
    assert.strictEqual(w.endsAt.getUTCDate(), 17);
  });

  it("B: next cycle Sep17–Oct17", () => {
    const start = new Date(Date.UTC(2026, 7, 17, 12, 0, 0));
    const w = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 2,
      anchorDay: 17,
    });
    assert.strictEqual(w.startsAt.getUTCMonth(), 8);
    assert.strictEqual(w.startsAt.getUTCDate(), 17);
    assert.strictEqual(w.endsAt.getUTCMonth(), 9);
    assert.strictEqual(w.endsAt.getUTCDate(), 17);
  });

  it("C: Jan 31 → Feb clamp → Mar restores to 31", () => {
    const start = new Date(Date.UTC(2026, 0, 31, 10, 0, 0));
    const anchor = resolveCycleAnchorDay(start);
    assert.strictEqual(anchor, 31);

    const feb = addCalendarMonthsAnchored(start, 1, anchor);
    assert.strictEqual(feb.getUTCMonth(), 1);
    assert.ok(feb.getUTCDate() === 28 || feb.getUTCDate() === 29);

    const mar = addCalendarMonthsAnchored(start, 2, anchor);
    assert.strictEqual(mar.getUTCMonth(), 2);
    assert.strictEqual(mar.getUTCDate(), 31);

    const c1 = computeCycleWindow({ membershipStartedAt: start, cycleNumber: 1, anchorDay: 31 });
    const c2 = computeCycleWindow({ membershipStartedAt: start, cycleNumber: 2, anchorDay: 31 });
    assert.ok(c2.startsAt.getTime() === c1.endsAt.getTime());
  });

  it("D: Feb leap year clamp", () => {
    // 2024 is leap year
    const d = utcDateClamped(2024, 1, 31);
    assert.strictEqual(d.getUTCFullYear(), 2024);
    assert.strictEqual(d.getUTCMonth(), 1);
    assert.strictEqual(d.getUTCDate(), 29);

    const nonLeap = utcDateClamped(2025, 1, 31);
    assert.strictEqual(nonLeap.getUTCDate(), 28);
  });

  it("E: prepaid 6 months does not create 6 cycle windows at once (helper only current)", () => {
    const start = new Date(Date.UTC(2026, 7, 17));
    const onlyCurrent = computeCycleWindow({
      membershipStartedAt: start,
      cycleNumber: 1,
      anchorDay: 17,
    });
    assert.strictEqual(onlyCurrent.cycleNumber, 1);
    // Six months later is cycle 7 start — not auto-created here
    const sixthBoundary = addCalendarMonthsAnchored(start, 6, 17);
    assert.strictEqual(sixthBoundary.getUTCMonth(), 1); // Feb 2027
    assert.strictEqual(sixthBoundary.getUTCDate(), 17);
  });

  it("F: resolveCycleNumberAt after missed boundary advances", () => {
    const start = new Date(Date.UTC(2026, 7, 17, 0, 0, 0));
    const midCycle2 = new Date(Date.UTC(2026, 8, 20, 0, 0, 0));
    const n = resolveCycleNumberAt({
      membershipStartedAt: start,
      at: midCycle2,
      anchorDay: 17,
    });
    assert.strictEqual(n, 2);
  });

  it("G: before membership start → null cycle number", () => {
    const start = new Date(Date.UTC(2026, 7, 17));
    const before = new Date(Date.UTC(2026, 7, 16));
    assert.strictEqual(
      resolveCycleNumberAt({ membershipStartedAt: start, at: before, anchorDay: 17 }),
      null,
    );
  });
});
