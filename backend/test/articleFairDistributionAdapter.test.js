/**
 * Mini Bid Article Fair Distribution Adapter — unit tests (no Production writes).
 * Run: node --test test/articleFairDistributionAdapter.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const {
  rankArticleFairCandidates,
  buildNotEligiblePayload,
  assertApplicationInCurrentRound,
  ARTICLE_FAIR_RANKING_SOURCE,
} = require("../src/services/articleFairDistributionAdapterService");
const { ARTICLE_APPLICATION_ERROR_CODES } = require("../src/constants/marketplaceArticleApplications");
const { BID_COLLECTION_ERROR_CODES } = require("../src/constants/opportunityBidCollection");

describe("article fair distribution adapter", () => {
  it("ranks lexicographically without random and recommends #1", () => {
    const ranked = rankArticleFairCandidates([
      {
        applicationId: 2,
        freelancerUserId: 20,
        eligible: true,
        recentEffectiveAssignmentsCount: 3,
        appliedAndLostWaitingCount: 0,
        activeWorkloadCount: 1,
        lastEffectiveAssignmentAt: "2026-01-01T00:00:00.000Z",
        submittedAt: "2026-08-01T10:00:00.000Z",
        stableId: "2",
      },
      {
        applicationId: 1,
        freelancerUserId: 10,
        eligible: true,
        recentEffectiveAssignmentsCount: 0,
        appliedAndLostWaitingCount: 2,
        activeWorkloadCount: 0,
        lastEffectiveAssignmentAt: null,
        submittedAt: "2026-08-01T12:00:00.000Z",
        stableId: "1",
      },
    ]);
    assert.equal(ranked[0].applicationId, 1);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].applicationId, 2);
    const again = rankArticleFairCandidates(ranked.map(({ rank, ...rest }) => rest));
    assert.deepEqual(
      again.map((c) => c.applicationId),
      ranked.map((c) => c.applicationId),
    );
  });

  it("uses submittedAt then applicationId as deterministic fallback", () => {
    const ranked = rankArticleFairCandidates([
      {
        applicationId: 9,
        freelancerUserId: 9,
        eligible: true,
        recentEffectiveAssignmentsCount: 0,
        appliedAndLostWaitingCount: 0,
        activeWorkloadCount: 0,
        lastEffectiveAssignmentAt: null,
        submittedAt: "2026-08-01T11:00:00.000Z",
        stableId: "9",
      },
      {
        applicationId: 3,
        freelancerUserId: 3,
        eligible: true,
        recentEffectiveAssignmentsCount: 0,
        appliedAndLostWaitingCount: 0,
        activeWorkloadCount: 0,
        lastEffectiveAssignmentAt: null,
        submittedAt: "2026-08-01T10:00:00.000Z",
        stableId: "3",
      },
      {
        applicationId: 4,
        freelancerUserId: 4,
        eligible: true,
        recentEffectiveAssignmentsCount: 0,
        appliedAndLostWaitingCount: 0,
        activeWorkloadCount: 0,
        lastEffectiveAssignmentAt: null,
        submittedAt: "2026-08-01T10:00:00.000Z",
        stableId: "4",
      },
    ]);
    assert.deepEqual(
      ranked.map((c) => c.applicationId),
      [3, 4, 9],
    );
  });

  it("returns not-eligible payload before threshold", () => {
    const payload = buildNotEligiblePayload({
      requiredBidCount: 10,
      currentBidCount: 4,
      bidCollectionStatus: "collecting",
      status: "collecting",
    });
    assert.equal(payload.eligibleForAssignment, false);
    assert.equal(payload.recommendedApplicationId, null);
    assert.equal(payload.candidates.length, 0);
    assert.equal(payload.autoAssigned, false);
    assert.equal(payload.rankingSource, ARTICLE_FAIR_RANKING_SOURCE);
  });

  it("rejects selection from a previous collection round", () => {
    assert.throws(
      () =>
        assertApplicationInCurrentRound(
          { current_bid_collection_round_id: 12 },
          { collection_round_id: 7, status: "pending" },
        ),
      (err) => err.publicCode === ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_WRONG_COLLECTION_ROUND,
    );
    assert.doesNotThrow(() =>
      assertApplicationInCurrentRound(
        { current_bid_collection_round_id: 12 },
        { collection_round_id: 12, status: "pending" },
      ),
    );
  });

  it("keeps selection-before-threshold error code from Phase 2A", () => {
    assert.equal(
      BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY,
      "ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY",
    );
  });

  it("does not import Stripe or ordersService", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/articleFairDistributionAdapterService.js"),
      "utf8",
    );
    assert.equal(/require\(["'][^"']*stripe/i.test(src), false);
    assert.equal(/require\(["'][^"']*ordersService/.test(src), false);
  });
});
