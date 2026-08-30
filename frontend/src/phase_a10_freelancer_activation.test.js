/**
 * Phase A10 — Plan upgrade CTA frontend.
 */
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPlanUpgradeCopy,
  isPlanUpgradeReason,
  planUpgradePropsFromPoolOrder,
  requiredTierCodeForArticleLevel,
  shouldShowArticlePlanUpgradeCta,
} from "./constants/planUpgradeCta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A10 plan upgrade CTA", () => {
  test("locked opportunity copy shows required tier and upgrade action", () => {
    const silver = buildPlanUpgradeCopy({ requiredTierCode: "silver", isEn: false });
    assert.match(silver.headline, /Silver/);
    assert.match(silver.action, /ترقية الخطة/);
    assert.equal(silver.button, "ترقية الخطة");
    assert.match(silver.headline, /باقات أعلى/);
    assert.doesNotMatch(silver.headline, /تصحيح/);

    const pro = buildPlanUpgradeCopy({ requiredTierCode: "pro", isEn: false });
    assert.match(pro.headline, /Pro/);
  });

  test("CTA helpers only fire for plan/tier reasons", () => {
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "ARTICLE_ACCESS_LEVEL_INSUFFICIENT" }), true);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "ARTICLE_NO_USABLE_MEMBERSHIP" }), true);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "INSUFFICIENT_BID_CREDITS" }), false);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "BILDAZO_AUTHOR_LINK_REQUIRED" }), false);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "CAMPAIGN_PAUSED" }), false);
    assert.equal(isPlanUpgradeReason("TRAINING_REQUIRED"), false);
    assert.equal(requiredTierCodeForArticleLevel(2), "silver");
    assert.equal(requiredTierCodeForArticleLevel(3), "pro");
  });

  test("pool order props resolve for plan lock only", () => {
    const props = planUpgradePropsFromPoolOrder({
      poolEligibility: { isLockedByPlan: true, requiredTierCode: "pro" },
    });
    assert.equal(props.requiredTierCode, "pro");
    assert.equal(
      planUpgradePropsFromPoolOrder({ poolEligibility: { isLockedByPlan: false } }),
      null,
    );
  });

  test("component and pages wire CTA; no fake/simulation in freelancer UI", () => {
    const cta = read("components/freelancer/PlanUpgradeRequiredCta.jsx");
    assert.match(cta, /plan-upgrade-required-cta/);
    assert.match(cta, /PLAN_UPGRADE_DEFAULT_ROUTE|\/dashboard\/freelancer\/plans/);
    assert.doesNotMatch(cta, /\bfake\b|\bSimulation\b|وهمي/);

    const row = read("components/open-orders/MarketplaceOrderListRow.jsx");
    assert.match(row, /PlanUpgradeRequiredCta/);
    const details = read("pages/dashboard/FreelancerOrderDetailsPage.jsx");
    assert.match(details, /PlanUpgradeRequiredCta/);
    const article = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(article, /PlanUpgradeRequiredCta/);
    assert.match(article, /shouldShowArticlePlanUpgradeCta/);
    assert.doesNotMatch(article, /طلب وهمي|Fake order|Simulation opportunity/i);
  });
});
