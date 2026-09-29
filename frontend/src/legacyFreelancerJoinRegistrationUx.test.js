/**
 * Static policy: Legacy shared join must not fail silently on ID MIME / form errors.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(root, rel), "utf8");

describe("LegacyFreelancerJoinPage registration UX", () => {
  const page = read("pages/LegacyFreelancerJoinPage.jsx");
  const ar = read("locales/ar/legacy.json");
  const en = read("locales/en/legacy.json");

  it("restricts ID accept to jpeg/png/webp and validates MIME client-side", () => {
    assert.match(page, /LEGACY_ID_ACCEPT\s*=\s*"image\/jpeg,image\/png,image\/webp/);
    assert.match(page, /isAllowedLegacyIdFile/);
    assert.match(page, /legacy\.join\.errors\.idFileType/);
    assert.match(page, /legacy\.join\.idFileHint/);
    assert.doesNotMatch(page, /accept=["']image\/\*["']/);
  });

  it("scrolls form errors into view and shows alerts at top and near submit", () => {
    assert.match(page, /formErrorRef/);
    assert.match(page, /scrollIntoView/);
    assert.match(page, /role=["']alert["']/);
    assert.match(page, /toPhonePayload/);
  });

  it("exposes Arabic and English ID + phone hints", () => {
    assert.match(ar, /"idFileType"/);
    assert.match(ar, /"idFileHint"/);
    assert.match(ar, /"phoneHint"/);
    assert.match(en, /"idFileType"/);
    assert.match(en, /"idFileHint"/);
    assert.match(en, /"phoneHint"/);
  });
});
