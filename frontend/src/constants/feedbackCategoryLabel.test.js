/**
 * Legacy-safe category label helper.
 * Run from frontend/: node --test src/constants/feedbackCategoryLabel.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { feedbackCategoryDisplayLabel } from "./feedback.js";

describe("feedbackCategoryDisplayLabel", () => {
  it("prefers categoryLabel snapshot over legacy type", () => {
    assert.equal(
      feedbackCategoryDisplayLabel({ categoryLabel: "استفسار", type: "problem" }, "ar"),
      "استفسار",
    );
  });

  it("falls back to legacy Arabic labels when snapshot is null", () => {
    assert.equal(feedbackCategoryDisplayLabel({ type: "problem", categoryLabel: null }, "ar"), "مشكلة");
    assert.equal(feedbackCategoryDisplayLabel({ type: "suggestion" }, "ar"), "اقتراح");
    assert.equal(feedbackCategoryDisplayLabel({ type: "other" }, "ar"), "ملاحظة أخرى");
  });

  it("never renders null/undefined", () => {
    assert.equal(feedbackCategoryDisplayLabel(null, "ar"), "—");
    assert.equal(feedbackCategoryDisplayLabel({}, "ar"), "—");
    assert.equal(feedbackCategoryDisplayLabel({ categoryLabel: "   ", type: "" }, "ar"), "—");
  });
});
