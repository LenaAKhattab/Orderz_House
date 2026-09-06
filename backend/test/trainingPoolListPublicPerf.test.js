/**
 * Public pool list performance helpers: guest-only cache, no per-row settings SQL.
 * Run: node --test test/trainingPoolListPublicPerf.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/training_pool_list_perf_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { trainingPoolVisibleWhereSql } = require("../src/services/trainingPoolEligibility");

describe("trainingPoolList public performance", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "trainingPoolList.js"), "utf8");
  const controllerSrc = fs.readFileSync(
    path.join(__dirname, "..", "src", "controllers", "ordersController.js"),
    "utf8",
  );

  it("merged pool uses a single COUNT(*) OVER page query", () => {
    assert.match(src, /COUNT\(\*\) OVER\(\)::int AS total/);
    assert.doesNotMatch(src, /SELECT COUNT\(\*\)::int AS total FROM unioned/);
  });

  it("does not re-query fake_order_settings per UNION row after the visibility gate", () => {
    assert.match(src, /poolViewerMaySeeFakeOrders/);
    assert.doesNotMatch(src, /SELECT training_orders_enabled FROM fake_order_settings/);
    assert.doesNotMatch(src, /SELECT show_to_all_visitors FROM fake_order_settings/);
  });

  it("guest meta cache is keyed without user id and skipped for authenticated viewers", () => {
    assert.match(src, /isGuestViewer/);
    assert.match(src, /guestMetaCache/);
    assert.match(src, /cache: "bypass_auth"/);
  });

  it("keeps synchronous handoff recovery when a page has no fake rows", () => {
    assert.match(src, /ensureMinimumVisibleFakeOrders/);
    assert.match(src, /pool_list_handoff/);
    assert.match(src, /fakeCount === 0/);
  });

  it("controller caches sanitized guest pool JSON only when userId is absent", () => {
    assert.match(controllerSrc, /guestPoolResponseCache/);
    assert.match(controllerSrc, /if \(!userId && !isFreelancer\)/);
    assert.match(controllerSrc, /sanitizePublicPoolOrder/);
    assert.match(controllerSrc, /sanitizeFreelancerPoolOrder/);
  });
});

describe("trainingPoolEligibility settings inline", () => {
  it("default SQL still uses settings subqueries (automation / coverage callers)", () => {
    const sql = trainingPoolVisibleWhereSql({ publicAudienceOnly: true });
    assert.match(sql, /show_to_all_visitors/);
    assert.match(sql, /fake_order_settings/);
  });

  it("inlined public audience skips per-row settings subqueries", () => {
    const sql = trainingPoolVisibleWhereSql({
      publicAudienceOnly: true,
      settings: {
        training_orders_enabled: true,
        show_to_all_visitors: true,
        show_to_all_freelancers: false,
      },
    });
    assert.match(sql, /TRUE OR FALSE/);
    assert.doesNotMatch(sql, /SELECT show_to_all_visitors FROM fake_order_settings/);
  });
});
