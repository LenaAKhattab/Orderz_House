const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
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
});
