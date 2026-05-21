/**
 * Unit tests for default free-plan helpers (no DB).
 * Run: node --test test/freelancerDefaultFreePlan.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  isOrderzhouseFreePlan,
  ORDERZHOUSE_FREE_PLAN_ID,
  ORDERZHOUSE_FREE_PLAN_NAME,
} = require("../src/constants/orderzhousePlansCatalog");

describe("isOrderzhouseFreePlan", () => {
  it("detects plan id 1", () => {
    assert.strictEqual(isOrderzhouseFreePlan(1), true);
    assert.strictEqual(isOrderzhouseFreePlan(ORDERZHOUSE_FREE_PLAN_ID), true);
    assert.strictEqual(isOrderzhouseFreePlan(2), false);
  });

  it("detects plan name", () => {
    assert.strictEqual(isOrderzhouseFreePlan({ id: 1, name: ORDERZHOUSE_FREE_PLAN_NAME }), true);
    assert.strictEqual(isOrderzhouseFreePlan({ planId: "1", plan: { name: ORDERZHOUSE_FREE_PLAN_NAME } }), true);
    assert.strictEqual(isOrderzhouseFreePlan({ id: 2, name: "orderzhouse_50_jod" }), false);
  });
});
