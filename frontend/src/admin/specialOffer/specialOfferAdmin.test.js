/**
 * Super Admin special offer — version lock UI.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("special offer admin version lock", () => {
  it("before purchase fields editable; locked shows warning and create-new", () => {
    const page = read("pages/dashboard/SuperAdminSpecialOfferPackagePage.jsx");
    assert.match(page, /طريقة الشراء/);
    assert.match(page, /data-purchase-mode-select/);
    assert.match(page, /data-access-level-select/);
    assert.match(page, /data-special-offer-locked/);
    assert.match(page, /data-create-new-offer/);
    assert.match(page, /إنشاء عرض جديد/);
    assert.match(page, /تم تجميد السعر والمزايا|SPECIAL_OFFER_LOCKED_WARNING/);
    assert.match(page, /data-benefit-field="priceJod"/);
    assert.match(page, /benefitsLocked/);
    assert.doesNotMatch(page, /data-linked-plan-select/);
  });

  it("API exposes new-version endpoint", () => {
    const api = read("services/api.js");
    assert.match(api, /createAdminSpecialOfferNewVersionRequest/);
    assert.match(api, /\/super-admin\/plans\/special-offer\/new-version/);
    assert.match(api, /createSpecialOfferCheckoutRequest/);
  });

  it("admin form includes refund explanation textarea", () => {
    const page = read("pages/dashboard/SuperAdminSpecialOfferPackagePage.jsx");
    assert.match(page, /refundExplanationAr/);
    assert.match(page, /data-refund-explanation-field/);
    assert.match(page, /شرح الاسترداد/);
  });
});
