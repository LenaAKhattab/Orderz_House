/**
 * Marketplace-M5 — freelancer package buttons + pending-start UI (static / mocked).
 * Run from frontend/: node --test src/marketplaceMembershipM5Ui.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPaidMarketplaceMembershipTierCode,
  isStarterMarketplaceMembershipTierCode,
  resolveMarketplaceCheckoutPlanCode,
} from "./lib/marketplaceMembership/marketplaceMembershipCheckoutUi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("M5 helpers — paid vs STARTER", () => {
  it("resolves SILVER/PRO/ELITE checkout codes", () => {
    assert.equal(resolveMarketplaceCheckoutPlanCode({ tierCode: "silver" }), "SILVER");
    assert.equal(resolveMarketplaceCheckoutPlanCode({ tierCode: "PRO" }), "PRO");
    assert.equal(isPaidMarketplaceMembershipTierCode("elite"), true);
    assert.equal(isStarterMarketplaceMembershipTierCode("starter"), true);
    assert.equal(isPaidMarketplaceMembershipTierCode("starter"), false);
  });
});

describe("M5 A/B — checkout wiring", () => {
  it("paid packages call createMarketplaceMembershipCheckoutRequest; STARTER uses activate endpoint", () => {
    const hook = read("hooks/useMarketplaceMembershipCheckout.js");
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    const planCard = read("components/plans/PlanCard.jsx");
    const api = read("services/api.js");

    assert.match(hook, /createMarketplaceMembershipCheckoutRequest/);
    assert.match(hook, /activateMarketplaceStarterMembershipRequest/);
    assert.match(hook, /isPaidMarketplaceMembershipTierCode/);
    assert.match(hook, /isStarterMarketplaceMembershipTierCode/);
    assert.match(hook, /window\.location\.href\s*=\s*url/);
    assert.match(hook, /checkoutBusyPlanId/);
    assert.doesNotMatch(hook, /createAndActivateMarketplaceMembership|grantMembership|status:\s*["']active["']/);

    assert.match(page, /useMarketplaceMembershipCheckout/);
    assert.match(page, /startMarketplaceCheckout/);
    assert.match(page, /checkoutBusyPlanId=\{marketplaceCheckoutBusyPlanId\}/);
    assert.match(page, /onCta=\{startMarketplaceCheckout\}/);

    assert.match(planCard, /typeof onCta === "function"/);
    assert.match(planCard, /onCta\(plan\)/);
    assert.match(planCard, /plans\.cta\.buyMembership/);
    assert.match(planCard, /plans\.cta\.activateStarter/);

    assert.match(api, /createMarketplaceMembershipCheckoutRequest/);
    assert.match(api, /activateMarketplaceStarterMembershipRequest/);
    assert.match(api, /\/freelancer\/marketplace-membership\/starter\/activate/);
    assert.match(api, /\/freelancer\/marketplace-membership\/checkout/);
  });

  it("STARTER path does not call Stripe checkout", () => {
    const hook = read("hooks/useMarketplaceMembershipCheckout.js");
    const starterBlockStart = hook.indexOf("isStarterMarketplaceMembershipTierCode");
    const paidBlockStart = hook.indexOf("isPaidMarketplaceMembershipTierCode(tier)");
    assert.ok(starterBlockStart > 0 && paidBlockStart > starterBlockStart);
    const starterBody = hook.slice(starterBlockStart, paidBlockStart);
    assert.match(starterBody, /activateMarketplaceStarterMembershipRequest/);
    assert.doesNotMatch(starterBody, /createMarketplaceMembershipCheckoutRequest/);
  });
});

describe("M5 C/D — success/cancel return UI", () => {
  it("success query shows pending-start payment message without local grant", () => {
    const hook = read("hooks/useMarketplaceMembershipCheckout.js");
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.match(hook, /membershipCheckout/);
    assert.match(hook, /success/);
    assert.match(hook, /checkoutSuccessMessage/);
    assert.match(hook, /checkoutWebhookHint/);
    assert.match(hook, /refreshMembership/);
    assert.doesNotMatch(hook, /confirmFreelancerSubscriptionCheckoutRequest/);
    assert.match(page, /marketplace-membership-checkout-banner/);
    assert.match(page, /returnBanner/);
  });

  it("cancel query shows cancelled message", () => {
    const hook = read("hooks/useMarketplaceMembershipCheckout.js");
    const ar = JSON.parse(read("locales/ar/freelancerDashboard.json"));
    assert.match(hook, /cancelled/);
    assert.match(hook, /checkoutCancelledMessage/);
    assert.equal(
      ar.marketplaceMembership.checkoutCancelledMessage,
      "تم إلغاء عملية الدفع. يمكنك اختيار الباقة مرة أخرى في أي وقت.",
    );
  });
});

describe("M5 E/F — membership card pending-start vs active", () => {
  it("purchased_pending_start panel: message, term not started, no countdown", () => {
    const card = read("components/freelancer/FreelancerMarketplaceMembershipCard.jsx");
    const ar = JSON.parse(read("locales/ar/freelancerDashboard.json"));
    assert.match(card, /purchased_pending_start/);
    assert.match(card, /marketplace-membership-pending-start/);
    assert.match(card, /data-term-started="false"/);
    assert.match(card, /pendingStartBody|statusMessageAr/);
    assert.match(card, /termNotStarted/);
    assert.match(card, /termStartsOnFirstOrder/);
    assert.match(card, /purchasedAt/);
    // Countdown / endsAt only when termStarted
    assert.match(card, /termStarted/);
    assert.equal(
      ar.marketplaceMembership.purchasedTitle,
      "تم شراء العضوية",
    );
    assert.match(
      ar.marketplaceMembership.pendingStartBody,
      /لن تبدأ مدة الاشتراك إلا عند استلامك أول طلب/,
    );
    assert.match(
      ar.marketplaceMembership.checkoutSuccessMessage,
      /توثيق الهوية والتدريب/,
    );
  });

  it("active membership still renders active state and may show endsOn", () => {
    const card = read("components/freelancer/FreelancerMarketplaceMembershipCard.jsx");
    assert.match(card, /marketplace-membership-active/);
    assert.match(card, /statusActive/);
    assert.match(card, /endsOn/);
    assert.match(card, /benefitsUsable/);
  });

  it("does not show Priority Bid / bids as usable while pending-start", () => {
    const card = read("components/freelancer/FreelancerMarketplaceMembershipCard.jsx");
    assert.match(card, /benefitsUsable/);
    assert.match(card, /bidsAvailable = benefitsUsable/);
  });
});

describe("M5 G/H — locales + b7a cutover", () => {
  it("no raw translation keys in card/page for M5 strings", () => {
    const card = read("components/freelancer/FreelancerMarketplaceMembershipCard.jsx");
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.doesNotMatch(card, />freelancerDashboard\.marketplaceMembership\./);
    assert.doesNotMatch(page, />freelancerDashboard\.marketplaceMembership\./);
    const ar = JSON.parse(read("locales/ar/freelancerDashboard.json"));
    const en = JSON.parse(read("locales/en/freelancerDashboard.json"));
    const plansAr = JSON.parse(read("locales/ar/plans.json"));
    const plansEn = JSON.parse(read("locales/en/plans.json"));
    for (const key of [
      "purchasedTitle",
      "pendingStartBody",
      "checkoutSuccessMessage",
      "checkoutCancelledMessage",
      "termNotStarted",
    ]) {
      assert.equal(typeof ar.marketplaceMembership[key], "string");
      assert.equal(typeof en.marketplaceMembership[key], "string");
      assert.ok(ar.marketplaceMembership[key].length > 5);
    }
    assert.equal(typeof plansAr.cta.buyMembership, "string");
    assert.equal(typeof plansEn.cta.activateStarter, "string");
  });

  it("plans page still omits Bid Credits summary title العروض المتاحة as page section", () => {
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.match(page, /FreelancerMarketplaceMembershipCard/);
    assert.doesNotMatch(page, /FreelancerBidCreditsCard/);
    assert.doesNotMatch(page, /العروض المتاحة/);
  });
});
