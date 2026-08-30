/**
 * Phase A2 frontend form utils.
 * Run: node --test src/admin/marketplaceArticles/marketplaceArticleFormUtils.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveArticleValueJodFromLevel,
  normalizeMarketplaceArticlePayload,
  validateMarketplaceArticleForm,
  getInitialMarketplaceArticleFormState,
  ARTICLE_TARGET_PLAN_OPTIONS,
  ARTICLE_PACKAGE_PLAN_LABELS_AR,
  normalizePackagePlanCode,
  formatDerivedPlanRequirementsSummaryAr,
} from "./marketplaceArticleFormUtils.js";

describe("marketplaceArticleFormUtils", () => {
  it("target plan dropdown is exactly 4 canonical options without duplicate تجربة", () => {
    assert.equal(ARTICLE_TARGET_PLAN_OPTIONS.length, 4);
    assert.deepEqual(
      ARTICLE_TARGET_PLAN_OPTIONS.map((o) => o.value),
      ["STARTER", "SILVER", "PRO", "ELITE"],
    );
    assert.deepEqual(
      ARTICLE_TARGET_PLAN_OPTIONS.map((o) => o.labelAr),
      [
        "تجربة / مجاني",
        "فضية (Silver)",
        "احترافية (Pro)",
        "نخبة (Elite)",
      ],
    );
    assert.equal(ARTICLE_PACKAGE_PLAN_LABELS_AR.STARTER, "تجربة / مجاني");
    const labels = ARTICLE_TARGET_PLAN_OPTIONS.map((o) => o.labelAr);
    assert.equal(labels.filter((l) => l === "تجربة").length, 0);
    assert.equal(labels.filter((l) => l.includes("تجربة")).length, 1);
  });

  it("normalizes legacy free/trial aliases to STARTER only", () => {
    assert.equal(normalizePackagePlanCode("trial"), "STARTER");
    assert.equal(normalizePackagePlanCode("free"), "STARTER");
    assert.equal(normalizePackagePlanCode("basic"), "STARTER");
    assert.equal(normalizePackagePlanCode("starter"), "STARTER");
    assert.equal(normalizePackagePlanCode("تجربة"), null);
  });

  it("STARTER and SILVER derived requirements match product copy", () => {
    assert.match(formatDerivedPlanRequirementsSummaryAr("STARTER"), /600 كلمة و 2 مراجع/);
    assert.match(formatDerivedPlanRequirementsSummaryAr("SILVER"), /1200 كلمة و 4 مراجع/);
  });

  it("derives display values 1..5 JOD", () => {
    assert.equal(deriveArticleValueJodFromLevel(1), "1.000");
    assert.equal(deriveArticleValueJodFromLevel(5), "5.000");
  });

  it("validates target plan and derives requirements (not per-article words)", () => {
    const ok = getInitialMarketplaceArticleFormState({
      title: "T",
      targetPlanCode: "SILVER",
      requiredBidCount: 10,
      minRequiredBidsAcknowledged: true,
      bildazoCategoryId: "11111111-1111-4111-8111-111111111111",
      writingMode: "either",
    });
    assert.deepEqual(validateMarketplaceArticleForm(ok), {});
    assert.ok(validateMarketplaceArticleForm({ ...ok, targetPlanCode: "" }).targetPlanCode);
    assert.ok(validateMarketplaceArticleForm({ ...ok, bildazoCategoryId: "" }).bildazoCategoryId);
    assert.ok(validateMarketplaceArticleForm({ ...ok, writingMode: "" }).writingMode);
    const payload = normalizeMarketplaceArticlePayload(ok);
    assert.equal(payload.targetPlanCode, "SILVER");
    assert.equal(payload.requiredWordCount, 1200);
    assert.equal(payload.requiredReferencesCount, 4);
    assert.equal(payload.articleLevel, 2);
  });

  it("requires acknowledgement and rejects requiredBidCount 5 (legacy form)", () => {
    const ok = getInitialMarketplaceArticleFormState({
      title: "T",
      requiredBidCount: 10,
      minRequiredBidsAcknowledged: true,
      bildazoCategoryId: "11111111-1111-4111-8111-111111111111",
      writingMode: "manual",
    });
    assert.ok(validateMarketplaceArticleForm({ ...ok, requiredBidCount: 5 }).requiredBidCount);
    assert.ok(
      validateMarketplaceArticleForm({ ...ok, minRequiredBidsAcknowledged: false })
        .minRequiredBidsAcknowledged,
    );
  });

  it("OZ05 inventory form allows flexible bid count and requires duration", () => {
    const ok = getInitialMarketplaceArticleFormState({
      title: "T",
      inventorySimplified: true,
      allowFlexibleBidCount: true,
      requiredBidCount: 2,
      bidCollectionDurationHours: 48,
      minRequiredBidsAcknowledged: true,
      bildazoCategoryId: "11111111-1111-4111-8111-111111111111",
      writingMode: "manual",
    });
    assert.equal(validateMarketplaceArticleForm(ok).requiredBidCount, undefined);
    assert.equal(validateMarketplaceArticleForm(ok).bidCollectionDurationHours, undefined);
    assert.ok(validateMarketplaceArticleForm({ ...ok, requiredBidCount: 0 }).requiredBidCount);
    assert.ok(
      validateMarketplaceArticleForm({ ...ok, bidCollectionDurationHours: 0 })
        .bidCollectionDurationHours,
    );
    const payload = normalizeMarketplaceArticlePayload(ok);
    assert.equal(payload.requiredBidCount, 2);
    assert.equal(payload.bidCollectionDurationHours, 48);
  });

  it("allows 10/15/20/30", () => {
    const base = getInitialMarketplaceArticleFormState({
      title: "T",
      minRequiredBidsAcknowledged: true,
      bildazoCategoryId: "11111111-1111-4111-8111-111111111111",
      writingMode: "ai",
    });
    for (const n of [10, 15, 20, 30]) {
      assert.equal(validateMarketplaceArticleForm({ ...base, requiredBidCount: n }).requiredBidCount, undefined);
    }
  });

  it("includes warning copy helper constants", async () => {
    const { ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR } = await import("./marketplaceArticleFormUtils.js");
    assert.match(ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR, /الحد الأدنى المطلوب لإتمام المناقصة/);
  });

  it("formats progress text", async () => {
    const {
      formatArticleBidProgressLabel,
      formatArticleBidCollectionLabel,
      ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR,
      ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR,
    } = await import("./marketplaceArticleFormUtils.js");
    assert.equal(formatArticleBidProgressLabel(7, 10), "7 من 10 متقدمين مطلوبين");
    assert.equal(
      formatArticleBidCollectionLabel({
        requiredBidCount: 10,
        currentBidCount: 10,
        bidCollectionStatus: "eligible_for_assignment",
        thresholdReached: true,
      }),
      ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR,
    );
    assert.equal(
      formatArticleBidCollectionLabel({
        requiredBidCount: 10,
        currentBidCount: 2,
        bidCollectionStatus: "minimum_not_met",
      }),
      ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR,
    );
  });

  it("canRelistBidCollection only for minimum_not_met", async () => {
    const { canRelistBidCollection } = await import("./marketplaceArticleFormUtils.js");
    assert.equal(canRelistBidCollection({ bidCollectionStatus: "collecting" }), false);
    assert.equal(canRelistBidCollection({ bidCollectionStatus: "eligible_for_assignment" }), false);
    assert.equal(canRelistBidCollection({ bidCollectionStatus: "assigned" }), false);
    assert.equal(canRelistBidCollection({ bidCollectionStatus: "minimum_not_met" }), true);
    assert.equal(canRelistBidCollection({ canRelistBidCollection: true, bidCollectionStatus: "collecting" }), true);
  });

  it("isBidCollectionClosedForApply covers threshold and minimum_not_met", async () => {
    const { isBidCollectionClosedForApply } = await import("./marketplaceArticleFormUtils.js");
    assert.equal(isBidCollectionClosedForApply(null), false);
    assert.equal(isBidCollectionClosedForApply({ bidCollectionStatus: "collecting" }), false);
    assert.equal(isBidCollectionClosedForApply({ bidCollectionStatus: "minimum_not_met" }), true);
    assert.equal(isBidCollectionClosedForApply({ bidCollectionStatus: "threshold_reached" }), true);
  });

  it("fair ranking helpers: pending vs eligible recommended", async () => {
    const {
      isFairRankingEligible,
      isRecommendedArticleApplicant,
      isRecommendedPantryBid,
      ARTICLE_FAIR_RANKING_DISCLAIMER_AR,
    } = await import("./marketplaceArticleFormUtils.js");
    assert.equal(isFairRankingEligible({ eligibleForAssignment: false }), false);
    assert.equal(
      isFairRankingEligible({ eligibleForAssignment: true, recommendedApplicationId: "5" }),
      true,
    );
    assert.equal(
      isRecommendedArticleApplicant(5, { recommendedApplicationId: "5" }),
      true,
    );
    assert.equal(
      isRecommendedArticleApplicant(9, { recommendedApplicationId: "5" }),
      false,
    );
    assert.equal(isRecommendedPantryBid(3, { recommendedBidId: "3" }), true);
    assert.equal(isRecommendedPantryBid(9, { recommendedBidId: "3" }), false);
    assert.match(ARTICLE_FAIR_RANKING_DISCLAIMER_AR, /التوزيع العادل/);
  });

  it("applications panel shows relist copy gated by canRelistBidCollection", () => {
    const src = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "MarketplaceArticleApplicationsPanel.jsx"),
      "utf8",
    );
    assert.match(src, /إعادة طرح المناقصة/);
    assert.match(src, /canRelistBidCollection/);
    assert.match(src, /لن يتم احتساب المتقدمين السابقين/);
    assert.match(src, /FairSelectionOverrideDialog/);
    assert.match(src, /overrideReason/);
    assert.match(src, /setOverrideTargetId/);
  });

  it("normalizes payload from target plan without forging articleValueJod", () => {
    const payload = normalizeMarketplaceArticlePayload(
      getInitialMarketplaceArticleFormState({
        title: "Hello",
        targetPlanCode: "PRO",
        status: "published",
        requiredBidCount: 10,
        minRequiredBidsAcknowledged: true,
        bildazoCategoryId: "11111111-1111-4111-8111-111111111111",
        bildazoCategoryName: "تقنية",
        writingMode: "manual",
      }),
    );
    assert.equal(payload.targetPlanCode, "PRO");
    assert.equal(payload.articleLevel, 3);
    assert.equal(payload.requiredWordCount, 1800);
    assert.equal(payload.requiredReferencesCount, 6);
    assert.equal(payload.writingMode, "manual");
    assert.equal(payload.bildazoCategoryId, "11111111-1111-4111-8111-111111111111");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "articleValueJod"), false);
  });
});
