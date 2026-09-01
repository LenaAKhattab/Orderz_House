/**
 * Special offer package — frontend independent checkout contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SPECIAL_OFFER_DEFAULTS,
  SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_AR,
  SPECIAL_OFFER_PURCHASE_MODE,
  isSpecialOfferCheckoutSupported,
  normalizePublicSpecialOffer,
  payloadFromSpecialOfferForm,
  formStateFromSpecialOffer,
  resolveSpecialOfferPurchaseMode,
  hasSpecialOfferRefundExplanation,
  splitSpecialOfferRefundSections,
} from "./specialOfferPackage.js";

describe("specialOfferPackage helpers (independent)", () => {
  it("checkout supported from own price without linkedPlanCode", () => {
    const pkg = {
      ...SPECIAL_OFFER_DEFAULTS,
      isVisible: true,
      purchaseMode: "checkout",
      priceJod: 49,
      totalOffers: 200,
      linkedPlanCode: null,
      checkoutSupported: true,
    };
    assert.equal(isSpecialOfferCheckoutSupported(pkg), true);
    const pub = normalizePublicSpecialOffer(pkg);
    assert.equal(pub.priceJod, 49);
    assert.equal(pub.totalOffers, 200);
    assert.equal(pub.linkedPlanCode, null);
  });

  it("whatsapp mode when purchaseMode whatsapp", () => {
    assert.equal(
      resolveSpecialOfferPurchaseMode({ purchaseMode: "whatsapp", priceJod: 49 }),
      SPECIAL_OFFER_PURCHASE_MODE.WHATSAPP,
    );
  });

  it("payload includes access level and clears linkedPlanCode", () => {
    const form = formStateFromSpecialOffer({
      ...SPECIAL_OFFER_DEFAULTS,
      accessLevelKey: "elite",
      purchaseMode: "checkout",
      priceJod: 49,
    });
    const payload = payloadFromSpecialOfferForm(form);
    assert.equal(payload.accessLevelKey, "elite");
    assert.equal(payload.articleAccessLevel, 5);
    assert.equal(payload.linkedPlanCode, null);
  });

  it("refund explanation defaults and visibility helper", () => {
    assert.ok(String(SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_AR).includes("يُسترد مبلغ"));
    assert.equal(hasSpecialOfferRefundExplanation(SPECIAL_OFFER_DEFAULTS), true);
    assert.equal(hasSpecialOfferRefundExplanation({ refundExplanationAr: "   " }), false);
    assert.equal(hasSpecialOfferRefundExplanation({ refundExplanationAr: "نص" }), true);
    const sections = splitSpecialOfferRefundSections(SPECIAL_OFFER_DEFAULT_REFUND_EXPLANATION_AR);
    assert.equal(sections.length, 4);
  });

  it("payload round-trips refund explanation", () => {
    const form = formStateFromSpecialOffer(SPECIAL_OFFER_DEFAULTS);
    const payload = payloadFromSpecialOfferForm(form);
    assert.ok(String(payload.refundExplanationAr).length > 20);
  });
});
