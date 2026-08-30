/**
 * Public pricing special offer — checkout vs WhatsApp CTA.
 * Run: node --test src/components/plans/specialOfferPublic.test.js
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

describe("public special offer pricing UI (checkout)", () => {
  it("PricingSection wires checkout handler", () => {
    const section = read("components/plans/PricingSection.jsx");
    assert.match(section, /onSpecialOfferCheckout/);
    assert.match(section, /specialOfferCheckoutBusy/);
    assert.match(section, /pricing__with-special/);
  });

  it("card uses checkout button or WhatsApp link by mode", () => {
    const card = read("components/plans/SpecialOfferPackageCard.jsx");
    assert.match(card, /data-special-offer-cta="checkout"/);
    assert.match(card, /data-special-offer-cta="whatsapp"/);
    assert.match(card, /isSpecialOfferCheckoutSupported/);
    assert.match(card, /تواصل للحصول على العرض/);
    assert.doesNotMatch(card, /startCheckout/);
  });

  it("Plans page starts special offer checkout API", () => {
    const page = read("pages/Plans.jsx");
    assert.match(page, /createSpecialOfferCheckoutRequest/);
    assert.match(page, /handleSpecialOfferCheckout/);
    assert.match(page, /onSpecialOfferCheckout=\{handleSpecialOfferCheckout\}/);
  });

  it("Freelancer plans page wires special offer checkout", () => {
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.match(page, /startSpecialOfferCheckout/);
    assert.match(page, /specialOfferPackage/);
  });

  it("mobile places special card first", () => {
    const mobile = read("components/plans/mobile/PlansMobilePage.jsx");
    const specialIdx = mobile.indexOf("pm-special-offer");
    const plansIdx = mobile.indexOf("<PlansMobilePlans");
    assert.ok(specialIdx > 0 && specialIdx < plansIdx);
  });
});
