/**
 * Payment Analytics R2 — READ-ONLY report builder (Stripe objects + local payment tables).
 *
 * Sources of truth:
 *   Stripe Checkout Session  — session lifecycle (open / complete+paid / expired) and whether a payment was ever
 *                              attempted (a PaymentIntent exists only after the buyer submitted a payment method).
 *   Stripe Charge            — every payment attempt and its outcome category (decline / Radar / 3-D Secure).
 *   Local tables             — entitlement / business state: freelancer_marketplace_memberships (grant),
 *                              training_package_purchases, client_order_payments + orders, legacy subscription
 *                              tables; ledgers (marketplace_membership_checkout_attempts, training purchases)
 *                              also record creations that never reached Stripe.
 *   stripe_webhook_events    — delivery / processing health only (it stores ids and status, not payloads).
 *
 * Never writes: Stripe calls are list/retrieve only; SQL is SELECT only (callers run it inside a READ ONLY
 * transaction). Output is aggregate (counts / rates / durations / enumerated categories) and is checked for
 * identifiers before it is returned.
 */

const model = require("./paymentFunnelAnalyticsModel");

const { DAY_SECONDS, SESSION_STATE } = model;
/** Stripe keeps Events for 30 days. */
const STRIPE_EVENT_RETENTION_DAYS = 30;
/** Bounded extra Stripe retrieves for locally-paid sessions outside the listing window. */
const MAX_PAID_SESSION_RETRIEVES = 100;
/** A local pending row older than session lifetime (24 h) + grace is stale. */
const STALE_PENDING_HOURS = 25;

const toSec = (v) => (v == null ? null : Math.floor(new Date(v).getTime() / 1000));
const inc = (o, k, n = 1) => {
  o[k] = (o[k] || 0) + n;
};
const idOf = (v) => (v && typeof v === "object" ? v.id || null : v || null);

function canonicalFlow(flow) {
  return flow === "membership_special_offer" ? "special_offer" : flow;
}

function siteHostsFromEnv(env = process.env) {
  const hosts = new Set();
  for (const raw of [env.CLIENT_URL, env.BACKEND_PUBLIC_URL, env.FRONTEND_URL]) {
    for (const part of String(raw || "").split(",")) {
      try {
        const h = new URL(part.trim()).host.replace(/^www\./, "");
        if (h && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h)) hosts.add(h);
      } catch {
        /* not a URL */
      }
    }
  }
  if (!hosts.size) hosts.add("orderzhouse.com");
  return hosts;
}

async function listAll(iterable) {
  const out = [];
  for await (const x of iterable) out.push(x);
  return out;
}

/** Read-only Stripe listing for the horizon (sessions, charges, PaymentIntents). */
async function loadStripeSources(stripe, { fromSec }) {
  const [sessions, charges, paymentIntents] = await Promise.all([
    listAll(stripe.checkout.sessions.list({ created: { gte: fromSec }, limit: 100 })),
    listAll(stripe.charges.list({ created: { gte: fromSec }, limit: 100 })),
    listAll(stripe.paymentIntents.list({ created: { gte: fromSec }, limit: 100 })),
  ]);
  const chargesByPi = new Map();
  for (const c of charges) {
    const pi = idOf(c.payment_intent);
    if (!pi) continue;
    if (!chargesByPi.has(pi)) chargesByPi.set(pi, []);
    chargesByPi.get(pi).push(c);
  }
  const paymentIntentsById = new Map(paymentIntents.map((p) => [p.id, p]));
  return { sessions, chargesByPi, paymentIntentsById };
}

/**
 * Local read-only snapshot (one statement per table, bounded by the horizon; ~12 statements in total —
 * each Production round trip costs ~95 ms, so no per-row queries).
 * @param {{ query: Function }} db  a client inside BEGIN READ ONLY (or any query runner)
 */
async function loadLocalSources(db, { fromSec, actorIds = [], nowSec = Math.floor(Date.now() / 1000) }) {
  const from = new Date(fromSec * 1000);
  const { rows: availRows } = await db.query(
    `SELECT to_regclass('public.orders') IS NOT NULL AS orders,
            to_regclass('public.client_order_payments') IS NOT NULL AS cop,
            to_regclass('public.marketplace_membership_checkout_attempts') IS NOT NULL AS mma,
            to_regclass('public.freelancer_marketplace_memberships') IS NOT NULL AS fmm,
            to_regclass('public.training_package_purchases') IS NOT NULL AS tpp,
            to_regclass('public.freelancer_subscription_checkout_sessions') IS NOT NULL AS fscs,
            to_regclass('public.freelancer_subscriptions') IS NOT NULL AS fsub,
            to_regclass('public.subscription_activation_fee_payments') IS NOT NULL AS fee,
            to_regclass('public.stripe_webhook_events') IS NOT NULL AS webhook`,
  );
  const has = availRows[0] || {};
  const local = {
    available: { ...has },
    orders: new Map(),
    copBySid: new Map(),
    copPendingByOrder: new Map(),
    membershipAttemptBySid: new Map(),
    membershipCreationsWithoutSession: [],
    membershipGrantSids: new Set(),
    trainingBySid: new Map(),
    trainingCreationsWithoutSession: [],
    trainingPendingByKey: new Map(),
    fscsBySid: new Map(),
    fscsOpenByUser: new Map(),
    legacySubBySid: new Map(),
    legacySubscriptionIds: new Set(),
    activationFeeSids: new Set(),
    localPaid: [],
    stalePending: {},
    staffActorIds: new Set(),
    webhook: null,
    ledgerSince: {},
  };
  const staleBefore = nowSec - STALE_PENDING_HOURS * 3600;
  {
    const { rows } = await db.query(
      `SELECT version, applied_at FROM schema_migrations
        WHERE version IN ('209_marketplace_membership_checkout_attempts', '211_client_order_payment_recovery')`,
    );
    for (const r of rows) {
      if (r.version.startsWith("209_")) local.ledgerSince.membership = toSec(r.applied_at);
      if (r.version.startsWith("211_")) local.ledgerSince.clientOrder = toSec(r.applied_at);
    }
  }
  const markStale = (table, createdSec) => {
    if (createdSec != null && createdSec < staleBefore) inc(local.stalePending, table);
  };

  if (has.orders) {
    const { rows } = await db.query(
      `SELECT id, created_at, project_type, order_status, payment_status, stripe_checkout_session_id
         FROM orders
        WHERE source_type = 'client_created'
          AND (created_at >= $1 OR payment_status = 'paid' OR order_status IN ('pending_payment', 'awaiting_payment_after_bid_selection'))`,
      [from],
    );
    for (const r of rows) {
      local.orders.set(Number(r.id), {
        createdAt: toSec(r.created_at),
        projectType: r.project_type,
        orderStatus: r.order_status,
        paymentStatus: r.payment_status,
        hasSession: Boolean(r.stripe_checkout_session_id),
      });
      if (r.payment_status === "paid" && r.stripe_checkout_session_id) {
        local.localPaid.push({ sid: String(r.stripe_checkout_session_id), source: "orders" });
      }
    }
  }
  if (has.cop) {
    const { rows } = await db.query(
      `SELECT provider_checkout_session_id AS sid, status, purpose, order_id, created_at
         FROM client_order_payments
        WHERE created_at >= $1 OR status IN ('pending', 'paid')`,
      [from],
    );
    for (const r of rows) {
      if (r.sid) local.copBySid.set(String(r.sid), { status: r.status, purpose: r.purpose });
      if (r.status === "pending") {
        local.copPendingByOrder.set(Number(r.order_id), (local.copPendingByOrder.get(Number(r.order_id)) || 0) + 1);
        markStale("client_order_payments", toSec(r.created_at));
      }
      if (r.status === "paid" && r.sid) local.localPaid.push({ sid: String(r.sid), source: "client_order_payments" });
    }
  }
  if (has.mma) {
    const { rows } = await db.query(
      `SELECT stripe_checkout_session_id AS sid, status, resolution_reason, plan_code, created_at
         FROM marketplace_membership_checkout_attempts
        WHERE created_at >= $1 OR status = 'pending'`,
      [from],
    );
    for (const r of rows) {
      if (r.sid) local.membershipAttemptBySid.set(String(r.sid), { status: r.status, reason: r.resolution_reason });
      else local.membershipCreationsWithoutSession.push({ at: toSec(r.created_at), planCode: String(r.plan_code || ""), status: r.status });
      if (r.status === "pending") markStale("marketplace_membership_checkout_attempts", toSec(r.created_at));
    }
  }
  if (has.fmm) {
    const { rows } = await db.query(
      `SELECT purchase_payment_reference AS sid
         FROM freelancer_marketplace_memberships
        WHERE purchase_payment_reference IS NOT NULL AND source = 'stripe'`,
    );
    for (const r of rows) {
      local.membershipGrantSids.add(String(r.sid));
      local.localPaid.push({ sid: String(r.sid), source: "freelancer_marketplace_memberships" });
    }
  }
  if (has.tpp) {
    const { rows } = await db.query(
      `SELECT stripe_checkout_session_id AS sid, status, user_id, package_code, created_at
         FROM training_package_purchases
        WHERE created_at >= $1 OR status IN ('pending', 'paid')`,
      [from],
    );
    for (const r of rows) {
      if (r.sid) local.trainingBySid.set(String(r.sid), { status: r.status });
      else local.trainingCreationsWithoutSession.push({ at: toSec(r.created_at), packageCode: String(r.package_code || "") });
      if (r.status === "pending") {
        const k = `${r.user_id}:${r.package_code}`;
        local.trainingPendingByKey.set(k, (local.trainingPendingByKey.get(k) || 0) + 1);
        markStale("training_package_purchases", toSec(r.created_at));
      }
      if (r.status === "paid" && r.sid) local.localPaid.push({ sid: String(r.sid), source: "training_package_purchases" });
    }
  }
  if (has.fscs) {
    const { rows } = await db.query(
      `SELECT stripe_session_id AS sid, status, checkout_kind, freelancer_user_id, created_at
         FROM freelancer_subscription_checkout_sessions
        WHERE created_at >= $1 OR status IN ('open', 'completed')`,
      [from],
    );
    for (const r of rows) {
      local.fscsBySid.set(String(r.sid), { status: r.status, kind: r.checkout_kind });
      if (r.status === "open") {
        local.fscsOpenByUser.set(Number(r.freelancer_user_id), (local.fscsOpenByUser.get(Number(r.freelancer_user_id)) || 0) + 1);
        markStale("freelancer_subscription_checkout_sessions", toSec(r.created_at));
      }
    }
  }
  if (has.fsub) {
    const { rows } = await db.query(
      `SELECT stripe_session_id AS sid, stripe_subscription_id AS sub, payment_status
         FROM freelancer_subscriptions
        WHERE stripe_session_id IS NOT NULL OR stripe_subscription_id IS NOT NULL`,
    );
    for (const r of rows) {
      if (r.sid) {
        local.legacySubBySid.set(String(r.sid), { paymentStatus: r.payment_status });
        if (r.payment_status === "paid") local.localPaid.push({ sid: String(r.sid), source: "freelancer_subscriptions" });
      }
      if (r.sub) local.legacySubscriptionIds.add(String(r.sub));
    }
  }
  if (has.fee) {
    const { rows } = await db.query(
      `SELECT stripe_session_id AS sid FROM subscription_activation_fee_payments
        WHERE source = 'stripe' AND stripe_session_id IS NOT NULL`,
    );
    for (const r of rows) {
      local.activationFeeSids.add(String(r.sid));
      local.localPaid.push({ sid: String(r.sid), source: "subscription_activation_fee_payments" });
    }
  }
  if (actorIds.length) {
    const { rows } = await db.query(
      `SELECT u.id FROM users u
        WHERE u.id = ANY($1::bigint[])
          AND (u.role IN ('admin', 'super_admin')
               OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                           WHERE ur.user_id = u.id AND r.name IN ('admin', 'super_admin')))`,
      [actorIds],
    );
    for (const r of rows) local.staffActorIds.add(Number(r.id));
  }
  if (has.webhook) {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS n, MIN(received_at) AS first, MAX(received_at) AS last,
              COUNT(*) FILTER (WHERE status = 'processing' AND received_at < NOW() - INTERVAL '10 minutes')::int AS stuck
         FROM stripe_webhook_events GROUP BY status`,
    );
    const byStatus = {};
    let first = null;
    let last = null;
    let stuck = 0;
    for (const r of rows) {
      byStatus[r.status] = r.n;
      stuck += r.stuck;
      const f = toSec(r.first);
      const l = toSec(r.last);
      if (f != null && (first == null || f < first)) first = f;
      if (l != null && (last == null || l > last)) last = l;
    }
    const retentionFrom = nowSec - STRIPE_EVENT_RETENTION_DAYS * DAY_SECONDS + 3600;
    const idsFrom = new Date(Math.max(first || 0, retentionFrom) * 1000);
    const { rows: idRows } = await db.query(
      `SELECT id, status FROM stripe_webhook_events WHERE received_at >= $1`,
      [idsFrom],
    );
    local.webhook = { byStatus, stuckProcessing: stuck, firstReceivedAt: first, lastReceivedAt: last, statusById: new Map(idRows.map((r) => [String(r.id), r.status])) };
  }
  return local;
}

/** Local entitlement / pending state for one Stripe session (null = not checkable for this flow). */
function localStateOf(ns, local) {
  const sid = ns.sessionId;
  switch (ns.purpose) {
    case "marketplace_membership_checkout": {
      const att = local.membershipAttemptBySid.get(sid) || null;
      return { granted: local.membershipGrantSids.has(sid), pending: att?.status === "pending", resolved: Boolean(att && att.status !== "pending" && att.status !== "paid") };
    }
    case "training_package_purchase": {
      const row = local.trainingBySid.get(sid) || null;
      return { granted: row?.status === "paid", pending: row?.status === "pending", resolved: Boolean(row && (row.status === "cancelled" || row.status === "failed")) };
    }
    case "client_fixed_order":
    case "client_selected_bid": {
      const cop = local.copBySid.get(sid) || null;
      const order = ns.orderId ? local.orders.get(ns.orderId) : null;
      return {
        granted: cop?.status === "paid" || order?.paymentStatus === "paid",
        pending: cop?.status === "pending",
        resolved: cop?.status === "expired",
        orderMissing: !order,
      };
    }
    case "freelancer_subscription_purchase": {
      const f = local.fscsBySid.get(sid);
      return { granted: local.legacySubBySid.get(sid)?.paymentStatus === "paid" || f?.status === "completed", pending: f?.status === "open", resolved: Boolean(f && (f.status === "expired" || f.status === "superseded")) };
    }
    case "freelancer_activation_fee_only": {
      const f = local.fscsBySid.get(sid);
      return { granted: local.activationFeeSids.has(sid) || f?.status === "completed", pending: f?.status === "open", resolved: Boolean(f && (f.status === "expired" || f.status === "superseded")) };
    }
    case "freelancer_recurring_subscription": {
      const f = local.fscsBySid.get(sid);
      return { granted: f?.status === "completed" || (ns.subscriptionId != null && local.legacySubscriptionIds.has(ns.subscriptionId)), pending: f?.status === "open", resolved: Boolean(f && (f.status === "expired" || f.status === "superseded")) };
    }
    default:
      return { granted: null, pending: false, resolved: false };
  }
}

const SEVERITY = Object.freeze({
  stripe_paid_local_not_granted: "HIGH",
  local_granted_stripe_not_paid: "HIGH",
  local_granted_session_not_found: "HIGH",
  stripe_paid_order_missing: "HIGH",
  stripe_processing: "INFO",
  stripe_expired_local_pending: "LOW",
  stripe_open_local_closed: "LOW",
  duplicate_local_pending: "LOW",
});

/**
 * Stripe ↔ local reconciliation (aggregates only).
 * @param {{ sessions: object[], local: object, retrievedById: Map<string, object> }} input
 *   sessions: enriched included sessions; retrievedById: Stripe sessions fetched for local paid rows outside the listing
 */
function reconcile({ sessions, local, retrievedById = new Map(), journeys = [] }) {
  const mismatches = {};
  const add = (type, flow) => {
    if (!mismatches[type]) mismatches[type] = { severity: SEVERITY[type] || "INFO", total: 0, byFlow: {} };
    mismatches[type].total += 1;
    inc(mismatches[type].byFlow, flow);
  };
  const byId = new Map(sessions.map((s) => [s.sessionId, s]));
  const checks = { sessionsChecked: 0, succeededSessions: 0, succeededGranted: 0, notCheckable: 0, localPaidRows: 0, localPaidVerified: 0 };
  for (const s of sessions) {
    checks.sessionsChecked += 1;
    const st = localStateOf(s, local);
    if (st.granted == null) {
      checks.notCheckable += 1;
      continue;
    }
    if (s.state === SESSION_STATE.SUCCEEDED) {
      checks.succeededSessions += 1;
      if (st.granted) checks.succeededGranted += 1;
      else if (st.orderMissing) add("stripe_paid_order_missing", s.flow);
      else add("stripe_paid_local_not_granted", s.flow);
    } else if (s.state === SESSION_STATE.PROCESSING) {
      add("stripe_processing", s.flow);
    } else if (s.state === SESSION_STATE.OPEN) {
      if (st.resolved) add("stripe_open_local_closed", s.flow);
    } else if (st.pending) {
      add("stripe_expired_local_pending", s.flow);
    }
  }
  // Local says paid → Stripe must say paid (deduplicated by session: one purchase can appear in two tables).
  const seen = new Set();
  for (const row of local.localPaid) {
    if (seen.has(row.sid)) continue;
    seen.add(row.sid);
    checks.localPaidRows += 1;
    const listed = byId.get(row.sid);
    const raw = listed ? null : retrievedById.get(row.sid);
    if (!listed && retrievedById.has(row.sid) && raw == null) {
      add("local_granted_session_not_found", row.source);
      continue;
    }
    const paid = listed ? listed.state === SESSION_STATE.SUCCEEDED : raw ? raw.status === "complete" && (raw.payment_status === "paid" || raw.payment_status === "no_payment_required") : null;
    if (paid === true) checks.localPaidVerified += 1;
    else if (paid === false) add("local_granted_stripe_not_paid", row.source);
  }
  for (const n of local.copPendingByOrder.values()) if (n > 1) add("duplicate_local_pending", "client_order_payments");
  for (const n of local.trainingPendingByKey.values()) if (n > 1) add("duplicate_local_pending", "training_package_purchases");
  for (const n of local.fscsOpenByUser.values()) if (n > 1) add("duplicate_local_pending", "freelancer_subscription_checkout_sessions");

  const multipleSessionsSameObject = {};
  for (const j of journeys) if (j.sessionCount > 1) inc(multipleSessionsSameObject, j.group);
  const highFindings = Object.entries(mismatches).filter(([, v]) => v.severity === "HIGH").reduce((a, [, v]) => a + v.total, 0);
  return { checks, mismatches, multipleSessionsSameObject, stalePendingLocalRows: { ...local.stalePending }, highSeverityFindings: highFindings };
}

/** Webhook delivery / processing coverage for events Stripe still retains (30 days). */
async function webhookHealth(stripe, local, { siteHosts, nowSec }) {
  if (!local.webhook) return { available: false };
  const endpoints = (await listAll(stripe.webhookEndpoints.list({ limit: 100 }))).filter((e) => {
    try {
      return siteHosts.has(new URL(e.url).host.replace(/^www\./, ""));
    } catch {
      return false;
    }
  });
  const enabled = new Set(endpoints.flatMap((e) => e.enabled_events || []));
  const wildcard = enabled.has("*");
  const retentionFrom = nowSec - STRIPE_EVENT_RETENTION_DAYS * DAY_SECONDS + 3600;
  const since = Math.max(local.webhook.firstReceivedAt || nowSec, retentionFrom);
  // Events created in the last 10 minutes may still be in flight.
  const retained = await listAll(stripe.events.list({ created: { gte: retentionFrom, lte: nowSec - 600 }, limit: 100 }));
  const events = retained.filter((e) => e.created >= since && (wildcard || enabled.has(e.type)));
  // Explain local rows that are not "expected" (never forced to match): redelivered / replayed older events,
  // types this endpoint does not subscribe to (another delivery source), or events Stripe no longer retains.
  const retainedById = new Map(retained.map((e) => [e.id, e]));
  const expectedIds = new Set(events.map((e) => e.id));
  const localRows = { total: local.webhook.statusById.size, expected: 0, eventCreatedBeforeCoverage: 0, typeNotSubscribed: 0, notRetainedByStripe: 0 };
  for (const id of local.webhook.statusById.keys()) {
    const e = retainedById.get(id);
    if (expectedIds.has(id)) localRows.expected += 1;
    else if (!e) localRows.notRetainedByStripe += 1;
    else if (!(wildcard || enabled.has(e.type))) localRows.typeNotSubscribed += 1;
    else localRows.eventCreatedBeforeCoverage += 1;
  }
  const byType = {};
  const out = { expected: events.length, recordedProcessed: 0, recordedFailed: 0, recordedProcessing: 0, notRecorded: 0, notRecordedPendingDelivery: 0 };
  for (const e of events) {
    const st = local.webhook.statusById.get(e.id);
    const t = (byType[e.type] = byType[e.type] || { expected: 0, processed: 0 });
    t.expected += 1;
    if (st === "processed") {
      out.recordedProcessed += 1;
      t.processed += 1;
    } else if (st === "failed") out.recordedFailed += 1;
    else if (st === "processing") out.recordedProcessing += 1;
    else {
      out.notRecorded += 1;
      if (Number(e.pending_webhooks) > 0) out.notRecordedPendingDelivery += 1;
    }
  }
  return {
    available: true,
    endpoints: endpoints.map((e) => ({ status: e.status, enabledEvents: (e.enabled_events || []).length, apiVersion: e.api_version || null })),
    local: { byStatus: local.webhook.byStatus, stuckProcessing: local.webhook.stuckProcessing, firstReceivedAt: local.webhook.firstReceivedAt ? new Date(local.webhook.firstReceivedAt * 1000).toISOString() : null },
    coverageSince: new Date(since * 1000).toISOString(),
    coverage: out,
    localRowsSinceRetention: localRows,
    byType,
  };
}

// Stripe object ids (prefix + ≥14 chars with a digit — never matches category words like "in_progress") or e-mails.
const IDENTIFIER_RE =
  /\b(?:cs_(?:live|test)|pi|ch|cus|evt|sub|in|pm|py|re|we|seti|txn|acct|price|prod)_(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{14,}\b|@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
/** Defence in depth: the report must not carry Stripe ids or e-mail addresses. */
function assertNoIdentifiers(report) {
  const text = JSON.stringify(report);
  if (IDENTIFIER_RE.test(text)) {
    const err = new Error("payment analytics report contains an identifier; refusing to output it");
    err.code = "PAYMENT_ANALYTICS_PRIVACY_GUARD";
    throw err;
  }
  return report;
}

function localCreationsWithoutSession(local, nowSec) {
  const out = [];
  const membershipFlow = (code) => {
    const c = String(code || "").toLowerCase();
    if (c === "annual_basic") return "annual_silver";
    if (c === "special_offer") return "special_offer";
    return c ? `membership_${c}` : "membership";
  };
  for (const r of local.membershipCreationsWithoutSession) {
    // A row with no session can be mid-creation for a few seconds; only count settled ones.
    if (r.status === "pending" && nowSec - r.at < 600) continue;
    const flow = membershipFlow(r.planCode);
    out.push({ at: r.at, flow, group: "membership", billingTerm: model.billingTermOf(flow), channel: "web" });
  }
  for (const r of local.trainingCreationsWithoutSession) out.push({ at: r.at, flow: "training", group: "training", billingTerm: null, channel: "web" });
  for (const o of local.orders.values()) {
    if (o.hasSession) continue;
    if (o.projectType === "fixed" && o.orderStatus === "pending_payment") out.push({ at: o.createdAt, flow: "client_fixed", group: "client_order", billingTerm: null, channel: null });
    if (o.orderStatus === "awaiting_payment_after_bid_selection") out.push({ at: o.createdAt, flow: "client_selected_bid", group: "selected_bid", billingTerm: null, channel: null });
  }
  return out;
}

/**
 * Build the full report.
 * @param {{ stripe: object, db: { query: Function }, nowMs?: number, windowsDays?: number[], lookbackDays?: number,
 *           gapDays?: number, siteHosts?: Set<string>, includeWebhook?: boolean }} opts
 */
async function buildPaymentAnalyticsReport(opts) {
  const { stripe, db } = opts;
  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const windowsDays = (opts.windowsDays || [7, 30, 90]).filter((d) => Number.isInteger(d) && d > 0);
  const lookbackDays = opts.lookbackDays ?? 30;
  const siteHosts = opts.siteHosts || siteHostsFromEnv();
  const fromSec = nowSec - (Math.max(...windowsDays) + lookbackDays) * DAY_SECONDS;

  const stripeData = await loadStripeSources(stripe, { fromSec });
  const excluded = {};
  const normalized = [];
  for (const s of stripeData.sessions) {
    const n = model.normalizeSession(s, { siteHosts });
    if (n.excludedReason) inc(excluded, n.excludedReason);
    else normalized.push({ ...n, flow: canonicalFlow(n.flow) });
  }
  const sessions = model.enrichSessions(normalized, stripeData, nowSec);
  const actorIds = [...new Set(sessions.map((s) => s.actorId).filter(Boolean))];
  const local = await loadLocalSources(db, { fromSec, actorIds, nowSec });

  const objectCreatedAtByOrder = new Map([...local.orders.entries()].map(([id, o]) => [id, o.createdAt]));
  const journeys = model.buildJourneys(sessions, { gapDays: opts.gapDays, objectCreatedAtByOrder });
  const creations = localCreationsWithoutSession(local, nowSec);

  const windows = {};
  for (const d of windowsDays) {
    const from = nowSec - d * DAY_SECONDS;
    const w = model.summarizeWindow({ journeys, sessions, localCreations: creations, fromSec: from, toSec: nowSec + 1 });
    const staffJourneys = journeys.filter((j) => j.startedAt >= from && j.actorId && local.staffActorIds.has(j.actorId));
    windows[`d${d}`] = {
      from: new Date(from * 1000).toISOString(),
      to: new Date(nowSec * 1000).toISOString(),
      ...w,
      internalStaffJourneys: { total: staffJourneys.length, succeeded: staffJourneys.filter((j) => j.succeeded).length },
    };
  }

  // Duplicate sessions before / after the per-object recovery ledgers (evidence the recovery fixes work).
  const maxFrom = nowSec - Math.max(...windowsDays) * DAY_SECONDS;
  const recoveryEra = {};
  const eraFor = (group, sinceSec) => {
    if (!sinceSec) return;
    const inGroup = sessions.filter((s) => s.group === group && s.created >= maxFrom);
    const part = (list) => ({ sessions: list.length, duplicates: list.filter((s) => s.role === model.SESSION_ROLE.DUPLICATE).length });
    recoveryEra[group] = { ledgerSince: new Date(sinceSec * 1000).toISOString().slice(0, 10), before: part(inGroup.filter((s) => s.created < sinceSec)), after: part(inGroup.filter((s) => s.created >= sinceSec)) };
  };
  eraFor("membership", local.ledgerSince.membership);
  eraFor("client_order", local.ledgerSince.clientOrder);

  // Locally-paid sessions outside the listing: bounded retrieves so local→Stripe is checked for all history.
  const listedIds = new Set(sessions.map((s) => s.sessionId));
  const retrievedById = new Map();
  for (const row of local.localPaid) {
    if (listedIds.has(row.sid) || retrievedById.has(row.sid) || retrievedById.size >= MAX_PAID_SESSION_RETRIEVES) continue;
    try {
      retrievedById.set(row.sid, await stripe.checkout.sessions.retrieve(row.sid));
    } catch (err) {
      retrievedById.set(row.sid, err?.code === "resource_missing" || Number(err?.statusCode) === 404 ? null : undefined);
      if (retrievedById.get(row.sid) === undefined) retrievedById.delete(row.sid);
    }
  }
  const reconciliation = reconcile({ sessions, local, retrievedById, journeys });

  let firstPartyFunnel = { available: false };
  try {
    const telemetrySvc = require("./paymentCheckoutFunnelTelemetry");
    const { summarizeFirstPartyFunnel } = require("./paymentCheckoutFunnelReport");
    const telemetry = await telemetrySvc.loadFunnelTelemetryAggregates(db, {
      fromSec: Math.max(fromSec, 0),
      toSec: nowSec + 1,
    });
    // Enrich redirected_then_expired_without_attempt using Stripe session states when ids align.
    const stripeByCs = new Map(sessions.map((s) => [s.sessionId, s]));
    let redirectedThenExpiredWithoutAttempt = 0;
    for (const row of telemetry.sessions || []) {
      // sessions aggregate has no stripe id exported (PII-safe); compute from byType only in summarize.
      void row;
    }
    firstPartyFunnel = summarizeFirstPartyFunnel(telemetry, { stripeSessionsById: stripeByCs });
    // Cross-check: sessions with redirect in telemetry window matching Stripe expired_without_attempt
    // is left for a future join when we store anonymized session hashes; keep placeholder count 0 unless
    // we can safely join. Prefer explicit Stripe financial truth in windows.*.
    void redirectedThenExpiredWithoutAttempt;
  } catch {
    firstPartyFunnel = { available: false, error: "telemetry_load_failed" };
  }

  const report = {
    generatedAt: new Date(nowSec * 1000).toISOString(),
    definitions: {
      journey: "one buyer paying for one business object (order / plan / package); ends at first success; actor-scoped journeys split after a success or " + `${opts.gapDays ?? model.JOURNEY_GAP_DAYS} days without activity`,
      session: "one Stripe Checkout Session (reloads / double clicks / Continue payment of an open session reuse it)",
      attempt: "one Stripe Charge (or one PaymentIntent stopped at 3-D Secure without a Charge)",
      abandoned: "session expired with no PaymentIntent (no payment method was ever submitted) — never counted as a failure",
      checkoutOpened: "partially closed by first-party checkout_redirect_started (proves OrderzHouse handoff, NOT that Stripe rendered)",
      cancelled: "checkout_cancel_returned distinguishes explicit Stripe cancel_url return; expiry without return remains Stripe-side",
      ratesShownFrom: model.MIN_RATE_DENOMINATOR,
      firstPartyEvents: "checkout_requested | checkout_session_created | checkout_redirect_started | checkout_cancel_returned | checkout_success_returned — telemetry only, never entitlement",
    },
    population: {
      siteHosts: [...siteHosts],
      horizonFrom: new Date(fromSec * 1000).toISOString(),
      stripeSessionsListed: stripeData.sessions.length,
      included: sessions.length,
      excluded,
      journeys: journeys.length,
    },
    windows,
    recoveryEra,
    reconciliation,
    firstPartyFunnel,
    webhook: opts.includeWebhook === false ? { skipped: true } : await webhookHealth(stripe, local, { siteHosts, nowSec }),
  };
  return assertNoIdentifiers(report);
}

module.exports = {
  STALE_PENDING_HOURS,
  siteHostsFromEnv,
  loadStripeSources,
  loadLocalSources,
  localStateOf,
  reconcile,
  webhookHealth,
  assertNoIdentifiers,
  localCreationsWithoutSession,
  buildPaymentAnalyticsReport,
};
