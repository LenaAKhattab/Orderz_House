/**
 * Pantry House Fair Distribution Adapter — unit tests (no Production writes).
 * Run: node --test test/pantryFairDistributionAdapter.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const {
  rankPantryFairCandidates,
  buildNotEligiblePayload,
  getPantryFairRanking,
  PANTRY_FAIR_RANKING_SOURCE,
} = require("../src/services/pantryFairDistributionAdapterService");
const collectionService = require("../src/services/opportunityBidCollectionService");
const { BID_COLLECTION_ERROR_CODES } = require("../src/constants/opportunityBidCollection");
const { canAdminAcceptBid } = require("../src/constants/pantry");

describe("pantry fair distribution adapter", () => {
  it("ranks lexicographically without random and recommends #1", () => {
    const ranked = rankPantryFairCandidates([
      {
        bidId: 2,
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
        bidId: 1,
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
    assert.equal(ranked[0].bidId, 1);
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].bidId, 2);
    const again = rankPantryFairCandidates(ranked.map(({ rank, ...rest }) => rest));
    assert.deepEqual(
      again.map((c) => c.bidId),
      ranked.map((c) => c.bidId),
    );
  });

  it("uses submittedAt then bidId as deterministic fallback", () => {
    const ranked = rankPantryFairCandidates([
      {
        bidId: 9,
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
        bidId: 3,
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
        bidId: 4,
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
      ranked.map((c) => c.bidId),
      [3, 4, 9],
    );
  });

  it("returns empty candidates before threshold", () => {
    const payload = buildNotEligiblePayload({
      requiredBidCount: 10,
      currentBidCount: 4,
      bidCollectionStatus: "collecting",
      status: "collecting",
    });
    assert.equal(payload.eligibleForAssignment, false);
    assert.equal(payload.recommendedBidId, null);
    assert.equal(payload.candidates.length, 0);
    assert.equal(payload.autoAssigned, false);
    assert.equal(payload.rankingSource, PANTRY_FAIR_RANKING_SOURCE);
    assert.match(payload.messageAr, /سيظهر ترتيب التوزيع العادل بعد اكتمال العدد المطلوب/);
  });

  it("getPantryFairRanking before threshold returns pending message", async () => {
    const orig = collectionService.getPantryBidCollectionProgress;
    collectionService.getPantryBidCollectionProgress = async () => ({
      requiredBidCount: 10,
      currentBidCount: 3,
      bidCollectionStatus: "collecting",
      status: "collecting",
    });
    const client = {
      async query(sql) {
        if (/FROM pantry_requests/.test(sql)) {
          return {
            rows: [
              {
                id: 44,
                category_id: null,
                subcategory_id: null,
                required_bid_count: 10,
                current_bid_collection_round_id: 8,
                status: "open_for_bids",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    try {
      const out = await getPantryFairRanking(44, { client });
      assert.equal(out.eligibleForAssignment, false);
      assert.equal(out.candidates.length, 0);
      assert.equal(out.autoAssigned, false);
      assert.match(out.messageAr, /سيظهر ترتيب التوزيع العادل/);
    } finally {
      collectionService.getPantryBidCollectionProgress = orig;
    }
  });

  it("getPantryFairRanking after threshold returns deterministic #1", async () => {
    const orig = collectionService.getPantryBidCollectionProgress;
    const settingsSvc = require("../src/services/marketplaceEconomySettingsService");
    const origSettings = settingsSvc.getMarketplaceEconomySettings;
    collectionService.getPantryBidCollectionProgress = async () => ({
      requiredBidCount: 10,
      currentBidCount: 10,
      bidCollectionStatus: "eligible_for_assignment",
      status: "eligible_for_assignment",
    });
    settingsSvc.getMarketplaceEconomySettings = async () => ({ fairDistributionLookbackDays: 30 });
    const client = {
      async query(sql) {
        if (/FROM pantry_requests/.test(sql)) {
          return {
            rows: [
              {
                id: 44,
                category_id: null,
                subcategory_id: null,
                required_bid_count: 10,
                current_bid_collection_round_id: 8,
                status: "open_for_bids",
              },
            ],
          };
        }
        if (/FROM pantry_bids/.test(sql)) {
          return {
            rows: [
              {
                id: 9,
                freelancer_id: 90,
                status: "pending",
                amount: 20,
                created_at: "2026-08-01T11:00:00.000Z",
                freelancer_name: "Later",
              },
              {
                id: 3,
                freelancer_id: 30,
                status: "pending",
                amount: 15,
                created_at: "2026-08-01T10:00:00.000Z",
                freelancer_name: "Earlier",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    try {
      const out = await getPantryFairRanking(44, { client });
      assert.equal(out.eligibleForAssignment, true);
      assert.equal(out.autoAssigned, false);
      assert.equal(out.rankingSource, PANTRY_FAIR_RANKING_SOURCE);
      assert.equal(out.recommendedBidId, "3");
      assert.equal(out.candidates[0].rank, 1);
      assert.equal(out.candidates[0].bidId, "3");
      assert.equal(out.candidates[1].bidId, "9");
    } finally {
      collectionService.getPantryBidCollectionProgress = orig;
      settingsSvc.getMarketplaceEconomySettings = origSettings;
    }
  });

  it("legacy NULL requiredBidCount skips ranking and keeps manual accept rules", async () => {
    const orig = collectionService.getPantryBidCollectionProgress;
    collectionService.getPantryBidCollectionProgress = async () => ({
      requiredBidCount: null,
      currentBidCount: 0,
      bidCollectionStatus: null,
    });
    const client = {
      async query() {
        return {
          rows: [
            {
              id: 1,
              category_id: null,
              required_bid_count: null,
              current_bid_collection_round_id: null,
              status: "open_for_bids",
            },
          ],
        };
      },
    };
    try {
      const out = await getPantryFairRanking(1, { client });
      assert.equal(out.rankingSkipped, true);
      assert.equal(out.eligibleForAssignment, false);
      assert.equal(out.candidates.length, 0);
      assert.equal(canAdminAcceptBid("open_for_bids", "pending"), true);
      const guard = await collectionService.assertPantrySelectionAllowed(
        { query: async () => ({ rows: [] }) },
        { required_bid_count: null, current_bid_collection_round_id: null },
      );
      assert.equal(guard, null);
    } finally {
      collectionService.getPantryBidCollectionProgress = orig;
    }
  });

  it("accept before threshold remains blocked; after threshold allowed; wrong round rejected", async () => {
    collectionService.clearPantryBidCollectionSchemaCache();
    const tooEarlyClient = {
      async query(sql) {
        if (/to_regclass/.test(sql) || /information_schema/.test(sql)) {
          return { rows: [{ rounds: "opportunity_bid_collection_rounds", pantry_col: true }] };
        }
        if (/FROM opportunity_bid_collection_rounds/.test(sql)) {
          return {
            rows: [
              {
                id: 9,
                opportunity_id: 3,
                opportunity_type: "pantry_request",
                required_bid_count: 10,
                bid_collection_status: "collecting",
              },
            ],
          };
        }
        if (/FROM pantry_bids/.test(sql)) {
          return { rows: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, status: "pending" })) };
        }
        return { rows: [] };
      },
    };
    await assert.rejects(
      () =>
        collectionService.assertPantrySelectionAllowed(tooEarlyClient, {
          required_bid_count: 10,
          current_bid_collection_round_id: 9,
        }),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY,
    );

    collectionService.clearPantryBidCollectionSchemaCache();
    const okClient = {
      async query(sql) {
        if (/to_regclass/.test(sql) || /information_schema/.test(sql)) {
          return { rows: [{ rounds: "opportunity_bid_collection_rounds", pantry_col: true }] };
        }
        if (/FROM opportunity_bid_collection_rounds/.test(sql)) {
          return {
            rows: [
              {
                id: 9,
                opportunity_id: 3,
                opportunity_type: "pantry_request",
                required_bid_count: 10,
                bid_collection_status: "eligible_for_assignment",
              },
            ],
          };
        }
        if (/FROM pantry_bids/.test(sql)) {
          return { rows: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, status: "pending" })) };
        }
        return { rows: [] };
      },
    };
    const round = await collectionService.assertPantrySelectionAllowed(okClient, {
      required_bid_count: 10,
      current_bid_collection_round_id: 9,
    });
    assert.equal(round.bid_collection_status, "eligible_for_assignment");

    assert.throws(
      () =>
        collectionService.assertPantryBidInCurrentRound(
          { required_bid_count: 10, current_bid_collection_round_id: 12 },
          { collection_round_id: 7 },
        ),
      (err) => err.statusCode === 409,
    );
    assert.doesNotThrow(() =>
      collectionService.assertPantryBidInCurrentRound(
        { required_bid_count: 10, current_bid_collection_round_id: 12 },
        { collection_round_id: 12 },
      ),
    );
  });

  it("non-rank-#1 accept requires an explicit override reason", () => {
    const service = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.match(service, /enforceFairSelectionOverride/);
    assert.match(service, /PANTRY_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED/);
    assert.doesNotMatch(service, /auto.?assign/i);
  });

  it("does not import Stripe or ordersService", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryFairDistributionAdapterService.js"),
      "utf8",
    );
    assert.doesNotMatch(src, /require\(["']stripe["']\)/);
    assert.doesNotMatch(src, /require\(["'].*ordersService["']\)/);
    const routes = fs.readFileSync(path.join(__dirname, "../src/routes/pantryRoutes.js"), "utf8");
    assert.match(routes, /fair-ranking/);
  });
});
