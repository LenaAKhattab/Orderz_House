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
  PLAN_UPGRADE_DEFAULT_ROUTE,
  requiredTierCodeForArticleLevel,
  shouldShowArticlePlanUpgradeCta,
} from "./constants/planUpgradeCta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A10 plan upgrade CTA", () => {
  test("PLAN_TOO_LOW compact copy", () => {
    const ar = buildPlanUpgradeCopy({ reason: "PLAN_TOO_LOW", isEn: false });
    assert.equal(ar.headline, "قيمة هذا الطلب أعلى من حد باقتك الحالية");
    assert.equal(ar.button, "ترقية الباقة");
    assert.equal(ar.mode, "upgrade");
    assert.doesNotMatch(ar.headline, /غير متاح لباقتك|يحتاج ترقية الباقة|باقات أعلى/);

    const en = buildPlanUpgradeCopy({ reason: "PLAN_TOO_LOW", isEn: true });
    assert.match(en.headline, /exceeds your current plan limit/i);
    assert.equal(en.button, "Upgrade plan");
  });

  test("NO_ACTIVE_PLAN and INTERNAL_PLAN_CONFIGURATION copy", () => {
    const none = buildPlanUpgradeCopy({ reason: "NO_ACTIVE_PLAN", isEn: false });
    assert.equal(none.headline, "فعّل باقتك لاستلام الطلبات");
    assert.equal(none.button, "عرض الباقات");
    assert.equal(none.mode, "upgrade");

    const internal = buildPlanUpgradeCopy({ reason: "INTERNAL_PLAN_CONFIGURATION", isEn: false });
    assert.match(internal.headline, /التواصل مع الدعم/);
    assert.equal(internal.button, null);
    assert.equal(internal.mode, "support");
    assert.equal(isPlanUpgradeReason("INTERNAL_PLAN_CONFIGURATION"), false);
  });

  test("CTA helpers only fire for plan/tier reasons", () => {
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "ARTICLE_ACCESS_LEVEL_INSUFFICIENT" }), true);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "ARTICLE_NO_USABLE_MEMBERSHIP" }), true);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "PLAN_TOO_LOW" }), true);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "NO_ACTIVE_PLAN" }), true);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "INTERNAL_PLAN_CONFIGURATION" }), false);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "INSUFFICIENT_BID_CREDITS" }), false);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "BILDAZO_AUTHOR_LINK_REQUIRED" }), false);
    assert.equal(shouldShowArticlePlanUpgradeCta({ eligible: false, reason: "CAMPAIGN_PAUSED" }), false);
    assert.equal(isPlanUpgradeReason("TRAINING_REQUIRED"), false);
    assert.equal(requiredTierCodeForArticleLevel(2), "silver");
    assert.equal(requiredTierCodeForArticleLevel(3), "pro");
  });

  test("pool order props resolve by reason", () => {
    const tooLow = planUpgradePropsFromPoolOrder({
      poolEligibility: { isLockedByPlan: true, reasonCode: "PLAN_TOO_LOW", requiredTierCode: "pro" },
    });
    assert.equal(tooLow.reason, "PLAN_TOO_LOW");
    assert.equal(tooLow.requiredTierCode, "pro");
    assert.equal(tooLow.mode, "upgrade");

    const noPlan = planUpgradePropsFromPoolOrder({
      poolEligibility: { isLockedByPlan: true, reasonCode: "NO_ACTIVE_PLAN" },
    });
    assert.equal(noPlan.reason, "NO_ACTIVE_PLAN");
    assert.equal(noPlan.mode, "upgrade");

    const internal = planUpgradePropsFromPoolOrder({
      poolEligibility: {
        isLockedByPlan: true,
        reasonCode: "INTERNAL_PLAN_CONFIGURATION",
        planConfigurationError: true,
      },
    });
    assert.equal(internal.reason, "INTERNAL_PLAN_CONFIGURATION");
    assert.equal(internal.mode, "support");

    assert.equal(
      planUpgradePropsFromPoolOrder({ poolEligibility: { isLockedByPlan: false } }),
      null,
    );
  });

  test("component and pages wire CTA; plans route; no fake/simulation", () => {
    assert.equal(PLAN_UPGRADE_DEFAULT_ROUTE, "/dashboard/freelancer/plans");
    const cta = read("components/freelancer/PlanUpgradeRequiredCta.jsx");
    assert.match(cta, /plan-upgrade-required-cta/);
    assert.match(cta, /PLAN_UPGRADE_DEFAULT_ROUTE|\/dashboard\/freelancer\/plans/);
    assert.doesNotMatch(cta, /\bfake\b|\bSimulation\b|وهمي/);

    const row = read("components/open-orders/MarketplaceOrderListRow.jsx");
    assert.match(row, /PlanUpgradeRequiredCta/);
    assert.match(row, /compact/);
    const details = read("pages/dashboard/FreelancerOrderDetailsPage.jsx");
    assert.match(details, /PlanUpgradeRequiredCta/);
    const article = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(article, /PlanUpgradeRequiredCta/);
    assert.match(article, /shouldShowArticlePlanUpgradeCta/);
    assert.doesNotMatch(article, /طلب وهمي|Fake order|Simulation opportunity/i);
  });
});
