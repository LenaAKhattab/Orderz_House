/**
 * Payment checkout funnel telemetry — idempotency, allowlist, ownership.
 * Run: node --test test/paymentCheckoutFunnelTelemetry.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEventType,
  normalizeChannel,
  normalizeLocale,
  normalizeSessionId,
  CLIENT_EMITTABLE,
  EVENT_TYPES,
  recordFunnelEvent,
  authorizeSessionOwnership,
} = require("../src/services/paymentCheckoutFunnelTelemetry");
const { summarizeFirstPartyFunnel } = require("../src/services/paymentCheckoutFunnelReport");

describe("normalize helpers", () => {
  it("allowlists event types and channels", () => {
    assert.equal(normalizeEventType("checkout_redirect_started"), "checkout_redirect_started");
    assert.equal(normalizeEventType("checkout_opened"), null);
    assert.equal(normalizeChannel("mobile_app"), "mobile");
    assert.equal(normalizeChannel("web"), "web");
    assert.equal(normalizeChannel("desktop"), null);
    assert.equal(normalizeLocale("de-DE"), "de");
    assert.equal(normalizeLocale("xx"), null);
    assert.ok(normalizeSessionId("cs_test_abc123"));
    assert.equal(normalizeSessionId("pi_abc"), null);
  });

  it("client may only emit return/redirect events", () => {
    assert.deepEqual([...CLIENT_EMITTABLE].sort(), [
      "checkout_cancel_returned",
      "checkout_redirect_started",
      "checkout_success_returned",
    ]);
    assert.ok(EVENT_TYPES.includes("checkout_requested"));
    assert.ok(EVENT_TYPES.includes("checkout_session_created"));
  });
});

describe("recordFunnelEvent idempotency", () => {
  it("inserts once then duplicates for same session+event", async () => {
    const rows = new Set();
    const db = {
      async query(sql, params) {
        if (/INSERT INTO payment_checkout_funnel_events/.test(sql)) {
          const key = `${params[0]}|${params[4] || params[5]}`;
          if (rows.has(key)) return { rowCount: 0 };
          rows.add(key);
          return { rowCount: 1 };
        }
        throw new Error(`unexpected sql: ${sql}`);
      },
    };
    const base = {
      eventType: "checkout_redirect_started",
      paymentFlow: "membership_silver",
      channel: "web",
      locale: "de",
      stripeCheckoutSessionId: "cs_test_idem_1",
      localRef: "mca:9",
      actorUserId: 42,
    };
    const a = await recordFunnelEvent(base, db);
    const b = await recordFunnelEvent(base, db);
    assert.equal(a.recorded, true);
    assert.equal(b.recorded, false);
    assert.equal(b.duplicate, true);
  });

  it("rejects unsupported client event types at normalize layer", async () => {
    const r = await recordFunnelEvent(
      {
        eventType: "checkout_opened",
        channel: "web",
        stripeCheckoutSessionId: "cs_test_x",
        localRef: "sess:cs_test_x",
        actorUserId: 1,
        paymentFlow: "client_fixed",
      },
      { query: async () => ({ rowCount: 1 }) },
    );
    assert.equal(r.recorded, false);
    assert.equal(r.error, "INVALID_EVENT_TYPE");
  });
});

describe("authorizeSessionOwnership", () => {
  it("rejects other users and accepts owner via membership attempt", async () => {
    const db = {
      async query(sql, params) {
        if (/marketplace_membership_checkout_attempts/.test(sql)) {
          if (Number(params[1]) === 7) return { rows: [{ id: 11, plan_code: "silver" }] };
          return { rows: [] };
        }
        if (/client_order_payments/.test(sql)) return { rows: [] };
        if (/training_package_purchases/.test(sql)) return { rows: [] };
        if (/marketplace_bid_credit_purchases/.test(sql)) return { rows: [] };
        return { rows: [] };
      },
    };
    const denied = await authorizeSessionOwnership(
      { userId: 99, sessionId: "cs_test_own", claimedFlow: "membership_silver" },
      db,
    );
    assert.equal(denied.ok, false);
    const ok = await authorizeSessionOwnership(
      { userId: 7, sessionId: "cs_test_own", claimedFlow: "membership_silver" },
      db,
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.localRef, "mca:11");
    assert.match(ok.paymentFlow, /membership/);
  });
});

describe("summarizeFirstPartyFunnel", () => {
  it("reports rates only when denominator is large enough", () => {
    const summary = summarizeFirstPartyFunnel({
      available: true,
      instrumentationStartedAt: "2026-11-03T00:00:00.000Z",
      byType: {
        checkout_session_created: 5,
        checkout_redirect_started: 3,
        checkout_cancel_returned: 1,
        checkout_success_returned: 1,
      },
      byFlow: {},
      byChannel: { web: { checkout_redirect_started: 3 } },
      byLocale: { de: { checkout_redirect_started: 3 } },
      sessions: [
        {
          sessionCreated: true,
          redirectStarted: true,
          cancelReturned: false,
          successReturned: true,
          sessionAt: "2026-11-03T10:00:00.000Z",
          redirectAt: "2026-11-03T10:00:05.000Z",
          successAt: "2026-11-03T10:05:00.000Z",
        },
        { sessionCreated: true, redirectStarted: false, cancelReturned: false, successReturned: false },
        { sessionCreated: true, redirectStarted: true, cancelReturned: true, successReturned: false },
      ],
    });
    assert.equal(summary.available, true);
    assert.equal(summary.counts.redirectObserved, 2);
    assert.equal(summary.counts.redirectNotObserved, 1);
    assert.equal(summary.rates.sessionToRedirect.pct, null); // n < 20
    assert.equal(summary.timing.sessionCreatedToRedirectStarted.n, 1);
  });
});
