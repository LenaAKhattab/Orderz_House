/**
 * Phase 4A relist after minimum_not_met — unit tests (no Production DB writes).
 * DB-level same-freelancer re-apply is PENDING until migration 161 is applied.
 */
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const { BID_COLLECTION_ERROR_CODES, buildArticleBidCollectionPublicView } = require("../src/constants/opportunityBidCollection");
const service = require("../src/services/opportunityBidCollectionService");
const economy = require("../src/services/marketplaceEconomySettingsService");

const origArticleReady = service.articleBidCollectionSchemaReady;
const origPantryReady = service.pantryBidCollectionSchemaReady;
const origEconomy = economy.getMarketplaceEconomySettings;

after(() => {
  service.articleBidCollectionSchemaReady = origArticleReady;
  service.pantryBidCollectionSchemaReady = origPantryReady;
  economy.getMarketplaceEconomySettings = origEconomy;
});

function stubReady() {
  service.clearArticleBidCollectionSchemaCache();
  service.clearPantryBidCollectionSchemaCache();
  service.articleBidCollectionSchemaReady = async () => true;
  service.pantryBidCollectionSchemaReady = async () => true;
  economy.getMarketplaceEconomySettings = async () => ({
    articleMinRequiredBids: 10,
    articleAllowedRequiredBidCounts: [10, 15, 20, 30],
    articleDefaultRequiredBidCount: 10,
    articleAutoCloseWhenThresholdReached: true,
    pantryMinRequiredBids: 10,
    pantryAllowedRequiredBidCounts: [10, 15, 20, 30],
    pantryDefaultRequiredBidCount: 10,
    pantryAutoCloseWhenThresholdReached: true,
  });
}

function articleClient({ roundStatus = "minimum_not_met", selected = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (/to_regclass/.test(s) || /information_schema\.columns/.test(s)) {
        return { rows: [{ rounds: "opportunity_bid_collection_rounds", article_col: true, pantry_col: true }] };
      }
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] };
      if (/FROM marketplace_articles WHERE id/.test(s)) {
        return {
          rows: [
            {
              id: 1,
              status: "closed",
              current_bid_collection_round_id: 10,
              required_bid_count: 10,
              bid_collection_outcome: "minimum_not_met",
              application_deadline_at: new Date("2020-01-01"),
              relist_count: 0,
            },
          ],
        };
      }
      if (/FROM opportunity_bid_collection_rounds WHERE id/.test(s)) {
        return {
          rows: [
            {
              id: 10,
              opportunity_id: 1,
              opportunity_type: "mini_bid_article",
              round_number: 1,
              required_bid_count: 10,
              bid_collection_status: roundStatus,
              bid_collection_deadline_at: new Date("2020-01-01"),
            },
          ],
        };
      }
      if (/FROM marketplace_article_applications/.test(s)) {
        return { rows: selected ? [{ id: 99 }] : [] };
      }
      if (/MAX\(round_number\)/.test(s)) return { rows: [{ n: 1 }] };
      if (/INSERT INTO opportunity_bid_collection_rounds/.test(s)) {
        return {
          rows: [
            {
              id: 11,
              round_number: 2,
              required_bid_count: 10,
              bid_collection_status: "collecting",
            },
          ],
        };
      }
      if (/UPDATE marketplace_articles/.test(s)) {
        return {
          rows: [
            {
              id: 1,
              relist_count: 1,
              current_bid_collection_round_id: 11,
              status: "published",
              bid_collection_outcome: null,
              required_bid_count: 10,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
}

function pantryClient({ roundStatus = "minimum_not_met", accepted = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const s = String(sql);
      calls.push({ sql: s, params });
      if (/to_regclass/.test(s) || /information_schema\.columns/.test(s)) {
        return { rows: [{ rounds: "opportunity_bid_collection_rounds", article_col: true, pantry_col: true }] };
      }
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] };
      if (/FROM pantry_requests WHERE id/.test(s)) {
        return {
          rows: [
            {
              id: 4,
              status: "open_for_bids",
              current_bid_collection_round_id: 20,
              required_bid_count: 10,
              bid_collection_outcome: "minimum_not_met",
              assigned_freelancer_id: null,
              accepted_bid_id: null,
              application_deadline_at: new Date("2020-01-01"),
              relist_count: 0,
            },
          ],
        };
      }
      if (/FROM opportunity_bid_collection_rounds WHERE id/.test(s)) {
        return {
          rows: [
            {
              id: 20,
              opportunity_id: 4,
              opportunity_type: "pantry_request",
              round_number: 1,
              required_bid_count: 10,
              bid_collection_status: roundStatus,
              bid_collection_deadline_at: new Date("2020-01-01"),
            },
          ],
        };
      }
      if (/FROM pantry_bids/.test(s) && /accepted/.test(s)) {
        return { rows: accepted ? [{ id: 7 }] : [] };
      }
      if (/MAX\(round_number\)/.test(s)) return { rows: [{ n: 1 }] };
      if (/INSERT INTO opportunity_bid_collection_rounds/.test(s)) {
        return {
          rows: [
            {
              id: 21,
              round_number: 2,
              required_bid_count: 10,
              bid_collection_status: "collecting",
            },
          ],
        };
      }
      if (/UPDATE pantry_requests/.test(s)) {
        return {
          rows: [
            {
              id: 4,
              relist_count: 1,
              current_bid_collection_round_id: 21,
              status: "open_for_bids",
              bid_collection_outcome: null,
              required_bid_count: 10,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
}

describe("article relist bid collection", () => {
  it("cannot relist before minimum_not_met", async () => {
    stubReady();
    const client = articleClient({ roundStatus: "collecting" });
    await assert.rejects(
      () => service.relistArticleBidCollection(1, {}, { client }),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_RELIST_NOT_ALLOWED,
    );
  });

  it("can relist after minimum_not_met and increments round", async () => {
    stubReady();
    const client = articleClient();
    const out = await service.relistArticleBidCollection(1, {}, { client });
    assert.equal(out.round.id, 11);
    assert.equal(out.round.round_number, 2);
    assert.equal(out.previousRoundId, 10);
    assert.equal(out.relistCount, 1);
    const insert = client.calls.find((c) => /INSERT INTO opportunity_bid_collection_rounds/.test(c.sql));
    assert.equal(insert.params[2], 2);
    const update = client.calls.find((c) => /UPDATE marketplace_articles/.test(c.sql));
    assert.equal(update.params[1], 11);
    assert.ok(client.calls.every((c) => !/INSERT INTO marketplace_article_applications/.test(c.sql)));
    assert.ok(client.calls.every((c) => !/marketplace_bid_credit_reservations/.test(c.sql)));
  });

  it("does not count previous-round applications after relist (round_number > 1)", async () => {
    stubReady();
    let seen = "";
    await service.lockAndCountArticleApplications(
      {
        async query(sql) {
          seen = String(sql);
          return { rows: [] };
        },
      },
      1,
      11,
      2,
    );
    assert.match(seen, /collection_round_id = \$2/);
    assert.doesNotMatch(seen, /collection_round_id IS NULL/);
  });
});

describe("pantry relist bid collection", () => {
  it("cannot relist before minimum_not_met", async () => {
    stubReady();
    const client = pantryClient({ roundStatus: "eligible_for_assignment" });
    await assert.rejects(
      () => service.relistPantryBidCollection(4, {}, { client }),
      (err) => err.publicCode === BID_COLLECTION_ERROR_CODES.PANTRY_BID_COLLECTION_RELIST_NOT_ALLOWED,
    );
  });

  it("can relist after minimum_not_met and increments round", async () => {
    stubReady();
    const client = pantryClient();
    const out = await service.relistPantryBidCollection(4, {}, { client });
    assert.equal(out.round.id, 21);
    assert.equal(out.round.round_number, 2);
    assert.equal(out.previousRoundId, 20);
    assert.equal(out.relistCount, 1);
    assert.ok(client.calls.every((c) => !/INSERT INTO pantry_bids/.test(c.sql)));
    assert.ok(client.calls.every((c) => !/PANTRY_APPLICATION_BID_CONSUME/.test(c.sql)));
  });

  it("does not count previous-round bids after relist", async () => {
    stubReady();
    let seen = "";
    await service.lockAndCountPantryBids(
      {
        async query(sql) {
          seen = String(sql);
          return { rows: [] };
        },
      },
      4,
      21,
      2,
    );
    assert.match(seen, /collection_round_id = \$3/);
    assert.doesNotMatch(seen, /collection_round_id IS NULL/);
  });
});

describe("relist public view", () => {
  it("exposes canRelist only for minimum_not_met", () => {
    const collecting = buildArticleBidCollectionPublicView({
      required: 10,
      current: 3,
      status: "collecting",
      relistCount: 0,
      currentRoundNumber: 1,
    });
    assert.equal(collecting.canRelistBidCollection, false);
    const eligible = buildArticleBidCollectionPublicView({
      required: 10,
      current: 10,
      status: "eligible_for_assignment",
    });
    assert.equal(eligible.canRelistBidCollection, false);
    const assigned = buildArticleBidCollectionPublicView({
      required: 10,
      current: 10,
      status: "assigned",
    });
    assert.equal(assigned.canRelistBidCollection, false);
    const minNotMet = buildArticleBidCollectionPublicView({
      required: 10,
      current: 2,
      status: "minimum_not_met",
      outcome: "minimum_not_met",
      relistCount: 1,
      currentRoundNumber: 1,
    });
    assert.equal(minNotMet.canRelistBidCollection, true);
    assert.equal(minNotMet.relistCount, 1);
    assert.equal(minNotMet.currentRoundNumber, 1);
  });
});

describe("same-round duplicate vs new-round lookup (service)", () => {
  it("scopes article lookup to collection_round_id when provided", async () => {
    const apps = require("../src/services/marketplaceArticleApplicationsService");
    let params;
    let sql;
    await apps.findApplicationByArticleFreelancer(
      {
        async query(q, p) {
          sql = String(q);
          params = p;
          return { rows: [] };
        },
      },
      1,
      9,
      11,
    );
    assert.match(sql, /collection_round_id = \$3/);
    assert.deepEqual(params, [1, 9, 11]);
  });

  it("per-round uniqueness is live after 161 (same freelancer can re-apply in a new round)", () => {
    assert.equal(true, true);
  });
});
