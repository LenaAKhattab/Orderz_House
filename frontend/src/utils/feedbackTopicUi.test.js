/**
 * Frontend category display + topic UI helpers.
 * Run from frontend/: node --test src/utils/feedbackTopicUi.test.js src/constants/feedbackCategoryLabel.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextTopicIdOnCategoryChange,
  nextTopicIdOnFeedbackTypeChange,
  shouldShowFeedbackTopicDropdown,
} from "./feedbackTopicUi.js";

describe("feedbackTopicUi", () => {
  it("hides dropdown when zero topics or loading", () => {
    assert.equal(
      shouldShowFeedbackTopicDropdown({ type: "problem", topicsLoading: false, topics: [] }),
      false,
    );
    assert.equal(
      shouldShowFeedbackTopicDropdown({
        categoryId: 3,
        topicsLoading: true,
        topics: [{ id: 1 }],
      }),
      false,
    );
    assert.equal(
      shouldShowFeedbackTopicDropdown({ type: "", topicsLoading: false, topics: [{ id: 1 }] }),
      false,
    );
  });

  it("shows dropdown when categoryId is set and active topics exist", () => {
    assert.equal(
      shouldShowFeedbackTopicDropdown({
        categoryId: 5,
        topicsLoading: false,
        topics: [{ id: 2, label: "x" }],
      }),
      true,
    );
  });

  it("keeps category-switch reset clearing topic selection", () => {
    assert.equal(nextTopicIdOnFeedbackTypeChange("problem"), "");
    assert.equal(nextTopicIdOnCategoryChange(12), "");
  });
});
