/**
 * Payment Analytics R2 — canonical funnel model, reconciliation, privacy and read-only guarantees.
 * Pure fixtures (Stripe-shaped objects + a SQL-matching fake DB); no network, no database.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const model = require("../src/services/paymentFunnelAnalyticsModel");
const service = require("../src/services/paymentFunnelAnalyticsService");
const { renderText } = require("../scripts/paymentAnalyticsReport");

const { SESSION_STATE, SESSION_ROLE, JOURNEY_OUTCOME } = model;
const DAY = 86400;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0) / 1000;
const SITE = new Set(["orderzhouse.com"]);
let seq = 0;
const sid = () => `cs_live_a1${String(++seq).padStart(20, "0")}`;
const piId = () => `pi_3Q${String(++seq).padStart(20, "0")}`;

const META = {
  membership: (user = 11, plan = 2, planCode = "silver") => ({ purpose: "marketplace_membership_checkout", freelancerUserId: String(user), marketplacePlanId: String(plan), planCode, user_email: "someone@example.com" }),
  annual: (user = 12) => ({ purpose: "marketplace_membership_checkout", freelancerUserId: String(user), marketplacePlanId: "9", planCode: "annual_basic" }),
  fixed: (order = 501, client = 21) => ({ purpose: "client_fixed_order", orderId: String(order), clientUserId: String(client) }),
  bid: (order = 601, client = 22) => ({ purpose: "client_selected_bid", orderId: String(order), bidId: "7", clientUserId: String(client) }),
  training: (user = 31, pkg = "basic") => ({ purpose: "training_package_purchase", user_id: String(user), training_package_code: pkg, purchase_id: "3" }),
};

function session({ meta, created, status = "expired", paid = false, pi = null, mode = "payment", host = "https://orderzhouse.com", pathName = "/dashboard/x", livemode = true, id = sid(), lifetime = DAY, subscription = null }) {
  return {
    id,
    created,
    expires_at: created + lifetime,
    status,
    payment_status: paid ? "paid" : "unpaid",
    payment_intent: pi,
    subscription,
    mode,
    livemode,
    success_url: `${host}${pathName}?session_id={CHECKOUT_SESSION_ID}`,
    metadata: meta,
    amount_total: 10000,
    currency: "jod",
  };
}
function charge(pi, created, { ok = false, type = "issuer_declined", reason = "generic_decline" } = {}) {
  return { id: `ch_3Q${String(++seq).padStart(20, "0")}`, payment_intent: pi, created, status: ok ? "succeeded" : "failed", paid: ok, outcome: ok ? { type: "authorized" } : { type, reason } };
}

function analyze(sessions, charges = [], pis = [], { now = NOW, gapDays } = {}) {
  const chargesByPi = new Map();
  for (const c of charges) {
    if (!chargesByPi.has(c.payment_intent)) chargesByPi.set(c.payment_intent, []);
    chargesByPi.get(c.payment_intent).push(c);
  }
  const normalized = sessions.map((s) => model.normalizeSession(s, { siteHosts: SITE })).filter((n) => !n.excludedReason);
  const enriched = model.enrichSessions(normalized, { chargesByPi, paymentIntentsById: new Map(pis.map((p) => [p.id, p])) }, now);
  const journeys = model.buildJourneys(enriched, { gapDays });
  return { sessions: enriched, journeys, summary: model.summarize(journeys, enriched) };
}

// ------------------------------------------------------------------ session / journey classification

test("session created, never attempted → expired_without_attempt; journey ABANDONED, never a failure", () => {
  const { sessions, journeys, summary } = analyze([session({ meta: META.membership(), created: NOW - 5 * DAY })]);
  assert.equal(sessions[0].state, SESSION_STATE.EXPIRED_WITHOUT_ATTEMPT);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.ABANDONED);
  assert.equal(summary.journeys.abandoned, 1);
  assert.equal(summary.journeys.failed, 0);
  assert.equal(summary.attempts.failed, 0);
  assert.equal(summary.journeys.attempted, 0);
});

test("attempted and failed → expired_after_failed_attempt; journey FAILED with the decline category", () => {
  const pi = piId();
  const { sessions, journeys, summary } = analyze(
    [session({ meta: META.fixed(), created: NOW - 5 * DAY, pi })],
    [charge(pi, NOW - 5 * DAY + 120, { reason: "insufficient_funds" })],
  );
  assert.equal(sessions[0].state, SESSION_STATE.EXPIRED_AFTER_FAILED_ATTEMPT);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.FAILED);
  assert.deepEqual(summary.attempts.byCategory, { issuer_insufficient_funds: 1 });
  assert.deepEqual(summary.attempts.byGroup, { insufficient_funds: 1 });
  assert.equal(summary.journeys.abandoned, 0);
});

test("attempted and succeeded on the first try → SUCCEEDED_FIRST_TRY with time-to-pay", () => {
  const pi = piId();
  const created = NOW - 3 * DAY;
  const { sessions, journeys } = analyze(
    [session({ meta: META.training(), created, status: "complete", paid: true, pi })],
    [charge(pi, created + 300, { ok: true })],
  );
  assert.equal(sessions[0].state, SESSION_STATE.SUCCEEDED);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.SUCCEEDED_FIRST_TRY);
  assert.equal(journeys[0].successAt - journeys[0].startedAt, 300);
});

test("retry after expiration: abandoned session, later new session paid → RECOVERED (abandonment)", () => {
  const t = NOW - 6 * DAY;
  const pi = piId();
  const { sessions, journeys, summary } = analyze(
    [
      session({ meta: META.membership(), created: t }),
      session({ meta: META.membership(), created: t + 2 * DAY, status: "complete", paid: true, pi }),
    ],
    [charge(pi, t + 2 * DAY + 60, { ok: true })],
  );
  assert.equal(journeys.length, 1);
  assert.deepEqual(sessions.map((s) => s.role), [SESSION_ROLE.INITIAL, SESSION_ROLE.RETRY_AFTER_ABANDONMENT]);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.RECOVERED_AFTER_RETRY);
  assert.equal(journeys[0].recoveredAfter, "abandonment");
  assert.equal(summary.journeys.retried, 1);
  assert.equal(summary.journeys.retriedSucceeded, 1);
  assert.equal(summary.rates.successAfterAbandonedSession.n, 1);
});

test("retry after failure: failed attempt, new session paid → RECOVERED (failure), role retry_after_failure", () => {
  const t = NOW - 6 * DAY;
  const pi1 = piId();
  const pi2 = piId();
  const { sessions, journeys, summary } = analyze(
    [
      session({ meta: META.membership(), created: t, pi: pi1 }),
      session({ meta: META.membership(), created: t + 600, status: "complete", paid: true, pi: pi2 }),
    ],
    [charge(pi1, t + 100, { type: "blocked", reason: "rule" }), charge(pi2, t + 700, { ok: true })],
  );
  assert.equal(sessions[1].role, SESSION_ROLE.RETRY_AFTER_FAILURE);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.RECOVERED_AFTER_RETRY);
  assert.equal(journeys[0].recoveredAfter, "failure");
  assert.deepEqual(summary.attempts.byGroup, { blocked_by_fraud_screening: 1 });
  assert.equal(summary.rates.successAfterPaymentFailure.n, 1);
  assert.equal(summary.rates.successAfterPaymentFailure.d, 1);
});

test("recovered inside the same session (decline then success) counts one in-session retry", () => {
  const t = NOW - 2 * DAY;
  const pi = piId();
  const { journeys, summary } = analyze(
    [session({ meta: META.bid(), created: t, status: "complete", paid: true, pi })],
    [charge(pi, t + 60), charge(pi, t + 200, { ok: true })],
  );
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.RECOVERED_AFTER_RETRY);
  assert.equal(journeys[0].inSessionRetries, 1);
  assert.equal(summary.attempts.inSessionRetries, 1);
  assert.deepEqual(summary.attemptsPerJourney, { 1: 0, 2: 1, "3+": 0 });
  assert.equal(summary.timeToPay.betweenAttempts.n, 1);
});

test("duplicate webhook / re-listed session: the same session id is counted once", () => {
  const s = session({ meta: META.fixed(), created: NOW - 4 * DAY });
  const { sessions, journeys } = analyze([s, { ...s }]);
  assert.equal(sessions.length, 1);
  assert.equal(journeys.length, 1);
});

test("duplicate checkout click: a second session while the first is payable is a DUPLICATE, not a retry", () => {
  const t = NOW - 4 * DAY;
  const { sessions, journeys, summary } = analyze([
    session({ meta: META.membership(), created: t }),
    session({ meta: META.membership(), created: t + 2 }),
  ]);
  assert.deepEqual(sessions.map((s) => s.role), [SESSION_ROLE.INITIAL, SESSION_ROLE.DUPLICATE]);
  assert.equal(journeys[0].genuineSessions, 1);
  assert.equal(journeys[0].retried, false);
  assert.equal(summary.sessions.duplicates, 1);
  assert.equal(summary.journeys.retried, 0);
  assert.equal(summary.journeys.abandoned, 1);
});

test("resumed same session (Continue payment of an open session) stays ONE session and journey", () => {
  const id = sid();
  const s = session({ id, meta: META.training(), created: NOW - 3600, status: "open" });
  const { sessions, journeys, summary } = analyze([s, { ...s }, { ...s }]);
  assert.equal(sessions.length, 1);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.IN_PROGRESS);
  assert.equal(summary.journeys.resolved, 0, "in-progress journeys are excluded from conversion denominators");
});

test("multiple sessions for one client order form one journey (the order is the journey, no gap split)", () => {
  const t = NOW - 40 * DAY;
  const pi = piId();
  const { journeys } = analyze(
    [
      session({ meta: META.fixed(777), created: t }),
      session({ meta: META.fixed(777), created: t + 12 * DAY }),
      session({ meta: META.fixed(777), created: t + 30 * DAY, status: "complete", paid: true, pi }),
    ],
    [charge(pi, t + 30 * DAY + 50, { ok: true })],
  );
  assert.equal(journeys.length, 1);
  assert.equal(journeys[0].sessionCount, 3);
  assert.equal(journeys[0].genuineSessions, 3);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.RECOVERED_AFTER_RETRY);
});

test("actor-scoped journeys split after the inactivity gap and after a success", () => {
  const t = NOW - 60 * DAY;
  const pi = piId();
  const { journeys } = analyze(
    [
      session({ meta: META.membership(), created: t }),
      session({ meta: META.membership(), created: t + 10 * DAY, status: "complete", paid: true, pi }),
      session({ meta: META.membership(), created: t + 11 * DAY }),
    ],
    [charge(pi, t + 10 * DAY + 30, { ok: true })],
  );
  assert.equal(journeys.length, 3);
  assert.deepEqual(journeys.map((j) => j.outcome), [JOURNEY_OUTCOME.ABANDONED, JOURNEY_OUTCOME.SUCCEEDED_FIRST_TRY, JOURNEY_OUTCOME.ABANDONED]);
});

test("products are segmented: membership (monthly / annual), client order, selected bid, training", () => {
  const sessions = [
    session({ meta: META.membership(41), created: NOW - 2 * DAY }),
    session({ meta: META.annual(42), created: NOW - 2 * DAY }),
    session({ meta: META.fixed(801, 43), created: NOW - 2 * DAY, pathName: "/mobile/payment-return" }),
    session({ meta: META.bid(802, 44), created: NOW - 2 * DAY }),
    session({ meta: META.training(45, "premium"), created: NOW - 2 * DAY }),
  ];
  const { journeys } = analyze(sessions);
  const w = model.summarizeWindow({ journeys, sessions: analyze(sessions).sessions, fromSec: NOW - 7 * DAY, toSec: NOW + 1 });
  assert.deepEqual(Object.keys(w.byGroup).sort(), ["client_order", "membership", "selected_bid", "training"]);
  assert.deepEqual(Object.keys(w.byFlow).sort(), ["annual_silver", "client_fixed", "client_selected_bid", "membership_silver", "training"]);
  assert.equal(w.byBillingTerm.annual.journeys.started, 1);
  assert.equal(w.byBillingTerm.monthly.journeys.started, 1);
  assert.equal(w.byChannel.mobile_app.journeys.started, 1);
  assert.equal(w.abandonment.sessions, 5);
});

test("subscription-mode expiry is attempt_unknown, never abandonment or failure", () => {
  const { sessions, journeys, summary } = analyze([
    session({ meta: { purpose: "freelancer_recurring_subscription", freelancerUserId: "51", planId: "4" }, created: NOW - 5 * DAY, mode: "subscription" }),
  ]);
  assert.equal(sessions[0].state, SESSION_STATE.EXPIRED_ATTEMPT_UNKNOWN);
  assert.equal(journeys[0].outcome, JOURNEY_OUTCOME.ATTEMPT_UNKNOWN);
  assert.equal(summary.journeys.abandoned, 0);
  assert.equal(summary.journeys.failed, 0);
});

test("PaymentIntent without a Charge is one 3-D Secure attempt (failed or incomplete)", () => {
  const p1 = piId();
  const p2 = piId();
  const { sessions, summary } = analyze(
    [session({ meta: META.fixed(901), created: NOW - 5 * DAY, pi: p1 }), session({ meta: META.fixed(902), created: NOW - 5 * DAY, pi: p2 })],
    [],
    [
      { id: p1, created: NOW - 5 * DAY + 10, status: "canceled", last_payment_error: { code: "payment_intent_authentication_failure" } },
      { id: p2, created: NOW - 5 * DAY + 10, status: "canceled", last_payment_error: null },
    ],
  );
  assert.deepEqual(sessions.map((s) => s.attempts[0].category).sort(), ["authentication_failed", "authentication_incomplete"]);
  assert.deepEqual(summary.attempts.byGroup, { authentication_3ds: 2 });
});

test("population excludes other businesses, non-production hosts and test mode", () => {
  const base = { created: NOW - DAY };
  assert.equal(model.normalizeSession(session({ ...base, meta: {} }), { siteHosts: SITE }).excludedReason, "other_business");
  assert.equal(model.normalizeSession(session({ ...base, meta: META.fixed(), host: "http://localhost:5000" }), { siteHosts: SITE }).excludedReason, "non_production_host");
  assert.equal(model.normalizeSession(session({ ...base, meta: META.fixed(), livemode: false }), { siteHosts: SITE }).excludedReason, "test_mode");
  assert.equal(model.normalizeSession(session({ ...base, meta: META.fixed() }), { siteHosts: SITE }).excludedReason, undefined);
});

test("small samples show counts without a percentage; percentages from 20", () => {
  assert.deepEqual(model.rate(1, 3), { n: 1, d: 3, pct: null, smallSample: true });
  assert.deepEqual(model.rate(5, 20), { n: 5, d: 20, pct: 25, smallSample: false });
  assert.deepEqual(model.durationStats([60, 120]), { n: 2, medianMin: null, p75Min: null, p90Min: null });
  assert.equal(model.durationStats([60, 120, 180]).medianMin, 2);
  const ten = model.durationStats(Array.from({ length: 10 }, (_, i) => (i + 1) * 60));
  assert.equal(ten.medianMin, 5.5);
  assert.equal(ten.p90Min, 9.1);
});

test("failure groups and Amman day parts", () => {
  assert.equal(model.failureGroupOf("radar_blocked_rule"), "blocked_by_fraud_screening");
  assert.equal(model.failureGroupOf("issuer_generic_decline"), "card_declined");
  assert.equal(model.failureGroupOf("issuer_partner_insufficient_funds"), "insufficient_funds");
  assert.equal(model.failureGroupOf("issuer_payment_intent_redirect_payment_method_failure"), "authentication_3ds");
  assert.equal(model.failureGroupOf("issuer_expired_card"), "expired_card");
  assert.equal(model.ammanDayPart(Date.UTC(2026, 10, 1, 22, 0, 0) / 1000), "00-06");
  assert.equal(model.ammanDayPart(Date.UTC(2026, 10, 1, 10, 0, 0) / 1000), "12-18");
});

// ------------------------------------------------------------------ reconciliation

function emptyLocal(overrides = {}) {
  return {
    orders: new Map(),
    copBySid: new Map(),
    copPendingByOrder: new Map(),
    membershipAttemptBySid: new Map(),
    membershipGrantSids: new Set(),
    trainingBySid: new Map(),
    trainingPendingByKey: new Map(),
    fscsBySid: new Map(),
    fscsOpenByUser: new Map(),
    legacySubBySid: new Map(),
    legacySubscriptionIds: new Set(),
    activationFeeSids: new Set(),
    localPaid: [],
    stalePending: {},
    ...overrides,
  };
}

test("reconciliation: Stripe paid but not granted locally is HIGH; granted is verified", () => {
  const pi1 = piId();
  const pi2 = piId();
  const paidGranted = session({ meta: META.membership(61), created: NOW - DAY, status: "complete", paid: true, pi: pi1 });
  const paidMissing = session({ meta: META.training(62), created: NOW - DAY, status: "complete", paid: true, pi: pi2 });
  const { sessions } = analyze([paidGranted, paidMissing], [charge(pi1, NOW - DAY + 5, { ok: true }), charge(pi2, NOW - DAY + 5, { ok: true })]);
  const local = emptyLocal({ membershipGrantSids: new Set([paidGranted.id]), trainingBySid: new Map([[paidMissing.id, { status: "pending" }]]) });
  const r = service.reconcile({ sessions, local });
  assert.equal(r.checks.succeededSessions, 2);
  assert.equal(r.checks.succeededGranted, 1);
  assert.equal(r.mismatches.stripe_paid_local_not_granted.total, 1);
  assert.equal(r.mismatches.stripe_paid_local_not_granted.severity, "HIGH");
  assert.equal(r.highSeverityFindings, 1);
});

test("reconciliation: local granted without a paid Stripe session is HIGH; stale pending is LOW", () => {
  const expiredPending = session({ meta: META.fixed(701), created: NOW - 3 * DAY });
  const { sessions } = analyze([expiredPending]);
  const local = emptyLocal({
    copBySid: new Map([[expiredPending.id, { status: "pending" }]]),
    orders: new Map([[701, { paymentStatus: "pending" }]]),
    localPaid: [{ sid: "cs_live_unpaidXXXXXXXXXXXX1", source: "training_package_purchases" }],
  });
  const retrievedById = new Map([["cs_live_unpaidXXXXXXXXXXXX1", { status: "expired", payment_status: "unpaid" }]]);
  const r = service.reconcile({ sessions, local, retrievedById });
  assert.equal(r.mismatches.local_granted_stripe_not_paid.total, 1);
  assert.equal(r.mismatches.stripe_expired_local_pending.severity, "LOW");
  assert.equal(r.mismatches.stripe_expired_local_pending.total, 1);
});

test("reconciliation: a paid client-order session whose order no longer exists is HIGH", () => {
  const pi = piId();
  const s = session({ meta: META.fixed(999), created: NOW - DAY, status: "complete", paid: true, pi });
  const { sessions } = analyze([s], [charge(pi, NOW - DAY + 5, { ok: true })]);
  const r = service.reconcile({ sessions, local: emptyLocal() });
  assert.equal(r.mismatches.stripe_paid_order_missing.total, 1);
});

// ------------------------------------------------------------------ end-to-end report (fake Stripe + fake DB)

function asyncList(items) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const x of items) yield x;
    },
  };
}

function fakeStripe({ sessions = [], charges = [], paymentIntents = [], events = [], endpoints = [], retrievable = {} }) {
  const calls = [];
  const forbid = (name) => () => {
    calls.push(name);
    throw new Error(`write call ${name} is forbidden in analytics`);
  };
  const since = (p) => (p && p.created && p.created.gte) || 0;
  return {
    calls,
    checkout: {
      sessions: {
        list: (p) => (calls.push("sessions.list"), asyncList(sessions.filter((s) => s.created >= since(p)))),
        retrieve: async (id) => {
          calls.push("sessions.retrieve");
          if (retrievable[id]) return retrievable[id];
          const err = new Error("No such checkout.session");
          err.code = "resource_missing";
          err.statusCode = 404;
          throw err;
        },
        create: forbid("sessions.create"),
        expire: forbid("sessions.expire"),
        update: forbid("sessions.update"),
      },
    },
    charges: { list: (p) => (calls.push("charges.list"), asyncList(charges.filter((c) => c.created >= since(p)))), create: forbid("charges.create") },
    paymentIntents: { list: (p) => (calls.push("pi.list"), asyncList(paymentIntents.filter((x) => x.created >= since(p)))), cancel: forbid("pi.cancel") },
    events: { list: (p) => (calls.push("events.list"), asyncList(events.filter((e) => e.created >= p.created.gte && e.created <= p.created.lte))) },
    webhookEndpoints: { list: () => (calls.push("endpoints.list"), asyncList(endpoints)), update: forbid("endpoints.update") },
  };
}

function fakeDb(tables = {}) {
  const statements = [];
  const rows = (k) => ({ rows: tables[k] || [] });
  return {
    statements,
    async query(sql) {
      statements.push(sql);
      if (/to_regclass/.test(sql)) return { rows: [{ orders: true, cop: true, mma: true, fmm: true, tpp: true, fscs: true, fsub: true, fee: true, webhook: true }] };
      if (/FROM schema_migrations/.test(sql)) return rows("migrations");
      if (/FROM orders\b/.test(sql)) return rows("orders");
      if (/FROM client_order_payments/.test(sql)) return rows("cop");
      if (/FROM marketplace_membership_checkout_attempts/.test(sql)) return rows("mma");
      if (/FROM freelancer_marketplace_memberships/.test(sql)) return rows("fmm");
      if (/FROM training_package_purchases/.test(sql)) return rows("tpp");
      if (/FROM freelancer_subscription_checkout_sessions/.test(sql)) return rows("fscs");
      if (/FROM freelancer_subscriptions\b/.test(sql)) return rows("fsub");
      if (/FROM subscription_activation_fee_payments/.test(sql)) return rows("fee");
      if (/FROM users u/.test(sql)) return rows("staff");
      if (/stripe_webhook_events GROUP BY status/.test(sql)) return rows("webhookAgg");
      if (/SELECT id, status FROM stripe_webhook_events/.test(sql)) return rows("webhookIds");
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
    },
  };
}

test("end-to-end report: windows, reconciliation, webhook coverage — read-only and identifier-free", async () => {
  const piPaid = piId();
  const piFail = piId();
  const paid = session({ meta: META.membership(71), created: NOW - 2 * DAY, status: "complete", paid: true, pi: piPaid });
  const failed = session({ meta: META.fixed(1001, 72), created: NOW - 20 * DAY, pi: piFail });
  const abandoned = session({ meta: META.training(73), created: NOW - 60 * DAY });
  const otherBusiness = session({ meta: {}, created: NOW - DAY });
  const localQa = session({ meta: META.fixed(1002), created: NOW - DAY, host: "http://localhost:5000" });
  const stripe = fakeStripe({
    sessions: [paid, failed, abandoned, otherBusiness, localQa],
    charges: [charge(piPaid, NOW - 2 * DAY + 90, { ok: true }), charge(piFail, NOW - 20 * DAY + 40, { type: "blocked", reason: "highest_risk_level" })],
    events: [
      { id: "evt_1Q00000000000000000001", type: "checkout.session.completed", created: NOW - 2 * DAY, pending_webhooks: 0 },
      { id: "evt_1Q00000000000000000002", type: "checkout.session.expired", created: NOW - DAY, pending_webhooks: 1 },
      // Older event re-delivered after the endpoint repair, and a type this endpoint does not subscribe to.
      { id: "evt_1Q00000000000000000003", type: "checkout.session.completed", created: NOW - 15 * DAY, pending_webhooks: 0 },
      { id: "evt_1Q00000000000000000004", type: "payment_intent.succeeded", created: NOW - 3 * DAY, pending_webhooks: 0 },
    ],
    endpoints: [{ url: "https://orderzhouse.com/api/stripe/webhook", status: "enabled", enabled_events: ["checkout.session.completed", "checkout.session.expired"], api_version: null }],
  });
  const db = fakeDb({
    fmm: [{ sid: paid.id }],
    orders: [{ id: 1001, created_at: new Date((NOW - 20 * DAY - 30) * 1000), project_type: "fixed", order_status: "pending_payment", payment_status: "pending", stripe_checkout_session_id: failed.id }],
    cop: [{ sid: failed.id, status: "expired", purpose: "fixed_order_creation", order_id: 1001, created_at: new Date((NOW - 20 * DAY) * 1000) }],
    tpp: [{ sid: abandoned.id, status: "cancelled", user_id: 73, package_code: "basic", created_at: new Date((NOW - 60 * DAY) * 1000) }],
    webhookAgg: [{ status: "processed", n: 1, first: new Date((NOW - 10 * DAY) * 1000), last: new Date((NOW - DAY) * 1000), stuck: 0 }],
    webhookIds: [
      { id: "evt_1Q00000000000000000001", status: "processed" },
      { id: "evt_1Q00000000000000000003", status: "processed" },
      { id: "evt_1Q00000000000000000004", status: "processed" },
      { id: "evt_1Q00000000000000000009", status: "processed" },
    ],
    migrations: [{ version: "209_marketplace_membership_checkout_attempts", applied_at: new Date((NOW - 6 * DAY) * 1000) }],
  });

  const report = await service.buildPaymentAnalyticsReport({ stripe, db, nowMs: NOW * 1000, siteHosts: SITE });

  assert.deepEqual(Object.keys(report.windows), ["d7", "d30", "d90"]);
  assert.deepEqual(report.population.excluded, { other_business: 1, non_production_host: 1 });
  assert.equal(report.windows.d7.overall.journeys.succeeded, 1);
  assert.equal(report.windows.d30.overall.journeys.failed, 1);
  assert.equal(report.windows.d90.overall.journeys.abandoned, 1);
  assert.equal(report.windows.d90.overall.journeys.started, 3);
  assert.deepEqual(report.windows.d30.overall.attempts.byGroup, { blocked_by_fraud_screening: 1 });
  assert.equal(report.windows.d30.overall.timeToPay.creationToCheckoutSession.n, 1);
  assert.equal(report.reconciliation.highSeverityFindings, 0);
  assert.equal(report.reconciliation.checks.localPaidVerified, 1);
  assert.equal(report.webhook.coverage.expected, 2);
  assert.equal(report.webhook.coverage.recordedProcessed, 1);
  assert.equal(report.webhook.coverage.notRecordedPendingDelivery, 1);
  assert.deepEqual(report.webhook.localRowsSinceRetention, { total: 4, expected: 1, eventCreatedBeforeCoverage: 1, typeNotSubscribed: 1, notRetainedByStripe: 1 });
  assert.equal(report.recoveryEra.membership.after.sessions, 1);

  // Privacy: fixtures carry session / PaymentIntent / event ids and an e-mail in metadata — none may leak.
  const text = JSON.stringify(report) + renderText(report);
  assert.doesNotMatch(text, /cs_live_|pi_3Q|ch_3Q|evt_1Q|@example\.com/);
  assert.doesNotMatch(text, /"(orderId|actorId|journeyKey|sessionId|paymentIntentId)"/);

  // Read-only: SELECT only, and Stripe list / retrieve only.
  for (const sql of db.statements) assert.match(sql.trim(), /^SELECT/i);
  assert.deepEqual([...new Set(stripe.calls)].sort(), ["charges.list", "endpoints.list", "events.list", "pi.list", "sessions.list"]);
});

test("privacy guard refuses Stripe ids / e-mails but accepts category words", () => {
  assert.throws(() => service.assertNoIdentifiers({ x: "cs_live_a1B2c3D4e5F6g7H8i9J0" }), { code: "PAYMENT_ANALYTICS_PRIVACY_GUARD" });
  assert.throws(() => service.assertNoIdentifiers({ x: "user@example.com" }), { code: "PAYMENT_ANALYTICS_PRIVACY_GUARD" });
  assert.throws(() => service.assertNoIdentifiers({ x: "pi_3Q1234567890abcdefgh" }), { code: "PAYMENT_ANALYTICS_PRIVACY_GUARD" });
  assert.doesNotThrow(() =>
    service.assertNoIdentifiers({ a: "in_progress", b: "retry_after_failure", c: "issuer_insufficient_funds", d: "expired_without_attempt", e: "2026-11-02T12:00:00.000Z" }),
  );
});

test("site hosts come from configured public URLs, never localhost", () => {
  const hosts = service.siteHostsFromEnv({ CLIENT_URL: "https://orderzhouse.com", BACKEND_PUBLIC_URL: "https://api.orderzhouse.com", FRONTEND_URL: "http://localhost:5173" });
  assert.deepEqual([...hosts].sort(), ["api.orderzhouse.com", "orderzhouse.com"]);
});

test("analytics sources never write: no INSERT/UPDATE/DELETE and no Stripe mutation calls", () => {
  for (const file of ["../src/services/paymentFunnelAnalyticsModel.js", "../src/services/paymentFunnelAnalyticsService.js", "../scripts/paymentAnalyticsReport.js"]) {
    const src = fs.readFileSync(path.join(__dirname, file), "utf8");
    assert.doesNotMatch(src, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE)\b/i, file);
    assert.doesNotMatch(src, /\.(create|update|expire|cancel|confirm|capture|del)\(/, file);
  }
  const cli = fs.readFileSync(path.join(__dirname, "../scripts/paymentAnalyticsReport.js"), "utf8");
  assert.match(cli, /BEGIN READ ONLY/);
  assert.match(cli, /ROLLBACK/);
});
