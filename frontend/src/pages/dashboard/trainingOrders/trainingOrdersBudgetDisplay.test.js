import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatTrainingOrderBudget } from "./trainingOrdersDisplayUtils.js";

describe("formatTrainingOrderBudget", () => {
  it("shows single amount for fixed-price orders", () => {
    assert.equal(
      formatTrainingOrderBudget({ projectType: "fixed", budget: 39 }),
      "39 JOD",
    );
    assert.equal(
      formatTrainingOrderBudget({ projectType: "fixed", bidBudgetMin: 35, bidBudgetMax: 35 }),
      "35 JOD",
    );
  });

  it("collapses equal min/max bidding amounts to a single price", () => {
    assert.equal(
      formatTrainingOrderBudget({ projectType: "bidding", bidBudgetMin: 23, bidBudgetMax: 23 }),
      "23 JOD",
    );
  });

  it("shows range when min and max differ", () => {
    assert.equal(
      formatTrainingOrderBudget({ projectType: "bidding", bidBudgetMin: 30, bidBudgetMax: 50 }),
      "30 – 50 JOD",
    );
    assert.equal(
      formatTrainingOrderBudget({ projectType: "bidding", bidBudgetMin: 20, bidBudgetMax: 30 }),
      "20 – 30 JOD",
    );
  });

  it("returns em dash when budget is missing", () => {
    assert.equal(formatTrainingOrderBudget({ projectType: "fixed" }), "—");
    assert.equal(formatTrainingOrderBudget(null), "—");
  });
});
