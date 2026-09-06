/**
 * ACTIVE_NEW_BID_MODEL — Phase B3 membership Bid distribution lifecycle.
 * Math + static architecture. No Production mutations.
 *
 * Run: npm run test:marketplace-bid-credits-phase-b3
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_bid_credits_b3_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  cumulativeBidUnlock,
  dailyBidUnlockAmount,
  buildMonthlyBidUnlockSchedule,
  countUtcCalendarDaysInWindow,
  resolveCurrentDayIndex,
} = require("../src/utils/marketplaceBidCreditDistributionMath");
const {
  addCalendarMonthsAnchored,
  computeCycleWindow,
} = require("../src/utils/marketplaceMembershipCycleDates");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("ACTIVE_NEW_BID_MODEL Phase B3 distribution formula", () => {
  const allowances = [0, 1, 7, 30, 100, 3, 50, 220, 700];
  const dayCounts = [28, 29, 30, 31];

  for (const D of dayCounts) {
    for (const N of allowances) {
      it(`D=${D} N=${N}: final cumulative exactly N; no fractions`, () => {
        const schedule = buildMonthlyBidUnlockSchedule(N, D);
        assert.strictEqual(schedule.length, D);
        assert.ok(schedule.every((row) => Number.isInteger(row.amount)));
        assert.strictEqual(schedule.reduce((s, row) => s + row.amount, 0), N);
        assert.strictEqual(cumulativeBidUnlock(N, D, D), N);
        assert.strictEqual(cumulativeBidUnlock(N, 0, D), 0);
        for (let k = 1; k <= D; k += 1) {
          assert.strictEqual(
            dailyBidUnlockAmount(N, k, D),
            cumulativeBidUnlock(N, k, D) - cumulativeBidUnlock(N, k - 1, D),
          );
        }
      });
    }
  }

  it("N < D and N > D both conserve total N", () => {
    assert.strictEqual(buildMonthlyBidUnlockSchedule(3, 31).reduce((s, r) => s + r.amount, 0), 3);
    assert.strictEqual(buildMonthlyBidUnlockSchedule(100, 28).reduce((s, r) => s + r.amount, 0), 100);
  });
});

describe("ACTIVE_NEW_BID_MODEL Phase B3 day / window semantics", () => {
  it("UTC half-open window day count for 31-day anniversary month", () => {
    const start = new Date("2026-03-17T00:00:00.000Z");
    const end = new Date("2026-04-17T00:00:00.000Z");
    assert.strictEqual(countUtcCalendarDaysInWindow(start, end), 31);
    assert.strictEqual(resolveCurrentDayIndex(start, end, 31, start), 1);
    assert.strictEqual(
      resolveCurrentDayIndex(start, end, 31, new Date("2026-04-16T12:00:00.000Z")),
      31,
    );
    assert.strictEqual(resolveCurrentDayIndex(start, end, 31, end), 31);
    assert.strictEqual(
      resolveCurrentDayIndex(start, end, 31, new Date("2026-03-16T23:59:59.000Z")),
      0,
    );
  });

  it("Jan 31 anchored months clamp without drift", () => {
    const jan31 = new Date("2026-01-31T12:00:00.000Z");
    const feb = addCalendarMonthsAnchored(jan31, 1, 31);
    assert.strictEqual(feb.getUTCMonth(), 1);
    assert.ok(feb.getUTCDate() <= 28);
    const mar = addCalendarMonthsAnchored(jan31, 2, 31);
    assert.strictEqual(mar.getUTCMonth(), 2);
    assert.strictEqual(mar.getUTCDate(), 31);
  });

  it("leap vs non-leap February windows", () => {
    const leap = computeCycleWindow({
      membershipStartedAt: new Date("2024-01-31T00:00:00.000Z"),
      cycleNumber: 2,
      anchorDay: 31,
    });
    const nonLeap = computeCycleWindow({
      membershipStartedAt: new Date("2025-01-31T00:00:00.000Z"),
      cycleNumber: 2,
      anchorDay: 31,
    });
    const leapDays = countUtcCalendarDaysInWindow(leap.startsAt, leap.endsAt);
    const nonLeapDays = countUtcCalendarDaysInWindow(nonLeap.startsAt, nonLeap.endsAt);
    assert.strictEqual(leap.startsAt.getUTCDate(), 29);
    assert.strictEqual(nonLeap.startsAt.getUTCDate(), 28);
    assert.ok(leapDays >= 28 && leapDays <= 31);
    assert.ok(nonLeapDays >= 28 && nonLeapDays <= 31);
  });
});
describe("ACTIVE_NEW_BID_MODEL Phase B3 architecture wiring", () => {
  it("distribution service gates unlocks on engine + benefit-usable membership", () => {
    const src = read("src/services/marketplaceBidCreditDistributionService.js");
    assert.match(src, /isBidCreditsEngineActive/);
    assert.match(src, /BENEFIT_USABLE_MEMBERSHIP_STATUSES/);
    assert.match(src, /membership_suspended/);
    assert.match(src, /engine_off/);
    assert.match(src, /closeOpenDistributionMonthsForMembership/);
    assert.match(src, /floor\(N \* k \/ D\)|dailyBidUnlockAmount/);
  });

  it("cycle close stops further Bid unlocks", () => {
    const src = read("src/services/marketplaceMembershipCyclesService.js");
    assert.match(src, /closeOpenDistributionMonthsForMembership/);
  });

  it("annual model does not upfront-grant 12× allowance", () => {
    const dist = read("src/services/marketplaceBidCreditDistributionService.js");
    assert.match(dist, /each cycle month distributes its own monthly allowance/i);
    assert.doesNotMatch(dist, /12\s*\*\s*monthly|monthly_bid_allowance\s*\*\s*12/i);
  });

  it("Freelancer summary distinguishes membership / admin / refund sources", () => {
    const src = read("src/services/marketplaceBidCreditsService.js");
    assert.match(src, /membershipDerivedAvailable/);
    assert.match(src, /manualAdminAvailable/);
    assert.match(src, /refundCompensatingAvailable/);
    assert.match(src, /reconcileFreelancerBidDistributions/);
  });

  it("B2 refund policy remains compensating 30-day on expired source", () => {
    const src = read("src/services/marketplaceNormalApplicationBidCreditService.js");
    assert.match(src, /same_bucket_restore/);
    assert.match(src, /compensating_grant_30d/);
    assert.match(src, /NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS/);
  });

  it("no Priority / Article Bid wiring in distribution service", () => {
    const src = read("src/services/marketplaceBidCreditDistributionService.js");
    assert.doesNotMatch(src, /priority_bid_auction|marketplace_articles/i);
  });

  it("active Freelancer membership UI uses Bids per month", () => {
    const card = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "components", "freelancer", "FreelancerMarketplaceMembershipCard.jsx"),
      "utf8",
    );
    assert.match(card, /monthlyBidAllowance/);
    assert.match(card, /bidsAvailable/);
    assert.doesNotMatch(card, /Work Token|توكن/);
    const bidCard = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "components", "freelancer", "FreelancerBidCreditsCard.jsx"),
      "utf8",
    );
    assert.match(bidCard, /membershipDerivedAvailable|fromMembership/);
    assert.match(bidCard, /manualAdminAvailable|fromAdmin/);
  });
});
