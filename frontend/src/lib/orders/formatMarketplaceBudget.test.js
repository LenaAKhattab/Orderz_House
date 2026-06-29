import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBudgetRange,
  formatMarketplaceBudget,
  formatMoney,
  orderPriceText,
} from "./formatMarketplaceBudget.js";

describe("formatMoney", () => {
  it("uses English digits", () => {
    assert.equal(formatMoney(1500), "1,500");
    assert.equal(formatMoney(39), "39");
  });
});

describe("formatBudgetRange", () => {
  it("formats Arabic ranges with trailing currency", () => {
    assert.equal(formatBudgetRange(1, 2, "ar"), "1 - 2 د.أ");
    assert.equal(formatBudgetRange(5, 15, "ar"), "5 - 15 د.أ");
    assert.equal(formatBudgetRange(100, 150, "ar"), "100 - 150 د.أ");
  });

  it("formats English ranges with trailing currency", () => {
    assert.equal(formatBudgetRange(1, 2, "en"), "1 - 2 JOD");
    assert.equal(formatBudgetRange(5, 15, "en"), "5 - 15 JOD");
  });

  it("collapses equal min and max to a single amount", () => {
    assert.equal(formatBudgetRange(39, 39, "ar"), "39 د.أ");
    assert.equal(formatBudgetRange(23, 23, "en"), "23 JOD");
  });

  it("returns em dash when values are missing", () => {
    assert.equal(formatBudgetRange(null, null, "ar"), "—");
  });
});

describe("formatMarketplaceBudget", () => {
  it("formats bidding ranges", () => {
    assert.equal(
      formatMarketplaceBudget({ projectType: "bidding", bidBudgetMin: 5, bidBudgetMax: 15 }, "ar"),
      "5 - 15 د.أ",
    );
  });

  it("formats fixed single budget", () => {
    assert.equal(formatMarketplaceBudget({ projectType: "fixed", budget: 39 }, "ar"), "39 د.أ");
    assert.equal(formatMarketplaceBudget({ projectType: "fixed", budget: 50 }, "en"), "50 JOD");
  });

  it("does not show duplicated range for equal bidding bounds", () => {
    assert.equal(
      formatMarketplaceBudget({ projectType: "bidding", bidBudgetMin: 30, bidBudgetMax: 30 }, "ar"),
      "30 د.أ",
    );
  });

  it("keeps orderPriceText alias", () => {
    assert.equal(orderPriceText, formatMarketplaceBudget);
  });
});
