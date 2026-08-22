import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatSilverUpgradeButtonLabel,
  silverConversionErrorMessage,
} from "./constants/freelancerActivationConversion.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A6 Silver conversion UI", () => {
  it("Silver CTA card renders for expired trial and work cap", () => {
    const card = read("components/freelancer/FreelancerSilverConversionCard.jsx");
    assert.match(card, /freelancer-silver-conversion-card/);
    assert.match(card, /shouldShowSilverCta/);
    assert.match(card, /startFreelancerSilverCheckoutRequest/);
    assert.match(card, /formatSilverUpgradeButtonLabel/);
    assert.match(card, /silver-upgrade-button/);
    assert.match(card, /silver-conversion-error/);
    assert.doesNotMatch(card, /cardNumber|cvv|cardExpiry/i);
    assert.doesNotMatch(card, /<input[^>]+type=["'](?:password|tel|number)/i);
    assert.match(formatSilverUpgradeButtonLabel("19.000"), /الترقية إلى Silver/);

    const page = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(page, /FreelancerSilverConversionCard/);
    assert.match(page, /getFreelancerActivationConversionRequest/);
    assert.match(page, /FreelancerEarnedBalancePanel/);
    assert.match(page, /id="earned-balance"/);
  });

  it("CTA does not render when paid active / shouldShow false", () => {
    const card = read("components/freelancer/FreelancerSilverConversionCard.jsx");
    assert.match(card, /shouldShowSilverCta !== true/);
  });

  it("upgrade button uses checkout handoff and Arabic errors", () => {
    const card = read("components/freelancer/FreelancerSilverConversionCard.jsx");
    assert.match(card, /checkoutUrl/);
    assert.match(card, /window\.location\.assign/);
    assert.match(card, /silverConversionErrorMessage/);
    assert.equal(
      silverConversionErrorMessage({
        response: { data: { code: "FREELANCER_SILVER_CONVERSION_BLOCKED" } },
      }),
      "لا يمكن بدء ترقية Silver في حالتك الحالية.",
    );
    assert.match(formatSilverUpgradeButtonLabel("19.000"), /19 JOD/);
  });

  it("API helpers and Super Admin conversion counters exist", () => {
    const api = read("services/api.js");
    assert.match(api, /\/freelancer\/activation\/conversion/);
    assert.match(api, /cta-viewed/);
    assert.match(api, /start-silver-checkout/);
    const admin = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(admin, /admin-conversion-counters/);
    assert.match(admin, /ظهر الزر/);
  });

  it("earned balance panel has Silver unlock CTA but no withdrawal/claim actions", () => {
    const panel = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.match(panel, /earned-balance-silver-cta/);
    assert.match(panel, /EARNED_BALANCE_LOCKED_CTA_AR|اشترك لتفعيل السحب/);
    assert.match(panel, /معلّق غير قابل للسحب|Locked pending/);
    assert.doesNotMatch(panel, /onWithdraw|startClaim|claimButton|financialClaim/i);
    const buttons = panel.match(/<button/gi) || [];
    assert.equal(buttons.length, 1, "only the Silver subscription CTA button is allowed");
  });
});
