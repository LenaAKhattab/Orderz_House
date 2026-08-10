/**
 * Work Token accounting pure helpers + isolation static checks — Phase 4.
 * No Production DB mutations.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_work_token_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  assertPositiveTokenAmount,
  deltasForBalanceEffect,
  applyDeltasToBalances,
  deriveBalancesFromLedger,
  reservationIncreaseDelta,
} = require("../src/utils/marketplaceWorkTokenAccounting");
const {
  WORK_TOKEN_LEDGER_EVENT_TYPES,
  WORK_TOKEN_ERROR_CODES,
  balanceEffectForEvent,
} = require("../src/constants/marketplaceWorkTokens");

describe("integer token amount validation", () => {
  it("accepts positive integers", () => {
    assert.strictEqual(assertPositiveTokenAmount(1), 1);
    assert.strictEqual(assertPositiveTokenAmount(150), 150);
    assert.strictEqual(assertPositiveTokenAmount("80"), 80);
  });

  it("rejects zero, negative, float, NaN, Infinity, junk", () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity, -Infinity, "1.2", "abc", null, undefined, ""]) {
      assert.throws(() => assertPositiveTokenAmount(bad), (err) => {
        assert.strictEqual(err.publicCode, WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT);
        return true;
      });
    }
  });
});

describe("balance effect deltas", () => {
  it("maps credit/reserve/release/consume correctly", () => {
    assert.deepStrictEqual(deltasForBalanceEffect("credit_available", 500), {
      availableDelta: 500,
      reservedDelta: 0,
    });
    assert.deepStrictEqual(deltasForBalanceEffect("reserve", 150), {
      availableDelta: -150,
      reservedDelta: 150,
    });
    assert.deepStrictEqual(deltasForBalanceEffect("release", 150), {
      availableDelta: 150,
      reservedDelta: -150,
    });
    assert.deepStrictEqual(deltasForBalanceEffect("consume_reserved", 150), {
      availableDelta: 0,
      reservedDelta: -150,
    });
  });

  it("replays credit→reserve→release→consume sequence", () => {
    let available = 0;
    let reserved = 0;
    const steps = [
      ["credit_available", 500],
      ["reserve", 100],
      ["reserve", 150],
      ["release", 100],
      ["consume_reserved", 150],
    ];
    const ledger = [];
    for (const [effect, amount] of steps) {
      const d = deltasForBalanceEffect(effect, amount);
      const next = applyDeltasToBalances(available, reserved, d.availableDelta, d.reservedDelta);
      available = next.available;
      reserved = next.reserved;
      ledger.push({ available_delta: d.availableDelta, reserved_delta: d.reservedDelta });
    }
    assert.strictEqual(available, 350);
    assert.strictEqual(reserved, 0);
    const derived = deriveBalancesFromLedger(ledger);
    assert.strictEqual(derived.ok, true);
    assert.strictEqual(derived.available, 350);
    assert.strictEqual(derived.reserved, 0);
  });

  it("blocks insufficient available on reserve", () => {
    assert.throws(
      () => applyDeltasToBalances(50, 0, -100, 100),
      (err) => err.publicCode === WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
    );
  });
});

describe("reservation increase delta", () => {
  it("reserves only the additional amount", () => {
    assert.strictEqual(reservationIncreaseDelta(100, 180), 80);
    assert.strictEqual(reservationIncreaseDelta(100, 100), 0);
  });

  it("rejects decrease on increase path", () => {
    assert.throws(() => reservationIncreaseDelta(180, 100));
  });
});

describe("event vocabulary", () => {
  it("includes Priority Bid and grant/bonus events", () => {
    for (const t of [
      "TOKEN_CREDIT",
      "TOKEN_RESERVE",
      "TOKEN_RELEASE",
      "TOKEN_CONSUME",
      "MEMBERSHIP_CYCLE_GRANT",
      "IDENTITY_VERIFICATION_BONUS",
      "PRIORITY_BID_RESERVE",
      "PRIORITY_BID_INCREASE_RESERVE",
      "PRIORITY_BID_RELEASE",
      "PRIORITY_BID_CONSUME",
    ]) {
      assert.ok(WORK_TOKEN_LEDGER_EVENT_TYPES.includes(t), t);
      assert.ok(balanceEffectForEvent(t));
    }
  });
});

describe("fake/training isolation", () => {
  it("wallet service does not import fake/training order modules", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceWorkTokenWalletService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /require\(["'].*fakeOrder/i);
    assert.doesNotMatch(src, /require\(["'].*trainingOrder/i);
    assert.doesNotMatch(src, /require\(["'].*stripe/i);
    assert.doesNotMatch(src, /priority_auctions|fairness_scores|elite_direct_orders/i);
  });

  it("controllers expose read-only endpoints only", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/controllers/marketplaceWorkTokenWalletController.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /creditWorkTokens|reserveWorkTokens|consumeWorkToken/);
  });
});
