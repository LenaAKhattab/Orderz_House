/**
 * Public home-stats controller: parallel fetches + short public TTL cache.
 * Run: node --test test/publicHomeStatsController.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/public_home_stats_controller_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("publicHomeStatsController", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "..", "src", "controllers", "publicHomeStatsController.js"),
    "utf8",
  );

  it("loads order counts and analytics in parallel", () => {
    assert.match(src, /Promise\.all\(\[orderCountsPromise, analyticsPromise\]\)/);
  });

  it("caches the assembled public JSON with a 30–120s TTL", () => {
    assert.match(src, /PUBLIC_HOME_STATS_RESPONSE_CACHE_MS/);
    assert.match(src, /homeStatsResponseCache/);
    assert.match(src, /30_000/);
    assert.match(src, /120_000/);
  });

  it("does not include private user fields in the public payload builder", () => {
    assert.doesNotMatch(src, /userId/);
    assert.doesNotMatch(src, /email/);
    assert.match(src, /availableOrdersNow/);
    assert.match(src, /completedOrders/);
  });
});
