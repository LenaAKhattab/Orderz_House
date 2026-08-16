/**
 * Phase 1 Mini Bid Article min required bids — unit tests (no Production DB writes).
 * Run: node --test test/articleMinRequiredBids.test.js test/articleMinRequiredBidsMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertRequiredBidCount,
  resolveArticleBidCollectionSettings,
  formatArticleBidProgressLabel,
  isIntakeLockedStatus,
  isTruthyAck,
  BID_COLLECTION_ERROR_CODES,
  ARTICLE_MIN_REQUIRED_BIDS_DEFAULT,
  ARTICLE_THRESHOLD_REACHED_MESSAGE_AR,
} = require("../src/constants/opportunityBidCollection");

describe("article min required bids — settings", () => {
  it("defaults minimum to 10 and allowed 10/15/20/30", () => {
    const cfg = resolveArticleBidCollectionSettings({});
    assert.equal(cfg.minRequiredBids, ARTICLE_MIN_REQUIRED_BIDS_DEFAULT);
    assert.deepEqual(cfg.allowedRequiredBidCounts, [10, 15, 20, 30]);
    assert.equal(cfg.defaultRequiredBidCount, 10);
    assert.equal(cfg.autoAssignWhenThresholdReached, false);
    assert.equal(cfg.refundPolicy, "full_on_minimum_not_met");
  });

  it("rejects requiredBidCount 5", () => {
    assert.throws(
      () => assertRequiredBidCount(5, {}),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_REQUIRED_BID_COUNT_INVALID,
    );
  });

  it("allows 10/15/20/30", () => {
    for (const n of [10, 15, 20, 30]) {
      assert.equal(assertRequiredBidCount(n, {}), n);
    }
  });

  it("rejects values not in allowed list", () => {
    assert.throws(() => assertRequiredBidCount(12, {}));
  });
});

describe("article min required bids — acknowledgement", () => {
  it("treats only explicit true as ack", () => {
    assert.equal(isTruthyAck(true), true);
    assert.equal(isTruthyAck("true"), true);
    assert.equal(isTruthyAck(false), false);
    assert.equal(isTruthyAck(undefined), false);
    assert.equal(isTruthyAck(""), false);
  });
});

describe("article min required bids — progress and lock", () => {
  it("formats Arabic progress", () => {
    assert.equal(formatArticleBidProgressLabel({ current: 7, required: 10 }), "7 من 10 متقدمين مطلوبين");
  });

  it("formats threshold waiting / minimum_not_met / closed copy", () => {
    const {
      resolveArticleBidCollectionLabel,
      buildArticleBidCollectionPublicView,
      ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR,
      ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR,
      ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR,
    } = require("../src/constants/opportunityBidCollection");
    assert.equal(
      resolveArticleBidCollectionLabel({
        current: 10,
        required: 10,
        status: "eligible_for_assignment",
      }),
      ARTICLE_THRESHOLD_WAITING_ASSIGNMENT_AR,
    );
    assert.equal(
      resolveArticleBidCollectionLabel({
        current: 3,
        required: 10,
        status: "minimum_not_met",
      }),
      ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR,
    );
    assert.equal(
      resolveArticleBidCollectionLabel({
        current: 10,
        required: 10,
        status: "eligible_for_assignment",
        articleStatus: "closed",
      }),
      ARTICLE_THRESHOLD_CLOSED_MESSAGE_AR,
    );
    const view = buildArticleBidCollectionPublicView({
      required: 10,
      current: 7,
      status: "collecting",
      outcome: null,
      deadline: null,
    });
    assert.equal(view.requiredBidCount, 10);
    assert.equal(view.currentBidCount, 7);
    assert.equal(view.bidCollectionStatus, "collecting");
    assert.equal(view.canApply, true);
    assert.equal(view.canRelistBidCollection, false);
    assert.equal(view.thresholdReached, false);
    assert.equal(view.label, "7 من 10 متقدمين مطلوبين");
  });

  it("locks intake after threshold / eligible / min not met", () => {
    assert.equal(isIntakeLockedStatus("collecting"), false);
    assert.equal(isIntakeLockedStatus("threshold_reached"), true);
    assert.equal(isIntakeLockedStatus("eligible_for_assignment"), true);
    assert.equal(isIntakeLockedStatus("minimum_not_met"), true);
  });

  it("exposes Arabic 409 copy for threshold", () => {
    assert.match(ARTICLE_THRESHOLD_REACHED_MESSAGE_AR, /اكتمل العدد المطلوب/);
  });
});

describe("article min required bids — collection service helpers", () => {
  const { loadBackendEnv } = require("../src/config/loadBackendEnv");
  loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
  const service = require("../src/services/opportunityBidCollectionService");

  it("marks threshold when count reaches required and autoClose", async () => {
    const queries = [];
    const client = {
      async query(sql, params) {
        queries.push({ sql: String(sql), params });
        if (/UPDATE opportunity_bid_collection_rounds/.test(sql)) {
          return {
            rows: [
              {
                id: 1,
                bid_collection_status: "eligible_for_assignment",
                required_bid_count: 10,
              },
            ],
          };
        }
        if (/FROM opportunity_bid_collection_rounds/.test(sql)) {
          return {
            rows: [
              {
                id: 1,
                opportunity_type: "mini_bid_article",
                opportunity_id: 99,
                required_bid_count: 10,
                bid_collection_status: "collecting",
                auto_close_when_threshold_reached: true,
              },
            ],
          };
        }
        if (/UPDATE marketplace_articles/.test(sql)) return { rows: [] };
        if (/marketplace_article_applications/.test(sql)) {
          return {
            rows: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, status: "pending" })),
          };
        }
        return { rows: [] };
      },
    };
    const round = {
      id: 1,
      opportunity_type: "mini_bid_article",
      opportunity_id: 99,
      required_bid_count: 10,
      bid_collection_status: "collecting",
      auto_close_when_threshold_reached: true,
    };
    service.clearArticleBidCollectionSchemaCache();
    const orig = service.articleBidCollectionSchemaReady;
    service.articleBidCollectionSchemaReady = async () => true;
    try {
      const out = await service.onArticleApplicationSubmitted(client, {
        articleId: 99,
        applicationId: 10,
        roundId: 1,
      });
      assert.equal(out.thresholdReached, true);
      assert.equal(out.intakeLocked, true);
      assert.equal(out.autoAssigned, false);
      assert.equal(out.count, 10);
    } finally {
      service.articleBidCollectionSchemaReady = orig;
    }
  });

  it("releases reservations and stamps minimum_not_met under threshold at deadline", async () => {
    const released = [];
    const reservationService = require("../src/services/marketplaceBidCreditReservationService");
    const origRelease = reservationService.releaseBidCreditReservation;
    reservationService.releaseBidCreditReservation = async ({ reservationId }) => {
      released.push(reservationId);
      return { released: true };
    };
    const client = {
      async query(sql) {
        if (/FROM marketplace_article_applications/.test(sql)) {
          return {
            rows: [
              { id: 1, status: "pending", bid_reservation_id: 11 },
              { id: 2, status: "pending", bid_reservation_id: 12 },
            ],
          };
        }
        if (/bid_collection_status = 'minimum_not_met'/.test(sql)) {
          return { rows: [{ id: 5, bid_collection_status: "minimum_not_met" }] };
        }
        return { rows: [], rowCount: 2 };
      },
    };
    try {
      const out = await service.closeArticleRoundMinimumNotMet(client, {
        id: 5,
        opportunity_id: 77,
        opportunity_type: "mini_bid_article",
        required_bid_count: 10,
        bid_collection_status: "collecting",
      });
      assert.equal(out.skipped, false);
      assert.equal(out.status, "minimum_not_met");
      assert.equal(out.count, 2);
      assert.deepEqual(released, [11, 12]);
    } finally {
      reservationService.releaseBidCreditReservation = origRelease;
    }
  });

  it("does not assign anyone on minimum_not_met", async () => {
    const client = {
      async query(sql) {
        if (/FROM marketplace_article_applications/.test(sql)) {
          return { rows: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, status: "pending" })) };
        }
        if (/minimum_not_met/.test(sql)) {
          return { rows: [{ id: 1, bid_collection_status: "minimum_not_met" }] };
        }
        return { rows: [] };
      },
    };
    const reservationService = require("../src/services/marketplaceBidCreditReservationService");
    const origRelease = reservationService.releaseBidCreditReservation;
    reservationService.releaseBidCreditReservation = async () => ({ released: true });
    try {
      const out = await service.closeArticleRoundMinimumNotMet(client, {
        id: 1,
        opportunity_id: 1,
        required_bid_count: 10,
        bid_collection_status: "collecting",
      });
      assert.equal(out.status, "minimum_not_met");
      assert.notEqual(out.status, "assigned");
    } finally {
      reservationService.releaseBidCreditReservation = origRelease;
    }
  });

  it("skips creating a round when requiredBidCount is null (legacy)", async () => {
    service.articleBidCollectionSchemaReady = async () => true;
    const out = await service.createInitialArticleRound(1, null, null, {
      client: { query: async () => ({ rows: [] }) },
    });
    assert.equal(out, null);
  });

  it("rejects apply after threshold and after deadline", async () => {
    service.clearArticleBidCollectionSchemaCache();
    const schemaRow = { rounds: "opportunity_bid_collection_rounds", article_col: true };
    await assert.rejects(
      () =>
        service.assertArticleIntakeOpen(
          {
            async query(sql) {
              if (/to_regclass/.test(sql)) return { rows: [schemaRow] };
              return {
                rows: [
                  {
                    id: 1,
                    bid_collection_status: "eligible_for_assignment",
                    auto_close_when_threshold_reached: true,
                  },
                ],
              };
            },
          },
          { current_bid_collection_round_id: 1 },
        ),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_THRESHOLD_REACHED,
    );
    service.clearArticleBidCollectionSchemaCache();
    await assert.rejects(
      () =>
        service.assertArticleIntakeOpen(
          {
            async query(sql) {
              if (/to_regclass/.test(sql)) return { rows: [schemaRow] };
              return {
                rows: [
                  {
                    id: 1,
                    bid_collection_status: "collecting",
                    bid_collection_deadline_at: new Date(Date.now() - 1000).toISOString(),
                    auto_close_when_threshold_reached: true,
                  },
                ],
              };
            },
          },
          { current_bid_collection_round_id: 1 },
        ),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_DEADLINE_PASSED,
    );
  });

  it("blocks Super Admin selection before threshold", async () => {
    service.clearArticleBidCollectionSchemaCache();
    const client = {
      async query(sql) {
        if (/to_regclass/.test(sql)) {
          return { rows: [{ rounds: "opportunity_bid_collection_rounds", article_col: true }] };
        }
        if (/FROM opportunity_bid_collection_rounds/.test(sql)) {
          return {
            rows: [
              {
                id: 9,
                opportunity_id: 3,
                required_bid_count: 10,
                bid_collection_status: "collecting",
              },
            ],
          };
        }
        if (/marketplace_article_applications/.test(sql)) {
          return { rows: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, status: "pending" })) };
        }
        return { rows: [] };
      },
    };
    await assert.rejects(
      () =>
        service.assertArticleSelectionAllowed(client, {
          required_bid_count: 10,
          current_bid_collection_round_id: 9,
        }),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY,
    );
  });

  it("allows Super Admin selection when eligible_for_assignment", async () => {
    service.clearArticleBidCollectionSchemaCache();
    const client = {
      async query(sql) {
        if (/to_regclass/.test(sql)) {
          return { rows: [{ rounds: "opportunity_bid_collection_rounds", article_col: true }] };
        }
        if (/FROM opportunity_bid_collection_rounds/.test(sql)) {
          return {
            rows: [
              {
                id: 9,
                opportunity_id: 3,
                required_bid_count: 10,
                bid_collection_status: "eligible_for_assignment",
              },
            ],
          };
        }
        if (/marketplace_article_applications/.test(sql)) {
          return { rows: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, status: "pending" })) };
        }
        return { rows: [] };
      },
    };
    const round = await service.assertArticleSelectionAllowed(client, {
      required_bid_count: 10,
      current_bid_collection_round_id: 9,
    });
    assert.equal(round.bid_collection_status, "eligible_for_assignment");
  });

  it("closeExpired SQL targets current article rounds only", async () => {
    service.clearArticleBidCollectionSchemaCache();
    let seen = "";
    const client = {
      async query(sql) {
        seen += String(sql);
        if (/to_regclass/.test(sql)) {
          return { rows: [{ rounds: "opportunity_bid_collection_rounds", article_col: true }] };
        }
        return { rows: [] };
      },
    };
    await service.closeExpiredArticleBidCollections({ client, limit: 5 });
    assert.match(seen, /current_bid_collection_round_id/);
    assert.match(seen, /FOR UPDATE OF a, r SKIP LOCKED/);
  });

  it("does not import Stripe or ordersService", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/opportunityBidCollectionService.js"),
      "utf8",
    );
    assert.equal(/require\(["'][^"']*stripe/i.test(src), false);
    assert.equal(/require\(["'][^"']*ordersService/.test(src), false);
    const articles = fs.readFileSync(
      path.join(__dirname, "../src/services/marketplaceArticlesService.js"),
      "utf8",
    );
    assert.equal(/require\(["'][^"']*stripe/i.test(articles), false);
    assert.equal(/require\(["'][^"']*ordersService/.test(articles), false);
  });
});
