import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLocaleDate } from "./formatLocale.js";
import { presentServerMessage } from "./presentServerMessage.js";

describe("locale formatting", () => {
  it("formats English dates with a month name and keeps Arabic numeric", () => {
    const value = "2026-09-27T08:00:00.000Z";
    assert.match(formatLocaleDate(value, "en"), /Sep 27, 2026/);
    assert.match(formatLocaleDate(value, "ar"), /27\/09\/2026/);
  });

  it("uses a generic English fallback for unmapped Arabic server text", () => {
    const t = (key) => (key === "common.errors.generic" ? "Something went wrong. Please try again." : key);
    const message = presentServerMessage({ message: "تعذر تنفيذ العملية" }, t, "en");
    assert.equal(message, "Something went wrong. Please try again.");
  });
});
