import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatApproximateCurrency, formatJodAmount, shouldShowApproximate } from "./displayMoney.js";

describe("displayMoney", () => {
  it("formats official JOD first", () => {
    assert.equal(formatJodAmount(30), "30 د.أ");
    assert.equal(formatJodAmount(45, { locale: "en" }), "45 JOD");
  });

  it("formats approximate converted amounts", () => {
    assert.equal(formatApproximateCurrency(30, "SAR", 5.3), "159 ر.س");
    assert.equal(formatApproximateCurrency(45, "USD", 1.41), "63.45 USD");
  });

  it("hides approximate when target is JOD or rate missing", () => {
    assert.equal(formatApproximateCurrency(30, "JOD", 1), null);
    assert.equal(formatApproximateCurrency(30, "SAR", null), null);
    assert.equal(shouldShowApproximate("JOD", 1), false);
    assert.equal(shouldShowApproximate("SAR", 5.3), true);
  });
});
