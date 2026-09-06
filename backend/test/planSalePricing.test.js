const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  resolvePlanPayablePricing,
  applyPercentageDiscountMajor,
  assertValidSalePatch,
} = require("../src/utils/planSalePricing");

describe("planSalePricing", () => {
  it("applies 20% off 45 JOD → 36 JOD using minor-unit math", () => {
    const applied = applyPercentageDiscountMajor(45, 20, "JOD");
    assert.strictEqual(applied.originalPriceJod, 45);
    assert.strictEqual(applied.effectivePriceJod, 36);
    assert.strictEqual(applied.savingsJod, 9);
    assert.strictEqual(applied.originalMinor, 45000);
    assert.strictEqual(applied.effectiveMinor, 36000);
  });

  it("applies 20% off recurring 15 JOD → 12 JOD", () => {
    const pricing = resolvePlanPayablePricing(
      {
        price_jod: 15,
        sale_enabled: true,
        sale_percentage: 20,
        sale_reason: "عرض خاص",
        currency: "JOD",
      },
      { mode: "recurring" },
    );
    assert.strictEqual(pricing.active, true);
    assert.strictEqual(pricing.originalPriceJod, 15);
    assert.strictEqual(pricing.effectivePriceJod, 12);
    assert.strictEqual(pricing.effectiveMinor, 12000);
  });

  it("uses stripe_checkout_amount_jod as one-time base (Platinum-style)", () => {
    const pricing = resolvePlanPayablePricing(
      {
        price_jod: 900,
        stripe_checkout_amount_jod: 300,
        sale_enabled: true,
        sale_percentage: 20,
        sale_reason: "عرض",
        currency: "JOD",
      },
      { mode: "one_time" },
    );
    assert.strictEqual(pricing.originalPriceJod, 300);
    assert.strictEqual(pricing.effectivePriceJod, 240);
  });

  it("ignores sale when disabled", () => {
    const pricing = resolvePlanPayablePricing(
      {
        price_jod: 45,
        sale_enabled: false,
        sale_percentage: 20,
        sale_reason: "x",
      },
      { mode: "one_time" },
    );
    assert.strictEqual(pricing.active, false);
    assert.strictEqual(pricing.effectivePriceJod, 45);
  });

  it("rejects free-plan sale", () => {
    assert.throws(
      () =>
        assertValidSalePatch(
          { saleEnabled: true, salePercentage: 20, saleReason: "عرض" },
          { priceJod: 0, stripeCheckoutAmountJod: null },
        ),
      (err) => err.publicCode === "SALE_NOT_ALLOWED_ON_FREE_PLAN",
    );
  });

  it("rejects 0%, 100%, and negative percentages", () => {
    for (const pct of [0, 100, -5, 100.1]) {
      assert.throws(
        () =>
          assertValidSalePatch(
            { saleEnabled: true, salePercentage: pct, saleReason: "عرض" },
            { priceJod: 45 },
          ),
        (err) => err.publicCode === "INVALID_SALE_PERCENTAGE",
      );
    }
  });

  it("requires reason when sale enabled", () => {
    assert.throws(
      () =>
        assertValidSalePatch(
          { saleEnabled: true, salePercentage: 20, saleReason: "  " },
          { priceJod: 45 },
        ),
      (err) => err.publicCode === "SALE_REASON_REQUIRED",
    );
  });

  it("accepts valid sale patch", () => {
    assert.doesNotThrow(() =>
      assertValidSalePatch(
        { saleEnabled: true, salePercentage: 20, saleReason: "عرض خاص لفترة محدودة" },
        { priceJod: 45 },
      ),
    );
  });
});
