const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { trainingPoolVisibleWhereSql } = require("../src/services/trainingPoolEligibility");

describe("trainingPoolEligibility", () => {
  it("public stats filter requires audience visibility", () => {
    const sql = trainingPoolVisibleWhereSql({ publicAudienceOnly: true });
    assert.match(sql, /show_to_all_visitors/);
    assert.match(sql, /visible_until > NOW\(\)/);
  });

  it("pool coverage filter uses strict expiry boundary", () => {
    const sql = trainingPoolVisibleWhereSql();
    assert.match(sql, /visible_until > NOW\(\)/);
    assert.doesNotMatch(sql, /visible_until >= NOW\(\)/);
  });

  it("poolOrderResolveService uses strict visible_until boundary", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "poolOrderResolveService.js"),
      "utf8",
    );
    assert.match(src, /visible_until > NOW\(\)/);
    assert.doesNotMatch(src, /visible_until >= NOW\(\)/);
  });

  it("trainingPoolList handles LOCK_BUSY from empty-pool recovery", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "trainingPoolList.js"),
      "utf8",
    );
    assert.match(src, /ensure_min_visible_lock_busy/);
    assert.match(src, /getVisibleFakeOrdersCount/);
    assert.match(src, /fakeCount === 0/);
  });
});
