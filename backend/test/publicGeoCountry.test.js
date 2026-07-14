const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePublicGeoCountryCode,
  resolvePublicGeoFromRequest,
} = require("../src/utils/publicGeoCountry");

describe("publicGeoCountry", () => {
  it("normalizes valid ISO codes to uppercase", () => {
    assert.equal(normalizePublicGeoCountryCode("eg"), "EG");
    assert.equal(normalizePublicGeoCountryCode(" jo "), "JO");
  });

  it("rejects invalid or unknown proxy codes", () => {
    assert.equal(normalizePublicGeoCountryCode(""), null);
    assert.equal(normalizePublicGeoCountryCode("EGY"), null);
    assert.equal(normalizePublicGeoCountryCode("XX"), null);
    assert.equal(normalizePublicGeoCountryCode("T1"), null);
  });

  it("resolves cf-ipcountry first", () => {
    const result = resolvePublicGeoFromRequest({
      headers: {
        "cf-ipcountry": "EG",
        "x-vercel-ip-country": "JO",
        "x-country-code": "US",
      },
    });
    assert.deepEqual(result, { countryCode: "EG", source: "cf-ipcountry" });
  });

  it("falls back to x-vercel-ip-country then x-country-code", () => {
    assert.deepEqual(
      resolvePublicGeoFromRequest({
        headers: { "x-vercel-ip-country": "JO" },
      }),
      { countryCode: "JO", source: "x-vercel-ip-country" },
    );
    assert.deepEqual(
      resolvePublicGeoFromRequest({
        headers: { "x-country-code": "eg" },
      }),
      { countryCode: "EG", source: "x-country-code" },
    );
  });

  it("returns unknown when no valid header is present", () => {
    assert.deepEqual(resolvePublicGeoFromRequest({ headers: {} }), {
      countryCode: null,
      source: "unknown",
    });
  });
});
