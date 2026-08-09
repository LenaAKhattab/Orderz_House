/**
 * Feedback notification category display helpers.
 * Run from frontend/: node --test src/utils/notificationDisplay.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getNotificationDetails,
  getNotificationTypeIconKind,
  resolveFeedbackNotificationCategoryLabel,
} from "./notificationDisplay.js";

describe("resolveFeedbackNotificationCategoryLabel", () => {
  it("A: problem snapshot → مشكلة", () => {
    assert.equal(
      resolveFeedbackNotificationCategoryLabel({ categoryLabel: "مشكلة" }, "ar"),
      "مشكلة",
    );
  });

  it("B: suggestion snapshot → اقتراح", () => {
    assert.equal(
      resolveFeedbackNotificationCategoryLabel({ categoryLabel: "اقتراح" }, "ar"),
      "اقتراح",
    );
  });

  it("C: other snapshot → ملاحظة أخرى", () => {
    assert.equal(
      resolveFeedbackNotificationCategoryLabel({ categoryLabel: "ملاحظة أخرى" }, "ar"),
      "ملاحظة أخرى",
    );
  });

  it("D: dynamic category snapshot → استفسار", () => {
    assert.equal(
      resolveFeedbackNotificationCategoryLabel(
        { categoryLabel: "استفسار", categoryKey: "cat_12" },
        "ar",
      ),
      "استفسار",
    );
  });

  it("E: renamed live category does not override stored snapshot", () => {
    assert.equal(
      resolveFeedbackNotificationCategoryLabel(
        { categoryLabel: "مشكلة", categoryKey: "problem" },
        "ar",
      ),
      "مشكلة",
    );
  });

  it("F: old notification without categoryLabel uses legacy feedbackType", () => {
    assert.equal(
      resolveFeedbackNotificationCategoryLabel({ feedbackType: "problem" }, "ar"),
      "مشكلة",
    );
    assert.equal(
      resolveFeedbackNotificationCategoryLabel({ feedbackType: "suggestion" }, "en"),
      "Suggestion",
    );
    assert.equal(
      resolveFeedbackNotificationCategoryLabel({ categoryKey: "other" }, "ar"),
      "ملاحظة أخرى",
    );
  });

  it("G: no usable category data → empty string (omit row)", () => {
    assert.equal(resolveFeedbackNotificationCategoryLabel({}, "ar"), "");
    assert.equal(resolveFeedbackNotificationCategoryLabel({ categoryKey: "cat_99" }, "ar"), "");
    assert.equal(resolveFeedbackNotificationCategoryLabel(null, "ar"), "");
  });
});

describe("notificationDisplay — feedback.created details", () => {
  it("A–D: labeled category lines for legacy and dynamic labels", () => {
    assert.equal(
      getNotificationDetails(
        { type: "feedback.created", metadata: { categoryLabel: "مشكلة" } },
        false,
        { locale: "ar" },
      ),
      "التصنيف: مشكلة",
    );
    assert.equal(
      getNotificationDetails(
        { type: "feedback.created", metadata: { categoryLabel: "اقتراح" } },
        false,
        { locale: "ar" },
      ),
      "التصنيف: اقتراح",
    );
    assert.equal(
      getNotificationDetails(
        { type: "feedback.created", metadata: { categoryLabel: "ملاحظة أخرى" } },
        false,
        { locale: "ar" },
      ),
      "التصنيف: ملاحظة أخرى",
    );
    assert.equal(
      getNotificationDetails(
        { type: "feedback.created", metadata: { categoryLabel: "استفسار" } },
        false,
        { locale: "ar" },
      ),
      "التصنيف: استفسار",
    );
    assert.equal(
      getNotificationDetails(
        { type: "feedback.created", metadata: { categoryLabel: "Problem" } },
        false,
        { locale: "en", categoryPrefix: "Category" },
      ),
      "Category: Problem",
    );
  });

  it("H: topic present → category + topic both shown", () => {
    const details = getNotificationDetails(
      {
        type: "feedback.created",
        metadata: {
          categoryLabel: "مشكلة",
          topicLabel: "مشكلة في الدفع",
          subject: "عنوان يدوي",
        },
      },
      false,
      { locale: "ar" },
    );
    assert.equal(details, "التصنيف: مشكلة · الموضوع الجاهز: مشكلة في الدفع · «عنوان يدوي»");
  });

  it("I: topic absent → no empty topic row", () => {
    const details = getNotificationDetails(
      {
        type: "feedback.created",
        metadata: { categoryLabel: "مشكلة", subject: "عنوان قصير" },
      },
      false,
      { locale: "ar" },
    );
    assert.equal(details, "التصنيف: مشكلة · «عنوان قصير»");
    assert.ok(!details.includes("الموضوع"));
    assert.ok(!details.includes("null"));
    assert.ok(!details.includes("undefined"));
  });

  it("F: legacy feedbackType without categoryLabel still renders التصنيف", () => {
    assert.equal(
      getNotificationDetails(
        { type: "feedback.created", metadata: { feedbackType: "suggestion" } },
        false,
        { locale: "ar" },
      ),
      "التصنيف: اقتراح",
    );
  });

  it("G: omit category row when no usable category data", () => {
    assert.equal(
      getNotificationDetails({ type: "feedback.created", metadata: {} }, false, { locale: "ar" }),
      "",
    );
    assert.equal(
      getNotificationDetails(
        { type: "feedback.created", metadata: { subject: "فقط عنوان" } },
        false,
        { locale: "ar" },
      ),
      "«فقط عنوان»",
    );
  });

  it("maps feedback types to message icon kind", () => {
    assert.equal(getNotificationTypeIconKind("feedback.created"), "message");
    assert.equal(getNotificationTypeIconKind("feedback.status.resolved"), "message");
    assert.equal(getNotificationTypeIconKind("order.created"), "order");
  });
});
