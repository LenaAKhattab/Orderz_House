/**
 * Phase B7A follow-up — public /plans uses Admin default catalog resolver.
 * Slug pages stay on the legacy page-package API.
 * Run: node --test src/hooks/usePlansPage.b7a.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("usePlansPage default catalog resolver", () => {
  it("loads Admin-selected default catalog for /plans; slug stays legacy", () => {
    const src = fs.readFileSync(path.join(__dirname, "usePlansPage.js"), "utf8");
    assert.match(src, /useDefaultCatalogPlans/);
    assert.match(src, /enabled:\s*!slug/);
    assert.match(src, /getPublicPlanPageBySlugRequest/);
    assert.match(src, /legacy_page_package/);
    assert.match(src, /catalogSource === "marketplace_membership"/);
  });

  it("PlanCard CTAs route membership to Freelancer plans dashboard", () => {
    const card = fs.readFileSync(
      path.join(__dirname, "../components/plans/PlanCard.jsx"),
      "utf8",
    );
    const mobile = fs.readFileSync(
      path.join(__dirname, "../components/plans/mobile/PlansMobilePlanCard.jsx"),
      "utf8",
    );
    for (const src of [card, mobile]) {
      assert.match(src, /isMarketplaceMembership/);
      assert.match(src, /\/dashboard\/freelancer\/plans/);
      assert.match(src, /plans\.cta\.viewMembership/);
      assert.doesNotMatch(src, /createFreelancerSubscriptionCheckoutRequest/);
    }
  });

  it("mapper enforces PUBLIC E1 order and rejects legacy main-plan fallback", () => {
    const mapper = fs.readFileSync(
      path.join(__dirname, "../lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans.js"),
      "utf8",
    );
    assert.match(mapper, /PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER/);
    assert.match(mapper, /"starter"/);
    assert.match(mapper, /"silver"/);
    assert.match(mapper, /"pro"/);
    assert.match(mapper, /"elite"/);
    assert.doesNotMatch(mapper, /orderzhousePlansCatalog/);
    assert.doesNotMatch(mapper, /includedTokensPerCycle/);
    assert.doesNotMatch(mapper, /billingText:\s*["']شهرياً["']/);
    assert.doesNotMatch(mapper, /billingTextEn:\s*["']Monthly["']/);
  });
});
