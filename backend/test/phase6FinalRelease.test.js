/**
 * UI/UX Phase 6 — final release pass (backend): Super Admin visitors analytics degrade gracefully when PostHog
 * times out or is not configured (was a 500, re-requested by the dashboard on every bundle update).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/p6_placeholder";
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const posthogAnalyticsService = require("../src/services/posthogAnalyticsService");
const { getPosthogProductAnalytics } = require("../src/services/superAdminAnalyticsOverviewService");

const original = {
  read: posthogAnalyticsService.readPosthogCredentialsLoose,
  fetch: posthogAnalyticsService.fetchSuperAdminOverviewPosthogWithTimeout,
};

afterEach(() => {
  posthogAnalyticsService.readPosthogCredentialsLoose = original.read;
  posthogAnalyticsService.fetchSuperAdminOverviewPosthogWithTimeout = original.fetch;
});

describe("Super Admin visitors analytics without PostHog data", () => {
  it("PostHog query timeout → 200 payload with posthogError and zero conversion (no TypeError)", async () => {
    posthogAnalyticsService.readPosthogCredentialsLoose = () => ({ projectId: "p", apiKey: "k" });
    posthogAnalyticsService.fetchSuperAdminOverviewPosthogWithTimeout = async () => {
      const err = new Error("timeout");
      err.publicCode = "PH_QUERY_TIMEOUT";
      throw err;
    };
    const res = await getPosthogProductAnalytics({ range: "30d", topLimit: 7 });
    assert.equal(res.events, null);
    assert.ok(res.meta.posthogError);
    assert.deepEqual(res.conversion, { signups: 0, logins: 0, subscriptionsPurchased: 0, ordersCompleted: 0, signupToLoginRatio: null });
  });

  it("PostHog not configured → explained in meta, conversion zeros", async () => {
    posthogAnalyticsService.readPosthogCredentialsLoose = () => null;
    const res = await getPosthogProductAnalytics({ range: "90d", topLimit: 3 });
    assert.equal(res.meta.posthogConfigured, false);
    assert.ok(res.meta.posthogError);
    assert.equal(res.conversion.signups, 0);
  });
});
