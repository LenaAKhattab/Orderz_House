import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertJodToEgp,
  formatPriceFromJod,
  getDisplayCurrencyForCountry,
  isEgyptCountry,
  resolveUserCountryCode,
} from "./currencyDisplay.js";
import { DISPLAY_CURRENCY, JOD_TO_EGP_RATE } from "../config/currencyDisplayConfig.js";

function t(key, values = {}) {
  if (key === "plans.currency.equivalentJod") {
    return `يعادل ${values.amount}`;
  }
  return key;
}

describe("currencyDisplay", () => {
  it("detects Egypt country codes", () => {
    assert.equal(isEgyptCountry("EG"), true);
    assert.equal(isEgyptCountry("egypt"), true);
    assert.equal(isEgyptCountry("JO"), false);
  });

  it("uses EGP display currency for Egypt", () => {
    assert.equal(getDisplayCurrencyForCountry("EG"), DISPLAY_CURRENCY.EGP);
    assert.equal(getDisplayCurrencyForCountry("JO"), DISPLAY_CURRENCY.JOD);
  });

  it("resolves country from user profile before storage", () => {
    assert.equal(resolveUserCountryCode({ user: { country: "EG" } }), "EG");
    assert.equal(
      resolveUserCountryCode({ user: { billingCountry: "EG" }, searchParams: new URLSearchParams("country=JO") }),
      "EG",
    );
  });

  it("uses geo before localStorage and query overrides", () => {
    assert.equal(
      resolveUserCountryCode({
        geoCountryCode: "EG",
        searchParams: new URLSearchParams("country=JO"),
      }),
      "EG",
    );
  });

  it("converts JOD to EGP with central rate", () => {
    assert.equal(convertJodToEgp(20), 20 * JOD_TO_EGP_RATE);
    const formatted = formatPriceFromJod(20, { locale: "ar", displayCurrency: DISPLAY_CURRENCY.EGP });
    assert.ok(formatted?.includes("ج.م"));
    assert.equal(Math.round(convertJodToEgp(20)), 1410);
  });

  it("keeps free plan label when amount is zero", () => {
    assert.equal(formatPriceFromJod(0, { locale: "ar", displayCurrency: DISPLAY_CURRENCY.EGP }), "مجانية");
  });

  it("formats JOD unchanged for non-Egypt display", () => {
    assert.equal(formatPriceFromJod(20, { locale: "ar", displayCurrency: DISPLAY_CURRENCY.JOD }), "20 د.أ");
  });
});
