const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveDisplayCurrencyChoice,
  currencyForCountry,
  normalizeManualPreference,
} = require("../src/constants/displayCurrencies");
const {
  parseUsdRates,
  rateFromJod,
  resetExchangeRateCacheForTests,
  seedExchangeRateCacheForTests,
} = require("../src/services/exchangeRateService");
const { getPublicCurrencyDisplay } = require("../src/controllers/publicCurrencyDisplayController");

describe("displayCurrencies", () => {
  it("maps GCC and Egypt countries", () => {
    assert.equal(currencyForCountry("SA"), "SAR");
    assert.equal(currencyForCountry("EG"), "EGP");
    assert.equal(currencyForCountry("JO"), "JOD");
    assert.equal(currencyForCountry("ZZ"), null);
  });

  it("prefers manual currency over IP", () => {
    const result = resolveDisplayCurrencyChoice({ preferred: "SAR", countryCode: "US" });
    assert.deepEqual(result, { displayCurrency: "SAR", source: "user_preference" });
  });

  it("uses IP country when preference is auto", () => {
    const result = resolveDisplayCurrencyChoice({ preferred: "auto", countryCode: "AE" });
    assert.deepEqual(result, { displayCurrency: "AED", source: "ip" });
  });

  it("falls back to USD when country is unknown", () => {
    const result = resolveDisplayCurrencyChoice({ preferred: "auto", countryCode: null });
    assert.deepEqual(result, { displayCurrency: "USD", source: "fallback" });
  });

  it("treats invalid preference as auto", () => {
    assert.equal(normalizeManualPreference("XYZ"), "auto");
  });
});

describe("exchangeRateService math", () => {
  it("parses USD rates and converts via JOD", () => {
    const rates = parseUsdRates({
      rates: { USD: 1, JOD: 0.71, SAR: 3.75, EGP: 49 },
    });
    assert.ok(rates);
    const jodToSar = rateFromJod("SAR", rates);
    assert.ok(Math.abs(jodToSar - 3.75 / 0.71) < 1e-9);
    assert.equal(rateFromJod("JOD", rates), 1);
  });

  it("rejects payloads without JOD", () => {
    assert.equal(parseUsdRates({ rates: { USD: 1, SAR: 3.75 } }), null);
  });
});

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("GET public currency-display controller", () => {
  it("returns JOD as base and USD fallback without country when rates exist", async () => {
    resetExchangeRateCacheForTests();
    seedExchangeRateCacheForTests({ USD: 1, JOD: 0.71, SAR: 3.75 });
    const res = mockRes();
    await getPublicCurrencyDisplay({ headers: {}, query: {} }, res, (err) => {
      throw err || new Error("next");
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.baseCurrency, "JOD");
    assert.equal(res.body.data.displayCurrency, "USD");
    assert.equal(res.body.data.source, "fallback");
    assert.ok(res.body.data.rate > 0);
  });

  it("honors country header without using client IP", async () => {
    resetExchangeRateCacheForTests();
    seedExchangeRateCacheForTests({ USD: 1, JOD: 0.71, SAR: 3.75 });
    const res = mockRes();
    await getPublicCurrencyDisplay(
      { headers: { "cf-ipcountry": "SA" }, query: { preferred: "auto" } },
      res,
      (err) => {
        throw err || new Error("next");
      },
    );
    assert.equal(res.body.data.displayCurrency, "SAR");
    assert.equal(res.body.data.source, "ip");
  });

  it("falls back to JOD when the rate provider fails", async () => {
    resetExchangeRateCacheForTests();
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error("offline");
    };
    try {
      const res = mockRes();
      await getPublicCurrencyDisplay({ headers: {}, query: {} }, res, (err) => {
        throw err || new Error("next");
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.data.baseCurrency, "JOD");
      assert.equal(res.body.data.displayCurrency, "JOD");
      assert.equal(res.body.data.rate, 1);
    } finally {
      global.fetch = originalFetch;
      resetExchangeRateCacheForTests();
    }
  });
});
