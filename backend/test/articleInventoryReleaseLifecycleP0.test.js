/**
 * Phase Article-P0/P1 — inventory release bid round, per-article visibility duration,
 * minimum_not_met restore, duplicate published guard, auto-assign readiness.
 *
 * Run: node --test test/articleInventoryReleaseLifecycleP0.test.js
 * No Production DB writes.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/article_inventory_lifecycle_p0_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const collection = require("../src/services/opportunityBidCollectionService");
const articleOps = require("../src/services/freelancerActivationArticleOpsService");
const autoAssign = require("../src/services/freelancerActivationAutoAssignmentService");
const {
  normalizeVisibilityDurationHours,
  parseVisibilityDurationHoursOrThrow,
  VISIBILITY_DURATION_HOURS_DEFAULT,
} = require("../src/constants/freelancerActivationArticleOps");
const { createAppError } = require("../src/utils/AppError");

describe("Article-P1 per-article visibility duration deadline", () => {
  it("deadline uses visibility hours, not release_interval_days", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const d6 = collection.resolveInventoryReleaseBidCollectionDeadline({
      visibilityDurationHours: 6,
      now,
    });
    assert.equal(d6, "2026-08-24T18:00:00.000Z");
    const notTwoDays = new Date(now.getTime() + 2 * 86400000).toISOString();
    assert.notEqual(d6, notTwoDays);
  });

  it("different articles can have different visibility durations", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const a = collection.resolveInventoryReleaseBidCollectionDeadline({
      visibilityDurationHours: 6,
      now,
    });
    const b = collection.resolveInventoryReleaseBidCollectionDeadline({
      visibilityDurationHours: 48,
      now,
    });
    assert.equal(a, "2026-08-24T18:00:00.000Z");
    assert.equal(b, "2026-08-26T12:00:00.000Z");
  });

  it("defaults missing duration to 24 hours", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const d = collection.resolveInventoryReleaseBidCollectionDeadline({ now });
    assert.equal(d, "2026-08-25T12:00:00.000Z");
    assert.equal(normalizeVisibilityDurationHours(null), VISIBILITY_DURATION_HOURS_DEFAULT);
    assert.equal(normalizeVisibilityDurationHours(undefined), 24);
  });

  it("clamps invalid duration for deadline; rejects on strict API parse", () => {
    assert.equal(normalizeVisibilityDurationHours(0), 1);
    assert.equal(normalizeVisibilityDurationHours(999), 168);
    assert.equal(normalizeVisibilityDurationHours("nope"), 24);
    assert.throws(
      () => parseVisibilityDurationHoursOrThrow(0, { createAppError }),
      (err) => err?.statusCode === 400 || err?.status === 400,
    );
    assert.throws(
      () => parseVisibilityDurationHoursOrThrow(200, { createAppError }),
      (err) => err?.statusCode === 400 || err?.status === 400,
    );
  });

  it("prefers explicit future deadline over visibility hours", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const explicit = "2026-08-30T15:00:00.000Z";
    const out = collection.resolveInventoryReleaseBidCollectionDeadline({
      visibilityDurationHours: 6,
      now,
      explicitDeadline: explicit,
    });
    assert.equal(out, explicit);
  });

  it("migration adds visibility_duration_hours; release no longer uses interval for deadline", () => {
    const mig = read(
      "sql/migrations/180_freelancer_activation_inventory_visibility_duration_hours_p1.sql",
    );
    assert.match(mig, /visibility_duration_hours/);
    assert.match(mig, /DEFAULT 24/);
    assert.match(mig, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(mig, /DROP TABLE|TRUNCATE|DELETE FROM/i);
    const ops = read("src/services/freelancerActivationArticleOpsService.js");
    assert.match(ops, /visibilityDurationHours|visibility_duration_hours/);
    assert.match(ops, /resolveInventoryReleaseBidCollectionDeadline\(\{[\s\S]*visibilityDurationHours/);
    assert.doesNotMatch(
      ops,
      /resolveInventoryReleaseBidCollectionDeadline\(\{[\s\S]*releaseIntervalDays/,
    );
    const eng = read("src/services/freelancerActivationArticleReleaseEngineService.js");
    assert.match(eng, /normalizeReleaseIntervalDays/);
    assert.match(eng, /isReleaseDayForInterval/);
  });
});

describe("Article-P0 wiring: inventory release creates bid round", () => {
  it("executeInventoryReleaseOnRunner calls createInitialArticleRound and sets deadline", () => {
    const ops = read("src/services/freelancerActivationArticleOpsService.js");
    assert.match(ops, /createInitialArticleRound/);
    assert.match(ops, /resolveInventoryReleaseBidCollectionDeadline/);
    assert.match(ops, /application_deadline_at/);
    assert.match(ops, /current_bid_collection_round_id|currentBidCollectionRoundId/);
    assert.match(ops, /hasActivePublishedArticleForInventory/);
    assert.match(ops, /restoreInventoryItemAfterMinimumNotMet/);
  });

  it("createInitialArticleRound persists application_deadline_at", () => {
    const src = read("src/services/opportunityBidCollectionService.js");
    assert.match(src, /application_deadline_at = COALESCE\(\$4::timestamptz, application_deadline_at\)/);
  });
});

describe("Article-P1 release interval stays batch cadence only", () => {
  it("restore does not re-release; interval still gates auto runs", () => {
    const ops = read("src/services/freelancerActivationArticleOpsService.js");
    assert.match(ops, /restoredForNextReleaseCycle/);
    assert.match(ops, /release_interval_days still gates/);
    assert.doesNotMatch(
      ops,
      /restoreInventoryItemAfterMinimumNotMet[\s\S]{0,800}executeInventoryReleaseOnRunner/,
    );
    const eng = read("src/services/freelancerActivationArticleReleaseEngineService.js");
    assert.match(eng, /isReleaseDayForInterval/);
    assert.match(eng, /bypassInterval/);
  });
});

describe("Article-P0 minimum_not_met restores inventory", () => {
  it("closeArticleRoundMinimumNotMet wires inventory restore", () => {
    const src = read("src/services/opportunityBidCollectionService.js");
    assert.match(src, /restoreInventoryItemAfterMinimumNotMet/);
    assert.match(src, /inventoryRestore/);
  });

  it("restoreInventoryItemAfterMinimumNotMet returns inventory to ready and decrements released_count", async () => {
    const queries = [];
    const client = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (/SELECT activation_inventory_item_id/.test(sql)) {
          return { rows: [{ activation_inventory_item_id: 44 }] };
        }
        if (/status = 'published'/.test(sql) && /id <>/.test(sql)) {
          return { rows: [] };
        }
        if (/UPDATE freelancer_activation_article_inventory_items/.test(sql)) {
          return {
            rows: [
              {
                id: 44,
                status: "ready",
                released_count: 0,
                release_strategy: "one_time",
                title: "Mini",
                plan_tier_code: "starter",
                total_article_value_jod: "1.000",
                freelancer_share_jod: "0.500",
                company_share_jod: "0.300",
                reviewer_share_jod: "0.200",
                minimum_bidders_per_article: 10,
                visibility_duration_hours: 12,
                campaign_id: 1,
                wave_id: null,
                max_releases: null,
                last_released_at: null,
                metadata: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const out = await articleOps.restoreInventoryItemAfterMinimumNotMet(client, {
      articleId: 99,
      now: new Date("2026-08-24T12:00:00.000Z"),
    });
    assert.equal(out.restored, true);
    assert.equal(out.inventoryItemId, 44);
    assert.equal(out.inventoryItem.status, "ready");
    const update = queries.find((q) => /UPDATE freelancer_activation_article_inventory_items/.test(q.sql));
    assert.ok(update);
    assert.match(update.sql, /released_count = GREATEST\(0, COALESCE\(released_count, 0\) - 1\)/);
    assert.match(update.sql, /status = 'ready'/);
  });
});

describe("Article-P0 duplicate active published guard", () => {
  it("release engine skips when active_published_exists", () => {
    const eng = read("src/services/freelancerActivationArticleReleaseEngineService.js");
    assert.match(eng, /active_published_exists/);
    assert.match(eng, /hasActivePublishedArticleForInventory/);
  });

  it("hasActivePublishedArticleForInventory returns true when published row exists", async () => {
    const runner = {
      async query(sql) {
        if (/activation_inventory_item_id/.test(sql)) {
          return { rows: [{ id: 7 }] };
        }
        return { rows: [] };
      },
    };
    assert.equal(await articleOps.hasActivePublishedArticleForInventory(runner, 3), true);
  });

  it("hasActivePublishedArticleForInventory returns false when none", async () => {
    const runner = {
      async query() {
        return { rows: [] };
      },
    };
    assert.equal(await articleOps.hasActivePublishedArticleForInventory(runner, 3), false);
  });
});

describe("Article-P0 expiry + refund path still cancels not rejects", () => {
  it("closeArticleRoundMinimumNotMet cancels pending apps and releases reservations", async () => {
    const released = [];
    const reservationService = require("../src/services/marketplaceBidCreditReservationService");
    const origRelease = reservationService.releaseBidCreditReservation;
    reservationService.releaseBidCreditReservation = async ({ reservationId }) => {
      released.push(reservationId);
      return { released: true };
    };
    const sqlLog = [];
    const client = {
      async query(sql) {
        sqlLog.push(sql);
        if (/FROM marketplace_article_applications/.test(sql) && /FOR UPDATE/.test(sql)) {
          return {
            rows: [
              { id: 1, status: "pending", bid_reservation_id: 101 },
              { id: 2, status: "pending", bid_reservation_id: 102 },
            ],
          };
        }
        if (/FROM marketplace_articles WHERE id/.test(sql) && !/UPDATE/.test(sql)) {
          return { rows: [{ id: 77, is_fake_or_training: false, activation_inventory_item_id: 5 }] };
        }
        if (/bid_collection_status = 'minimum_not_met'/.test(sql)) {
          return { rows: [{ id: 5, bid_collection_status: "minimum_not_met" }] };
        }
        if (/UPDATE freelancer_activation_article_inventory_items/.test(sql)) {
          return {
            rows: [
              {
                id: 5,
                status: "ready",
                released_count: 0,
                release_strategy: "one_time",
                title: "t",
                plan_tier_code: "starter",
                total_article_value_jod: "1",
                freelancer_share_jod: "0.5",
                company_share_jod: "0.3",
                reviewer_share_jod: "0.2",
                minimum_bidders_per_article: 10,
                visibility_duration_hours: 12,
                campaign_id: 1,
              },
            ],
          };
        }
        if (/SELECT activation_inventory_item_id/.test(sql)) {
          return { rows: [{ activation_inventory_item_id: 5 }] };
        }
        return { rows: [], rowCount: 2 };
      },
    };
    try {
      const out = await collection.closeArticleRoundMinimumNotMet(client, {
        id: 5,
        opportunity_id: 77,
        opportunity_type: "mini_bid_article",
        required_bid_count: 10,
        bid_collection_status: "collecting",
      });
      assert.equal(out.skipped, false);
      assert.equal(out.status, "minimum_not_met");
      assert.deepEqual(released, [101, 102]);
      assert.ok(sqlLog.some((s) => /SET status = 'cancelled'/.test(s)));
      assert.ok(!sqlLog.some((s) => /SET status = 'rejected'/.test(s)));
      assert.equal(out.inventoryRestore?.restored, true);
    } finally {
      reservationService.releaseBidCreditReservation = origRelease;
    }
  });
});

describe("Article-P1 executeInventoryReleaseOnRunner uses item visibility hours", () => {
  it("sets application_deadline_at from visibility_duration_hours=6 not interval days", async () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    let insertedDeadline = null;
    let roundDeadline = null;
    const runner = {
      async query(sql, params) {
        if (/activation_inventory_item_id/.test(sql) && /status = 'published'/.test(sql)) {
          return { rows: [] };
        }
        if (/INSERT INTO marketplace_articles/.test(sql)) {
          insertedDeadline = params[8];
          return {
            rows: [
              {
                id: 501,
                status: "published",
                application_deadline_at: params[8],
                required_bid_count: params[7],
                activation_inventory_item_id: 9,
              },
            ],
          };
        }
        if (/UPDATE marketplace_articles/.test(sql) && /current_bid_collection_round_id/.test(sql)) {
          return {
            rows: [
              {
                id: 501,
                application_deadline_at: insertedDeadline,
                current_bid_collection_round_id: 77,
              },
            ],
          };
        }
        if (/FROM marketplace_articles WHERE id/.test(sql)) {
          return {
            rows: [
              {
                id: 501,
                application_deadline_at: insertedDeadline,
                current_bid_collection_round_id: 77,
              },
            ],
          };
        }
        if (/UPDATE freelancer_activation_article_inventory_items/.test(sql)) {
          return {
            rows: [
              {
                id: 9,
                status: "released",
                released_count: 1,
                plan_tier_code: "starter",
                title: "A",
                total_article_value_jod: "1.000",
                freelancer_share_jod: "0.500",
                company_share_jod: "0.300",
                reviewer_share_jod: "0.200",
                minimum_bidders_per_article: 10,
                visibility_duration_hours: 6,
                campaign_id: 1,
                release_strategy: "reusable",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const item = {
      id: 9,
      campaign_id: 1,
      wave_id: null,
      plan_tier_code: "starter",
      title: "A",
      description: "",
      category_id: null,
      subcategory_id: null,
      total_article_value_jod: "1.000",
      freelancer_share_jod: "0.500",
      company_share_jod: "0.300",
      reviewer_share_jod: "0.200",
      minimum_bidders_per_article: 10,
      visibility_duration_hours: 6,
      status: "ready",
      release_strategy: "reusable",
      released_count: 0,
      max_releases: null,
    };
    const origCreate = collection.createInitialArticleRound;
    collection.createInitialArticleRound = async (_articleId, _minBidders, deadline) => {
      roundDeadline = deadline;
      return { id: 77, bid_collection_deadline_at: deadline };
    };
    try {
      const out = await articleOps.executeInventoryReleaseOnRunner(runner, item, {
        skipFundCheck: true,
        now,
      });
      assert.equal(insertedDeadline, "2026-08-24T18:00:00.000Z");
      assert.equal(roundDeadline, "2026-08-24T18:00:00.000Z");
      assert.notEqual(insertedDeadline, "2026-08-26T12:00:00.000Z");
      assert.ok(out?.article);
    } finally {
      collection.createInitialArticleRound = origCreate;
    }
  });
});

describe("Article-P1 auto-assign readiness uses currentBidCount", () => {
  it("reads currentBidCount / current from progress view", () => {
    const src = read("src/services/freelancerActivationAutoAssignmentService.js");
    assert.match(src, /currentBidCount/);
    assert.match(src, /progress\?\.current\b/);
  });

  it("weighted fair still uses seeded lottery among weighted candidates", () => {
    const a = autoAssign.selectWeightedFairIndex(
      [
        { weight: 10 },
        { weight: 10 },
      ],
      "seed-a",
    );
    const b = autoAssign.selectWeightedFairIndex(
      [
        { weight: 10 },
        { weight: 10 },
      ],
      "seed-a",
    );
    assert.equal(a.index, b.index);
    assert.ok(a.index === 0 || a.index === 1);
  });
});

describe("Article-P0 pool visibility after close", () => {
  it("freelancer list filters published only; closed articles excluded", () => {
    const svc = read("src/services/marketplaceArticlesService.js");
    assert.match(svc, /a\.status = 'published'/);
    assert.match(svc, /listPublishedMarketplaceArticles/);
  });
});

describe("Article-P1 Super Admin UI labels", () => {
  it("inventory form exposes Arabic visibility duration; alloc exposes release cadence", () => {
    const ui = read("../frontend/src/components/admin/FreelancerActivationArticleOpsPanel.jsx");
    assert.match(ui, /مدة ظهور المقال للمستقلين/);
    assert.match(ui, /visibilityDurationHours/);
    assert.match(ui, /تكرار إنزال المقالات/);
    assert.match(ui, /releaseIntervalDays/);
    assert.match(ui, /يحدد كل كم يوم يتم إنزال دفعة جديدة من المقالات/);
  });
});
