import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatHomePublicStat } from "../../utils/homePublicStatFormat.js";
import {
  getAnalyticsRawNumber,
  hasValidHeroOrderStats,
  isAnalyticsMetricLoading,
  isValidHomeStatCount,
  resolveNumber,
  shouldRenderHeroStatsSection,
} from "./heroHomeStatUtils.js";

function validPayload(overrides = {}) {
  return {
    error: false,
    orderCountsDegraded: false,
    showVisitorsCount: true,
    showActiveUsersCount: true,
    visitors: 10,
    activeUsers: 2,
    availableOrdersNow: 42,
    completedOrders: 120,
    ...overrides,
  };
}

describe("hero home stats visibility", () => {
  it("loading (null payload): section reserved for skeleton, no em dash in resolveNumber", () => {
    assert.equal(shouldRenderHeroStatsSection(null), true);
    assert.equal(hasValidHeroOrderStats(null), false);
    assert.equal(isAnalyticsMetricLoading(null, "completedOrders"), true);
    assert.equal(isAnalyticsMetricLoading(null, "availableOrders"), true);
    assert.equal(resolveNumber(null, "completedOrders"), "");
    assert.equal(resolveNumber(null, "availableOrders"), "");
    assert.equal(formatHomePublicStat(null), "");
    assert.notEqual(resolveNumber(null, "completedOrders"), "—");
    assert.notEqual(formatHomePublicStat(null), "—");
  });

  it("valid positive values: stats section visible and numbers resolve", () => {
    const payload = validPayload({ completedOrders: 120, availableOrdersNow: 42 });
    assert.equal(shouldRenderHeroStatsSection(payload), true);
    assert.equal(hasValidHeroOrderStats(payload), true);
    assert.equal(getAnalyticsRawNumber(payload, "completedOrders"), 120);
    assert.equal(getAnalyticsRawNumber(payload, "availableOrders"), 42);
    assert.equal(resolveNumber(payload, "completedOrders"), "120");
    assert.equal(resolveNumber(payload, "availableOrders"), "42");
    assert.equal(isAnalyticsMetricLoading(payload, "completedOrders"), false);
  });

  it("valid zero / zero: stats section visible and shows 0", () => {
    const payload = validPayload({ completedOrders: 0, availableOrdersNow: 0 });
    assert.equal(shouldRenderHeroStatsSection(payload), true);
    assert.equal(hasValidHeroOrderStats(payload), true);
    assert.equal(getAnalyticsRawNumber(payload, "completedOrders"), 0);
    assert.equal(getAnalyticsRawNumber(payload, "availableOrders"), 0);
    assert.equal(resolveNumber(payload, "completedOrders"), "0");
    assert.equal(resolveNumber(payload, "availableOrders"), "0");
    assert.equal(isValidHomeStatCount(0), true);
  });

  it("network-style error payload: entire stats block hidden", () => {
    const payload = { error: true, availableOrdersNow: null, completedOrders: null, orderCountsDegraded: false };
    assert.equal(shouldRenderHeroStatsSection(payload), false);
    assert.equal(hasValidHeroOrderStats(payload), false);
    assert.equal(resolveNumber(payload, "completedOrders"), "");
    assert.equal(resolveNumber(payload, "availableOrders"), "");
    assert.notEqual(resolveNumber(payload, "completedOrders"), "—");
  });

  it("HTTP 500-equivalent error flag: hidden", () => {
    assert.equal(shouldRenderHeroStatsSection(validPayload({ error: true })), false);
  });

  it("malformed / degraded order counts: hidden", () => {
    assert.equal(
      shouldRenderHeroStatsSection(
        validPayload({ orderCountsDegraded: true, availableOrdersNow: null, completedOrders: null }),
      ),
      false,
    );
    assert.equal(
      shouldRenderHeroStatsSection(validPayload({ availableOrdersNow: undefined, completedOrders: 5 })),
      false,
    );
  });

  it("one stat missing: whole block hidden", () => {
    assert.equal(shouldRenderHeroStatsSection(validPayload({ availableOrdersNow: 3, completedOrders: null })), false);
    assert.equal(shouldRenderHeroStatsSection(validPayload({ availableOrdersNow: null, completedOrders: 3 })), false);
    assert.equal(resolveNumber(validPayload({ availableOrdersNow: 3, completedOrders: null }), "availableOrders"), "");
  });

  it("NaN / invalid / negative values: hidden", () => {
    assert.equal(isValidHomeStatCount(NaN), false);
    assert.equal(isValidHomeStatCount(Infinity), false);
    assert.equal(isValidHomeStatCount(-1), false);
    assert.equal(isValidHomeStatCount("nope"), false);
    assert.equal(isValidHomeStatCount(1.5), false);
    assert.equal(shouldRenderHeroStatsSection(validPayload({ completedOrders: NaN, availableOrdersNow: 1 })), false);
    assert.equal(shouldRenderHeroStatsSection(validPayload({ completedOrders: -2, availableOrdersNow: 1 })), false);
    assert.equal(shouldRenderHeroStatsSection(validPayload({ completedOrders: Infinity, availableOrdersNow: 1 })), false);
  });

  it("recovery after failure: valid refetch makes section visible again", () => {
    const failed = { error: true, availableOrdersNow: null, completedOrders: null, orderCountsDegraded: false };
    assert.equal(shouldRenderHeroStatsSection(failed), false);
    const recovered = validPayload({ completedOrders: 7, availableOrdersNow: 9 });
    assert.equal(shouldRenderHeroStatsSection(recovered), true);
    assert.equal(resolveNumber(recovered, "completedOrders"), "7");
    assert.equal(resolveNumber(recovered, "availableOrders"), "9");
  });

  it("hidden state leaves no dash placeholder strings", () => {
    const hiddenCases = [
      { error: true },
      validPayload({ orderCountsDegraded: true, availableOrdersNow: null, completedOrders: null }),
      validPayload({ availableOrdersNow: null, completedOrders: 1 }),
      validPayload({ availableOrdersNow: "x", completedOrders: 1 }),
    ];
    for (const payload of hiddenCases) {
      assert.equal(shouldRenderHeroStatsSection(payload), false);
      assert.equal(resolveNumber(payload, "completedOrders"), "");
      assert.equal(resolveNumber(payload, "availableOrders"), "");
      assert.ok(!String(resolveNumber(payload, "completedOrders")).includes("—"));
    }
  });
});
