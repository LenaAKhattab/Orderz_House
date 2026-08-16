/**
 * Phase 3A Pantry House min required bids — unit tests (no Production DB writes).
 * Run: node --test test/pantryMinRequiredBids.test.js test/pantryMinRequiredBidsMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolvePantryBidCollectionSettings,
  BID_COLLECTION_ERROR_CODES,
  isTruthyAck,
  formatArticleBidProgressLabel,
  isIntakeLockedStatus,
} = require("../src/constants/opportunityBidCollection");
const { validatePantryRequestPayload, canAdminAcceptBid } = require("../src/constants/pantry");
const { resolvePantryRefundMode } = require("../src/constants/pantryMembershipBid");

describe("pantry min required bids — settings", () => {
  it("defaults minimum to 10 and allowed 10/15/20/30 with auto-assign off", () => {
    const cfg = resolvePantryBidCollectionSettings({});
    assert.equal(cfg.minRequiredBids, 10);
    assert.deepEqual(cfg.allowedRequiredBidCounts, [10, 15, 20, 30]);
    assert.equal(cfg.defaultRequiredBidCount, 10);
    assert.equal(cfg.autoAssignWhenThresholdReached, false);
    assert.equal(cfg.refundPolicy, "full_on_minimum_not_met");
  });
});

describe("pantry min required bids — create validation", () => {
  const { loadBackendEnv } = require("../src/config/loadBackendEnv");
  loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
  const collection = require("../src/services/opportunityBidCollectionService");

  it("legacy payload without requiredBidCount is valid", () => {
    const out = validatePantryRequestPayload({
      title: "مقال تسويقي متكرر",
      description: "وصف تفصيلي للطلب الداخلي لا يقل عن عشرة أحرف",
      categoryId: 3,
      pricingType: "fixed",
      fixedBudget: 150,
      deliveryDays: 5,
    });
    assert.equal(out.ok, true);
    assert.equal(out.value.requiredBidCount, null);
  });

  it("rejects requiredBidCount below min via wrapAssert", () => {
    assert.throws(
      () => collection.wrapAssertPantryRequiredBidCount(5, {}),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.PANTRY_REQUIRED_BID_COUNT_INVALID,
    );
  });

  it("create with 10 succeeds wrapAssert", () => {
    assert.equal(collection.wrapAssertPantryRequiredBidCount(10, {}), 10);
  });

  it("create without acknowledgement fails", () => {
    assert.throws(
      () => collection.assertPantryMinRequiredBidsAcknowledged({}, { thresholdMode: true }),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.PANTRY_MIN_REQUIRED_BIDS_ACK_REQUIRED,
    );
  });

  it("create with ack succeeds", () => {
    collection.assertPantryMinRequiredBidsAcknowledged(
      { minRequiredBidsAcknowledged: true },
      { thresholdMode: true },
    );
    assert.equal(isTruthyAck(true), true);
  });

  it("legacy NULL requiredBidCount still allows manual accept status rules", () => {
    assert.equal(canAdminAcceptBid("open_for_bids", "pending"), true);
  });
});

describe("pantry min required bids — collection service", () => {
  const { loadBackendEnv } = require("../src/config/loadBackendEnv");
  loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
  const service = require("../src/services/opportunityBidCollectionService");

  it("skips creating a round when requiredBidCount is null (legacy)", async () => {
    service.clearPantryBidCollectionSchemaCache();
    const out = await service.createInitialPantryRound(1, null, null, {
      client: { query: async () => ({ rows: [] }) },
    });
    assert.equal(out, null);
  });

  it("marks threshold at exact required count and does not auto-assign", async () => {
    const client = {
      async query(sql) {
        if (/UPDATE opportunity_bid_collection_rounds/.test(sql)) {
          return { rows: [{ id: 1, bid_collection_status: "eligible_for_assignment", required_bid_count: 10 }] };
        }
        if (/FROM opportunity_bid_collection_rounds/.test(sql)) {
          return {
            rows: [
              {
                id: 1,
                opportunity_type: "pantry_request",
                opportunity_id: 44,
                required_bid_count: 10,
                bid_collection_status: "collecting",
                auto_close_when_threshold_reached: true,
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
    service.clearPantryBidCollectionSchemaCache();
    const orig = service.pantryBidCollectionSchemaReady;
    service.pantryBidCollectionSchemaReady = async () => true;
    try {
      const out = await service.onPantryBidSubmitted(client, {
        pantryRequestId: 44,
        bidId: 10,
        roundId: 1,
      });
      assert.equal(out.thresholdReached, true);
      assert.equal(out.intakeLocked, true);
      assert.equal(out.autoAssigned, false);
      assert.equal(out.count, 10);
    } finally {
      service.pantryBidCollectionSchemaReady = orig;
    }
  });

  it("bid after threshold returns 409", async () => {
    service.clearPantryBidCollectionSchemaCache();
    await assert.rejects(
      () =>
        service.assertPantryIntakeOpen(
          {
            async query(sql) {
              if (/to_regclass/.test(sql) || /information_schema/.test(sql)) {
                return { rows: [{ rounds: "opportunity_bid_collection_rounds", pantry_col: true }] };
              }
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
          { required_bid_count: 10, current_bid_collection_round_id: 1 },
        ),
      (err) => err.statusCode === 409,
    );
  });

  it("accept before threshold is blocked", async () => {
    service.clearPantryBidCollectionSchemaCache();
    const client = {
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
        service.assertPantrySelectionAllowed(client, {
          required_bid_count: 10,
          current_bid_collection_round_id: 9,
        }),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY,
    );
  });

  it("accept after threshold is allowed", async () => {
    service.clearPantryBidCollectionSchemaCache();
    const client = {
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
    const round = await service.assertPantrySelectionAllowed(client, {
      required_bid_count: 10,
      current_bid_collection_round_id: 9,
    });
    assert.equal(round.bid_collection_status, "eligible_for_assignment");
  });

  it("legacy NULL required_bid_count skips selection guard", async () => {
    const out = await service.assertPantrySelectionAllowed(
      { query: async () => ({ rows: [] }) },
      { required_bid_count: null, current_bid_collection_round_id: null },
    );
    assert.equal(out, null);
  });

  it("minimum_not_met refunds 100% consumed credits and is idempotent on second close", async () => {
    const pantryMembershipBid = require("../src/services/pantryMembershipBidService");
    const origRefund = pantryMembershipBid.refundChargedPantryApplicationsForOutcome;
    let refundCalls = 0;
    pantryMembershipBid.refundChargedPantryApplicationsForOutcome = async ({ outcomeKey }) => {
      refundCalls += 1;
      assert.equal(outcomeKey, "minimum_not_met");
      return { refundedCount: 3, mode: "full" };
    };
    const client = {
      async query(sql) {
        if (/FROM pantry_bids/.test(sql) && /FOR UPDATE/.test(sql)) {
          return { rows: [{ id: 1, status: "pending" }, { id: 2, status: "pending" }, { id: 3, status: "pending" }] };
        }
        if (/bid_collection_status = 'minimum_not_met'/.test(sql)) {
          return { rows: [{ id: 5, bid_collection_status: "minimum_not_met" }] };
        }
        return { rows: [], rowCount: 3 };
      },
    };
    try {
      const out = await service.closePantryRoundMinimumNotMet(client, {
        id: 5,
        opportunity_id: 77,
        opportunity_type: "pantry_request",
        required_bid_count: 10,
        bid_collection_status: "collecting",
      });
      assert.equal(out.skipped, false);
      assert.equal(out.status, "minimum_not_met");
      assert.equal(out.refundedCount, 3);
      assert.equal(refundCalls, 1);

      const again = await service.closePantryRoundMinimumNotMet(client, {
        id: 5,
        opportunity_id: 77,
        required_bid_count: 10,
        bid_collection_status: "minimum_not_met",
      });
      assert.equal(again.skipped, true);
      assert.equal(refundCalls, 1);
    } finally {
      pantryMembershipBid.refundChargedPantryApplicationsForOutcome = origRefund;
    }
  });

  it("formats Arabic progress and lock statuses", () => {
    assert.equal(formatArticleBidProgressLabel({ current: 7, required: 10 }), "7 من 10 متقدمين مطلوبين");
    assert.equal(isIntakeLockedStatus("eligible_for_assignment"), true);
    assert.equal(resolvePantryRefundMode("minimum_not_met"), "full");
  });
});

describe("pantry min required bids — no Stripe / ordersService", () => {
  it("collection and pantry services do not import Stripe or ordersService", () => {
    const files = [
      "../src/services/opportunityBidCollectionService.js",
      "../src/services/pantryService.js",
      "../src/services/pantryMembershipBidService.js",
      "../src/constants/opportunityBidCollection.js",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
      assert.doesNotMatch(src, /require\(["']stripe["']\)/);
      assert.doesNotMatch(src, /require\(["'].*ordersService["']\)/);
    }
  });
});
