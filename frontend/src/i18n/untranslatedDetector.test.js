import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeTexts, createDetector } from "../../scripts/i18n/untranslatedDetector.mjs";

describe("untranslated-string detector", () => {
  const detector = createDetector("de");

  it("flags literal keys, broken values, Arabic leaks and English source strings", () => {
    const f = analyzeTexts(
      ["orders.card.deadline", "Preis: undefined", "[object Object]", "تم الحفظ", "Something went wrong. Please try again."],
      detector,
    );
    assert.deepEqual(f.literalKey, ["orders.card.deadline"]);
    assert.equal(f.brokenValue.length, 2);
    assert.deepEqual(f.arabic, ["تم الحفظ"]);
    assert.deepEqual(f.englishSource, ["Something went wrong. Please try again."]);
  });

  it("does not flag brand names, plan names, shared words or normal German text", () => {
    const f = analyzeTexts(["OrderzHouse", "SILVER", "WhatsApp", "Status", "Dashboard", "Ihre Aufträge", "Version 2.1", "info@orderzhouse.com"], detector);
    assert.deepEqual(f, { literalKey: [], brokenValue: [], arabic: [], englishSource: [] });
  });
});
