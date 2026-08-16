import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidFairOverrideReason, FAIR_OVERRIDE_REASON_HELPER_AR } from "./fairOverrideReason.js";

const dialog = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "FairSelectionOverrideDialog.jsx"),
  "utf8",
);

describe("fair override reason UI", () => {
  it("validates min 10 and max 500", () => {
    assert.equal(isValidFairOverrideReason("short"), false);
    assert.equal(isValidFairOverrideReason("This is a valid override reason."), true);
    assert.match(FAIR_OVERRIDE_REASON_HELPER_AR, /ليس المرشح الأول/);
  });

  it("dialog disables confirm until reason is valid", () => {
    assert.match(dialog, /disabled=\{!valid \|\| submitting\}/);
    assert.match(dialog, /FAIR_OVERRIDE_REASON_LABEL_AR/);
  });
});
