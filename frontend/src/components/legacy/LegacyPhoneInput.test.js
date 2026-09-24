import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(srcRoot, rel), "utf8");

describe("LegacyPhoneInput shared UX", () => {
  it("keeps country selector physically left via LTR flex group", () => {
    const jsx = read("components/legacy/LegacyPhoneInput.jsx");
    const css = read("components/legacy/LegacyPhoneInput.css");
    assert.match(jsx, /dir=["']ltr["']/);
    assert.match(jsx, /oh-legacy-phone__cc/);
    assert.match(jsx, /oh-legacy-phone__number/);
    assert.ok(jsx.indexOf("oh-legacy-phone__cc") < jsx.indexOf("oh-legacy-phone__number"));
    assert.match(css, /direction:\s*ltr/);
    assert.match(css, /flex-direction:\s*row/);
    assert.match(css, /@media \(max-width:\s*390px\)/);
  });

  it("is reused by public join and admin create", () => {
    const join = read("pages/LegacyFreelancerJoinPage.jsx");
    const panel = read("pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx");
    assert.match(join, /from ["'].*legacy\/LegacyPhoneInput["']/);
    assert.match(panel, /from ["'].*legacy\/LegacyPhoneInput["']/);
    assert.match(join, /toPhonePayload/);
    assert.match(panel, /toPhonePayload/);
    assert.match(join, /DEFAULT_DIAL_CODE/);
    assert.match(panel, /phoneCountryCode:\s*DEFAULT_DIAL_CODE/);
  });
});
