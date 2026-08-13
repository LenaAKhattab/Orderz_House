/**
 * Phase B4 — Priority Application Boost (ACTIVE_NEW_PRIORITY_MODEL).
 * Static + pure assertions. No Production mutations. Does NOT apply migration 148.
 *
 * Run: npm run test:marketplace-priority-application-boost-phase-b4
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_priority_application_boost_b4_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  NORMAL_APPLICATION_BID_COST,
  PRIORITY_BOOST_ADDITIONAL_BID_COST,
  PRIORITY_BOOST_USE_COST,
  PRIORITY_BOOST_WORK_TOKEN_COST,
  PRIORITY_AUTOMATIC_ASSIGNMENT,
  ACTIVE_PRIORITY_WORK_TOKEN_RUNTIME,
  LEGACY_PRIORITY_AUCTION_ENGINE,
  LEGACY_PRIORITY_AUCTION_SCHEMA_DELETION,
  PRIORITY_BOOST_HISTORICAL_BACKFILL,
  PRIORITY_APPLICATION_BOOST_ENGINE_STATE_WHEN_FLAG_OFF,
  FAIR_PRIORITY_TOKEN_TIEBREAK_NEW_PATH,
  PRIORITY_APPLICATION_BOOST_ERROR_CODES,
  buildPriorityApplicationBoostIdempotencyKey,
  sortBidsForPriorityDisplay,
  compareBidsForPriorityDisplay,
} = require("../src/constants/marketplacePriorityApplicationBoost");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase B4 product constants", () => {
  it("1–4: normal=1 Bid; Priority=+0 Bid, +1 Use, +0 WT", () => {
    assert.strictEqual(NORMAL_APPLICATION_BID_COST, 1);
    assert.strictEqual(PRIORITY_BOOST_ADDITIONAL_BID_COST, 0);
    assert.strictEqual(PRIORITY_BOOST_USE_COST, 1);
    assert.strictEqual(PRIORITY_BOOST_WORK_TOKEN_COST, 0);
  });

  it("13–15 + legacy: no auto-assign; no active WT; auction deprecated; deletion deferred; no backfill; engine dormant when off", () => {
    assert.strictEqual(PRIORITY_AUTOMATIC_ASSIGNMENT, "REMOVED_FROM_ACTIVE_PRODUCT");
    assert.strictEqual(ACTIVE_PRIORITY_WORK_TOKEN_RUNTIME, "NONE");
    assert.strictEqual(LEGACY_PRIORITY_AUCTION_ENGINE, "DEPRECATED");
    assert.strictEqual(LEGACY_PRIORITY_AUCTION_SCHEMA_DELETION, "DEFERRED");
    assert.strictEqual(PRIORITY_BOOST_HISTORICAL_BACKFILL, "NONE");
    assert.strictEqual(PRIORITY_APPLICATION_BOOST_ENGINE_STATE_WHEN_FLAG_OFF, "DORMANT");
    assert.strictEqual(FAIR_PRIORITY_TOKEN_TIEBREAK_NEW_PATH, "NOT_USED");
  });

  it("7–10: deterministic idempotency key; error codes present", () => {
    assert.strictEqual(
      buildPriorityApplicationBoostIdempotencyKey(10, 3),
      "priority_application_boost:order:10:freelancer:3",
    );
    assert.strictEqual(
      PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_ENGINE_OFF,
      "PRIORITY_APPLICATION_BOOST_ENGINE_OFF",
    );
    assert.strictEqual(
      PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_USES_EXHAUSTED,
      "PRIORITY_APPLICATION_BOOST_USES_EXHAUSTED",
    );
  });
});

describe("Phase B4 proposal ordering", () => {
  it("11–12: Priority before normal; Priority by submitted_at ASC, id ASC; normals by amount", () => {
    const bids = [
      { id: 4, amount: 20, createdAt: "2026-01-02T00:00:00Z", isPriority: false },
      { id: 2, amount: 50, createdAt: "2026-01-01T12:00:00Z", isPriority: true },
      { id: 1, amount: 80, createdAt: "2026-01-01T10:00:00Z", isPriority: true },
      { id: 3, amount: 10, createdAt: "2026-01-03T00:00:00Z", isPriority: false },
    ];
    const sorted = sortBidsForPriorityDisplay(bids);
    assert.deepStrictEqual(
      sorted.map((b) => b.id),
      [1, 2, 3, 4],
    );
    assert.ok(compareBidsForPriorityDisplay(bids[1], bids[0]) < 0);
  });

  it("does not rank by Bid balance / membership / tokens", () => {
    const src = read("src/constants/marketplacePriorityApplicationBoost.js");
    assert.doesNotMatch(src, /tokenAmount|priorityBidTokens|highest.*bid.*win/i);
    assert.match(src, /submitted_at ASC|created_at ASC|createdAt/);
  });
});

describe("Phase B4 migration 148 authored (not applied)", () => {
  const sqlPath = path.join(root, "sql", "migrations", "148_priority_application_boost.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  it("creates boost table + flag; does not enable engines; does not DROP auction tables; no backfill", () => {
    assert.match(sql, /priority_application_boost_enabled/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS order_freelancer_priority_application_boosts/);
    assert.match(sql, /additional_bid_credit_cost INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /work_token_cost INTEGER NOT NULL DEFAULT 0/);
    assert.match(sql, /priority_use_cost INTEGER NOT NULL DEFAULT 1/);
    assert.doesNotMatch(sql, /priority_application_boost_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /DROP TABLE.*priority_bid_auctions/i);
    assert.doesNotMatch(sql, /DROP TABLE.*priority_auction_bids/i);
    assert.doesNotMatch(sql, /INSERT INTO order_freelancer_priority_application_boosts/i);
    assert.match(sql, /148_priority_application_boost/);
  });

  it("25: no historical auction→boost conversion", () => {
    assert.doesNotMatch(sql, /FROM priority_auction_bids/i);
    assert.doesNotMatch(sql, /FROM priority_bid_auctions/i);
  });
});

describe("Phase B4 service wiring + isolation", () => {
  it("5–6,9: unavailable Priority / engine OFF fail closed; service gates engine", () => {
    const svc = read("src/services/marketplacePriorityApplicationBoostService.js");
    assert.match(svc, /isPriorityApplicationBoostEngineActive/);
    assert.match(svc, /PRIORITY_APPLICATION_BOOST_ENGINE_OFF/);
    assert.match(svc, /PRIORITY_APPLICATION_BOOST_USES_EXHAUSTED/);
    assert.match(svc, /applyPriorityApplicationBoost/);
    assert.match(svc, /upgradeExistingApplicationToPriority/);
    assert.match(svc, /returnPriorityBoostsForOrderEndedWithoutSelection/);
    assert.doesNotMatch(svc, /PRIORITY_BID_RESERVE|reserveTokens|work_token_reservations/);
    assert.doesNotMatch(svc, /assignFreelancer|HIGHEST_TOKEN_ONLY/);
    assert.match(svc, /PRIORITY_APPLICATION_BOOST_LEGACY_AUCTION_CONFLICT/);
    assert.match(svc, /assertOrderOpenForPriorityBoost/);
    assert.match(svc, /Does NOT auto-assign/);
  });

  it("16–18: fake/fixed/Elite/Article excluded", () => {
    const svc = read("src/services/marketplacePriorityApplicationBoostService.js");
    assert.match(svc, /PRIORITY_APPLICATION_BOOST_FAKE_FORBIDDEN/);
    assert.match(svc, /PRIORITY_APPLICATION_BOOST_FIXED_TAKE_FORBIDDEN/);
    assert.match(svc, /PRIORITY_APPLICATION_BOOST_ELITE_FORBIDDEN/);
    assert.match(svc, /PRIORITY_APPLICATION_BOOST_ARTICLE_FORBIDDEN/);
  });

  it("submit path wires usePriority atomically with Bid charge", () => {
    const orders = read("src/services/ordersService.js");
    assert.match(orders, /usePriority/);
    assert.match(orders, /applyPriorityApplicationBoost/);
    assert.match(orders, /chargeNormalApplicationBidCreditOnFirstBid/);
    assert.match(orders, /is_priority/);
    assert.match(orders, /order_freelancer_priority_application_boosts/);
  });

  it("14,20–23: no-selection returns Priority Use; cancel path wired; no Bid Credit refund for Priority Use", () => {
    const cancel = read("src/services/marketplaceNormalApplicationWorkTokenService.js");
    assert.match(cancel, /returnPriorityBoostsForOrderEndedWithoutSelection/);
    const svc = read("src/services/marketplacePriorityApplicationBoostService.js");
    assert.match(svc, /returnPriorityBidUse/);
    assert.doesNotMatch(svc, /refundChargedBidApplications|NORMAL_APPLICATION_BID_REFUND/);
  });

  it("10,15: separate flag; legacy auction not deleted; Fair token tiebreak unused on new path", () => {
    const economy = read("src/services/marketplaceEconomySettingsService.js");
    assert.match(economy, /priorityApplicationBoostEnabled/);
    assert.match(economy, /isPriorityApplicationBoostEngineActive/);
    assert.match(economy, /priority_application_boost_enabled/);
    const auction = read("src/services/marketplacePriorityAuctionService.js");
    assert.match(auction, /LEGACY_DEPRECATED/);
    const fair = read("src/constants/marketplacePriorityApplicationBoost.js");
    assert.match(fair, /FAIR_PRIORITY_TOKEN_TIEBREAK_NEW_PATH/);
  });

  it("upgrade route + controller + validator present", () => {
    assert.match(read("src/routes/ordersRoutes.js"), /bids\/priority-boost/);
    assert.match(read("src/controllers/ordersController.js"), /upgradePoolOrderBidPriority/);
    assert.match(read("src/validators/ordersValidators.js"), /usePriority/);
  });

  it("Client sanitize exposes isPriority; Freelancer UX copy separates Bid vs Priority Use", () => {
    assert.match(read("src/utils/orderViewerSanitize.js"), /isPriority/);
    const ar = read("../frontend/src/locales/ar/orders.json");
    const en = read("../frontend/src/locales/en/orders.json");
    assert.match(ar, /عرض واحد \+ استخدام أولوية واحد/);
    assert.match(en, /1 Bid \+ 1 Priority Use/);
    assert.match(en, /not 2 Bids/);
    assert.match(read("../frontend/src/components/orders/BidAmountModal.jsx"), /priorityBoostAvailable/);
    assert.match(read("../frontend/src/components/orders/ClientBiddingOffersModal.jsx"), /isPriority/);
  });

  it("Admin plan UI keeps Bids/month separate from Priority Uses/cycle", () => {
    const form = read("../frontend/src/admin/marketplaceMembership/MarketplaceMembershipPlanFormModal.jsx");
    assert.match(form, /monthlyBidAllowance/);
    assert.match(form, /priorityBidUsesPerCycle/);
    assert.match(form, /separate from Bids|منفصلة عن العروض/);
  });
});

describe("Phase B4 concurrency / idempotency intent", () => {
  it("7–10,26: UNIQUE order+freelancer + deterministic key + consume idempotency", () => {
    const sql = read("sql/migrations/148_priority_application_boost.sql");
    assert.match(sql, /UNIQUE \(order_id, freelancer_user_id\)/);
    assert.match(sql, /UNIQUE \(idempotency_key\)/);
    const svc = read("src/services/marketplacePriorityApplicationBoostService.js");
    assert.match(svc, /idempotent: true/);
    assert.match(svc, /23505/);
    assert.match(svc, /consumePriorityBidUse/);
  });
});
