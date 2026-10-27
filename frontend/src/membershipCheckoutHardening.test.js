import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { membershipCheckoutStatesFromAttempts, membershipCheckoutStateForPlan } from "./lib/marketplaceMembership/membershipCheckoutState.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

describe("membership checkout hardening — authoritative card states", () => {
  it("maps server attempts to per-plan states; SILVER and Annual SILVER stay separate", () => {
    const states = membershipCheckoutStatesFromAttempts({
      attempts: [
        { planCode: "silver", state: "open", specialOffer: false },
        { planCode: "annual_basic", state: "processing", specialOffer: false },
        { planCode: "special_offer_v2", state: "unknown", specialOffer: true },
      ],
    });
    assert.deepEqual(states.byPlanCode, { silver: "resume", annual_basic: "processing", special_offer_v2: "resume" });
    assert.equal(states.specialOffer, "resume");
    assert.equal(membershipCheckoutStateForPlan(states, { tierCode: "SILVER" }), "resume");
    assert.equal(membershipCheckoutStateForPlan(states, { tierCode: "annual_basic" }), "processing");
    assert.equal(membershipCheckoutStateForPlan(states, { tierCode: "PRO" }), null);
    assert.equal(membershipCheckoutStateForPlan(null, { tierCode: "SILVER" }), null);
    assert.deepEqual(membershipCheckoutStatesFromAttempts(null), { byPlanCode: {}, specialOffer: null });
  });

  it("plan card: Continue payment (enabled) / Confirming payment (locked) from server state", () => {
    const card = read("components/plans/PlanCard.jsx");
    assert.ok(card.includes('checkoutState === "processing"'));
    assert.ok(card.includes('t("plans.cta.continuePayment")'));
    assert.ok(card.includes('t("plans.cta.confirmingPayment")'));
    assert.ok(card.includes("marketplaceCheckoutProcessing ||"));
    for (const f of ["components/plans/PricingSection.jsx", "components/plans/AnnualPlansSection.jsx"]) {
      assert.ok(read(f).includes("checkoutState={membershipCheckoutStateForPlan(checkoutStates,"), f);
    }
    // Only an attempt for THIS offer version may relabel the special-offer card (UI/UX Phase 5).
    assert.ok(read("components/plans/PricingSection.jsx").includes("checkoutState={specialOfferCheckoutState(checkoutStates, specialOffer)}"));
    const offer = read("components/plans/SpecialOfferPackageCard.jsx");
    assert.ok(offer.includes("disabled={checkoutBusy || checkoutProcessing}"));
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.equal(page.split("checkoutStates={marketplaceCheckoutStates}").length - 1, 2);
  });

  it("membership hook: server attempts, BFCache/visibility refresh, localized provider errors", () => {
    const hook = read("hooks/useMarketplaceMembershipCheckout.js");
    assert.ok(hook.includes("getMarketplaceMembershipCheckoutAttemptsRequest()"));
    assert.ok(hook.includes("{ enabled, onVisible: true }"));
    assert.ok(hook.includes('if (reason === "pageshow") {'));
    assert.ok(hook.includes("PAYMENT_PROVIDER_ERROR"));
    assert.ok(hook.includes("data?.membershipChanged"));
    assert.ok(read("services/api.js").includes('"/freelancer/marketplace-membership/checkout-attempts"'));
  });

  it("AR/EN copy", () => {
    const ar = json("locales/ar/plans.json");
    const en = json("locales/en/plans.json");
    assert.equal(ar.cta.continuePayment, "متابعة الدفع");
    assert.equal(ar.cta.confirmingPayment, "جارٍ تأكيد الدفع");
    assert.equal(ar.cta.buyMembership, "اشترِ الباقة");
    assert.equal(en.cta.continuePayment, "Continue payment");
    assert.equal(en.cta.confirmingPayment, "Confirming payment");
    for (const k of ["processing", "statusUnavailable", "providerError"]) {
      assert.ok(ar.checkoutErrors[k] && en.checkoutErrors[k], k);
    }
  });
});
