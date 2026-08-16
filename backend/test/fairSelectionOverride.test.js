/**
 * Phase 4B fair-selection override reason — unit tests (no Production writes).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const {
  assertFairOverrideReason,
  needsFairSelectionOverride,
  enforceFairSelectionOverride,
  FAIR_OVERRIDE_REASON_MIN,
} = require("../src/services/fairDistributionSelectionOverrideService");
const { BID_COLLECTION_ERROR_CODES } = require("../src/constants/opportunityBidCollection");
const { ARTICLE_APPLICATION_ERROR_CODES } = require("../src/constants/marketplaceArticleApplications");

const rankingTwo = {
  eligibleForAssignment: true,
  recommendedApplicationId: "1",
  recommendedBidId: "10",
  collectionRoundId: "9",
  candidates: [
    { rank: 1, applicationId: "1", bidId: "10" },
    { rank: 2, applicationId: "2", bidId: "11" },
  ],
};

describe("fair selection override reason", () => {
  it("does not require reason for rank #1", () => {
    assert.equal(needsFairSelectionOverride(rankingTwo, 1, "applicationId"), false);
    assert.equal(needsFairSelectionOverride(rankingTwo, 10, "bidId"), false);
  });

  it("requires reason for non-rank-#1", () => {
    assert.equal(needsFairSelectionOverride(rankingTwo, 2, "applicationId"), true);
    assert.equal(needsFairSelectionOverride(rankingTwo, 11, "bidId"), true);
  });

  it("does not require reason for legacy skipped ranking", () => {
    assert.equal(
      needsFairSelectionOverride({ rankingSkipped: true, eligibleForAssignment: true }, 11, "bidId"),
      false,
    );
  });

  it("rejects missing/short overrideReason", () => {
    assert.throws(
      () =>
        assertFairOverrideReason(
          "short",
          BID_COLLECTION_ERROR_CODES.ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED,
        ),
      (err) =>
        err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED &&
        err.statusCode === 400,
    );
    assert.ok(FAIR_OVERRIDE_REASON_MIN >= 10);
  });

  it("stores override when valid reason is provided", async () => {
    const calls = [];
    const client = {
      async query(sql, params) {
        calls.push({ sql: String(sql), params });
        return { rows: [{ id: 44 }] };
      },
    };
    const out = await enforceFairSelectionOverride({
      client,
      ranking: rankingTwo,
      selectedCandidateId: 2,
      idKey: "applicationId",
      overrideReason: "The recommended writer is unavailable this week.",
      opportunityType: "mini_bid_article",
      opportunityId: 5,
      collectionRoundId: 9,
      actorUserId: 3,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED,
    });
    assert.equal(out.required, true);
    assert.equal(out.overrideRecorded, true);
    assert.equal(out.overrideId, 44);
    assert.match(calls[0].sql, /INSERT INTO fair_distribution_selection_overrides/);
    assert.equal(calls[0].params[3], 2);
    assert.equal(calls[0].params[4], 1);
  });

  it("rank #1 does not insert an override row", async () => {
    const calls = [];
    const out = await enforceFairSelectionOverride({
      client: {
        async query(sql, params) {
          calls.push({ sql, params });
          return { rows: [] };
        },
      },
      ranking: rankingTwo,
      selectedCandidateId: 1,
      idKey: "applicationId",
      overrideReason: null,
      opportunityType: "mini_bid_article",
      opportunityId: 5,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED,
    });
    assert.equal(out.required, false);
    assert.equal(out.overrideRecorded, false);
    assert.equal(calls.length, 0);
  });

  it("non-#1 without reason throws before insert", async () => {
    let inserted = false;
    await assert.rejects(
      () =>
        enforceFairSelectionOverride({
          client: {
            async query() {
              inserted = true;
              return { rows: [] };
            },
          },
          ranking: rankingTwo,
          selectedCandidateId: 2,
          idKey: "applicationId",
          overrideReason: "",
          opportunityType: "mini_bid_article",
          opportunityId: 5,
          publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED,
        }),
      (err) => err.publicCode === ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED,
    );
    assert.equal(inserted, false);
  });
});

describe("article/pantry selection wiring", () => {
  it("article select still blocks before threshold and wrong round", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceArticleApplicationsService.js"),
      "utf8",
    );
    assert.match(src, /assertArticleSelectionAllowed/);
    assert.match(src, /assertApplicationInCurrentRound/);
    assert.match(src, /enforceFairSelectionOverride/);
    assert.doesNotMatch(src, /auto.?assign/i);
  });

  it("pantry accept still blocks wrong round and skips override for legacy NULL ranking", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.match(src, /assertPantrySelectionAllowed/);
    assert.match(src, /assertPantryBidInCurrentRound/);
    assert.match(src, /enforceFairSelectionOverride/);
  });
});
