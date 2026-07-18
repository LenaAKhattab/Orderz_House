import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coerceJodAmount, formatJodMoney } from "./formatJodMoney.js";

describe("formatJodMoney", () => {
  it("formats zero as 0 د.أ", () => {
    assert.equal(formatJodMoney(0), "0 د.أ");
    assert.equal(formatJodMoney(0, { locale: "ar" }), "0 د.أ");
  });

  it("formats integer amounts with Western digits", () => {
    assert.equal(formatJodMoney(50), "50 د.أ");
    assert.equal(formatJodMoney(50, { locale: "en" }), "50 JOD");
  });

  it("formats decimal amounts with up to 2 fraction digits", () => {
    assert.equal(formatJodMoney(12.5), "12.5 د.أ");
    assert.equal(formatJodMoney(12.55), "12.55 د.أ");
    assert.equal(formatJodMoney(12.556), "12.56 د.أ");
  });

  it("formats large amounts with thousand separators", () => {
    assert.equal(formatJodMoney(1250), "1,250 د.أ");
    assert.equal(formatJodMoney(1250000.5), "1,250,000.5 د.أ");
  });

  it("falls back safely for null, undefined, empty, and NaN", () => {
    assert.equal(formatJodMoney(null), "0 د.أ");
    assert.equal(formatJodMoney(undefined), "0 د.أ");
    assert.equal(formatJodMoney(""), "0 د.أ");
    assert.equal(formatJodMoney(Number.NaN), "0 د.أ");
    assert.equal(formatJodMoney("not-a-number"), "0 د.أ");
  });

  it("never emits dash, NaN, or reversed-only currency tokens", () => {
    for (const value of [null, undefined, NaN, "-", "—", Infinity, -Infinity]) {
      const out = formatJodMoney(value);
      assert.equal(out, "0 د.أ");
      assert.doesNotMatch(out, /NaN|undefined|null|^-|—/);
      assert.match(out, /^[\d,]+\.?\d* د\.أ$/);
    }
  });

  it("keeps amount-before-currency order for Arabic RTL isolation", () => {
    const out = formatJodMoney(1250, { locale: "ar" });
    assert.equal(out, "1,250 د.أ");
    assert.ok(out.indexOf("1,250") < out.indexOf("د.أ"));
    assert.doesNotMatch(out, /^د\.أ/);
  });

  it("uses only Western digits 0-9", () => {
    const out = formatJodMoney(1250.75);
    assert.doesNotMatch(out, /[٠-٩]/);
    assert.match(out, /1,250\.75/);
  });

  it("coerceJodAmount maps invalid inputs to 0", () => {
    assert.equal(coerceJodAmount(null), 0);
    assert.equal(coerceJodAmount(undefined), 0);
    assert.equal(coerceJodAmount(""), 0);
    assert.equal(coerceJodAmount("42.5"), 42.5);
    assert.equal(coerceJodAmount(42.5), 42.5);
  });
});
