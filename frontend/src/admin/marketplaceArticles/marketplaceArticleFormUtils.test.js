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
} from "./marketplaceArticleFormUtils.js";

describe("marketplaceArticleFormUtils", () => {
  it("derives display values 1..5 JOD", () => {
    assert.equal(deriveArticleValueJodFromLevel(1), "1.000");
    assert.equal(deriveArticleValueJodFromLevel(5), "5.000");
  });

  it("validates word/references/level", () => {
    const ok = getInitialMarketplaceArticleFormState({
      title: "T",
      articleLevel: 2,
      requiredWordCount: 100,
      requiredReferencesCount: 0,
      requiredBidCount: 10,
      minRequiredBidsAcknowledged: true,
    });
    assert.deepEqual(validateMarketplaceArticleForm(ok), {});
    assert.ok(validateMarketplaceArticleForm({ ...ok, articleLevel: 0 }).articleLevel);
    assert.ok(validateMarketplaceArticleForm({ ...ok, requiredWordCount: 0 }).requiredWordCount);
    assert.ok(validateMarketplaceArticleForm({ ...ok, requiredReferencesCount: -1 }).requiredReferencesCount);
  });

  it("requires acknowledgement and rejects requiredBidCount 5", () => {
    const ok = getInitialMarketplaceArticleFormState({
      title: "T",
      requiredBidCount: 10,
      minRequiredBidsAcknowledged: true,
    });
    assert.ok(validateMarketplaceArticleForm({ ...ok, requiredBidCount: 5 }).requiredBidCount);
    assert.ok(
      validateMarketplaceArticleForm({ ...ok, minRequiredBidsAcknowledged: false })
        .minRequiredBidsAcknowledged,
    );
  });

  it("allows 10/15/20/30", () => {
    const base = getInitialMarketplaceArticleFormState({
      title: "T",
      minRequiredBidsAcknowledged: true,
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

  it("normalizes payload without forging articleValueJod", () => {
    const payload = normalizeMarketplaceArticlePayload(
      getInitialMarketplaceArticleFormState({
        title: "Hello",
        articleLevel: 3,
        requiredWordCount: 900,
        requiredReferencesCount: 2,
        status: "published",
        requiredBidCount: 10,
        minRequiredBidsAcknowledged: true,
      }),
    );
    assert.equal(payload.articleLevel, 3);
    assert.equal(payload.requiredWordCount, 900);
    assert.equal(payload.requiredReferencesCount, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "articleValueJod"), false);
  });
});
