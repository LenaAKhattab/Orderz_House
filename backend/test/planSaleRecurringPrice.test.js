const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const Module = require("module");

describe("ensureStripeRecurringPriceForPlan with sale", () => {
  const prevDb = require.resolve("../src/config/db");
  let createdPrices = [];

  beforeEach(() => {
    createdPrices = [];
    delete require.cache[require.resolve("../src/services/stripeRecurringSubscriptionService")];
    delete require.cache[require.resolve("../src/utils/planSalePricing")];
  });

  afterEach(() => {
    delete require.cache[require.resolve("../src/services/stripeRecurringSubscriptionService")];
  });

  it("creates recurring Price for discounted 12 JOD and reuses matching amount", async () => {
    const updates = [];
    require.cache[prevDb] = {
      id: prevDb,
      filename: prevDb,
      loaded: true,
      exports: {
        pool: {
          query: async (sql, params) => {
            updates.push({ sql: String(sql), params });
            return { rows: [], rowCount: 1 };
          },
        },
        connectDB: async () => {},
      },
    };

    const service = require("../src/services/stripeRecurringSubscriptionService");
    const planRow = {
      id: 99,
      name: "test_monthly_sale",
      title: "Test Monthly",
      price_jod: 15,
      currency: "JOD",
      billing_interval: "month",
      billing_interval_count: 1,
      sale_enabled: true,
      sale_percentage: 20,
      sale_reason: "عرض",
      stripe_product_id: "prod_existing",
      stripe_price_id: null,
      stripe_price_amount_minor: null,
    };

    const stripe = {
      products: { create: async () => ({ id: "prod_new" }) },
      prices: {
        create: async (payload) => {
          createdPrices.push(payload);
          return { id: `price_${createdPrices.length}` };
        },
      },
    };

    const first = await service.ensureStripeRecurringPriceForPlan({ stripe, planRow }, null);
    assert.strictEqual(first.amountMinor, 12000);
    assert.strictEqual(first.saleActive, true);
    assert.strictEqual(createdPrices.length, 1);
    assert.strictEqual(createdPrices[0].unit_amount, 12000);

    // Second call with matching cached amount reuses Price (no create)
    const planCached = {
      ...planRow,
      stripe_price_id: first.priceId,
      stripe_price_amount_minor: 12000,
      stripe_product_id: "prod_existing",
    };
    const second = await service.ensureStripeRecurringPriceForPlan({ stripe, planRow: planCached }, null);
    assert.strictEqual(second.priceId, first.priceId);
    assert.strictEqual(createdPrices.length, 1);

    // Percentage change clears reuse path → new Price
    const plan30 = {
      ...planRow,
      sale_percentage: 30,
      stripe_price_id: first.priceId,
      stripe_price_amount_minor: 12000,
      stripe_product_id: "prod_existing",
    };
    const third = await service.ensureStripeRecurringPriceForPlan({ stripe, planRow: plan30 }, null);
    assert.strictEqual(third.amountMinor, 10500); // 15 * 0.7 = 10.5 → 10500 minor
    assert.strictEqual(createdPrices.length, 2);
    assert.notStrictEqual(third.priceId, first.priceId);
  });
});
