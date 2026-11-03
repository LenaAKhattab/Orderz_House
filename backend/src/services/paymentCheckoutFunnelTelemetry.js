/**
 * First-party payment checkout funnel telemetry (R2B).
 * Analytics only — never grants entitlements or changes financial state.
 */

const { paymentFlowOf } = require("./stripePaymentFunnelLog");

function getPool() {
  return require("../config/db").pool;
}

const EVENT_TYPES = Object.freeze([
  "checkout_requested",
  "checkout_session_created",
  "checkout_redirect_started",
  "checkout_cancel_returned",
  "checkout_success_returned",
]);

const CLIENT_EMITTABLE = Object.freeze([
  "checkout_redirect_started",
  "checkout_cancel_returned",
  "checkout_success_returned",
]);

const LOCALES = Object.freeze(new Set(["ar", "en", "de", "nl", "ro"]));
const CHANNELS = Object.freeze(new Set(["web", "mobile"]));

const SESSION_ID_RE = /^cs_[A-Za-z0-9_]+$/;

function normalizeEventType(raw) {
  const s = String(raw || "").trim();
  return EVENT_TYPES.includes(s) ? s : null;
}

function normalizeChannel(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "mobile_app" || s === "app" || s === "flutter") return "mobile";
  return CHANNELS.has(s) ? s : null;
}

function normalizeLocale(raw) {
  if (raw == null || raw === "") return null;
  const primary = String(raw)
    .trim()
    .toLowerCase()
    .split(",")[0]
    .split(";")[0]
    .trim()
    .split("-")[0]
    .slice(0, 5);
  return LOCALES.has(primary) ? primary : null;
}

function normalizeSessionId(raw) {
  const s = String(raw || "").trim();
  return SESSION_ID_RE.test(s) ? s : null;
}

function normalizeFlow(raw) {
  const s = String(raw || "").trim().toLowerCase().slice(0, 64);
  if (!s) return "other";
  if (/^[a-z][a-z0-9_]{0,62}$/.test(s)) return s;
  return "other";
}

function normalizeLocalRef(raw) {
  const s = String(raw || "").trim().slice(0, 96);
  if (!s) return null;
  if (/^(mca|cop|tpp|bcp|fscs|sess):\S{1,80}$/.test(s)) return s;
  return null;
}

function localRefFromParts({ kind, id, sessionId }) {
  if (kind && id != null && String(id).trim()) {
    return normalizeLocalRef(`${kind}:${String(id).trim()}`);
  }
  if (sessionId) return normalizeLocalRef(`sess:${sessionId}`);
  return null;
}

/**
 * Best-effort insert. Idempotent via unique (event_type, coalesce(session, local_ref)).
 * @returns {Promise<{ recorded: boolean, duplicate?: boolean, error?: string }>}
 */
async function recordFunnelEvent(input, db = getPool()) {
  const eventType = normalizeEventType(input.eventType);
  if (!eventType) return { recorded: false, error: "INVALID_EVENT_TYPE" };

  const channel = normalizeChannel(input.channel) || "web";
  const locale = normalizeLocale(input.locale);
  const sessionId = normalizeSessionId(input.stripeCheckoutSessionId);
  const paymentFlow = normalizeFlow(input.paymentFlow);
  const actorUserId = Number(input.actorUserId);
  if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
    return { recorded: false, error: "INVALID_ACTOR" };
  }

  let localRef = normalizeLocalRef(input.localRef);
  if (!localRef) {
    localRef = localRefFromParts({
      kind: input.localRefKind,
      id: input.localRefId,
      sessionId,
    });
  }
  if (!localRef && sessionId) localRef = `sess:${sessionId}`;
  if (!localRef) return { recorded: false, error: "INVALID_LOCAL_REF" };

  // Client return/redirect events require a session id.
  if (CLIENT_EMITTABLE.includes(eventType) && !sessionId) {
    return { recorded: false, error: "SESSION_REQUIRED" };
  }

  try {
    const { rowCount } = await db.query(
      `INSERT INTO payment_checkout_funnel_events
         (event_type, payment_flow, channel, locale, stripe_checkout_session_id, local_ref, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_type, dedupe_key) DO NOTHING`,
      [eventType, paymentFlow, channel, locale, sessionId, localRef, actorUserId],
    );
    return { recorded: rowCount > 0, duplicate: rowCount === 0 };
  } catch (err) {
    // Table missing mid-rollout or transient DB — never block payment.
    return { recorded: false, error: String(err?.code || err?.message || "DB_ERROR").slice(0, 80) };
  }
}

/** Fire-and-forget server emit (never throws to callers). */
function emitServerFunnelEvent(input, db = getPool()) {
  return recordFunnelEvent(input, db).catch(() => ({ recorded: false, error: "EMIT_FAILED" }));
}

/**
 * Record checkout_requested + checkout_session_created for a known session (create or resume).
 * Best-effort; never throws.
 */
function emitCheckoutSessionLifecycle({
  actorUserId,
  paymentFlow,
  channel = "web",
  locale = null,
  localRef = null,
  sessionId = null,
}) {
  const sid = normalizeSessionId(sessionId);
  const ref = normalizeLocalRef(localRef) || (sid ? `sess:${sid}` : null);
  if (!ref || !actorUserId) return;
  void emitServerFunnelEvent({
    eventType: "checkout_requested",
    paymentFlow,
    channel,
    locale,
    localRef: ref,
    actorUserId,
    // Prefer local_ref dedupe for "requested" so resume with session still counts once per attempt/ref.
    stripeCheckoutSessionId: null,
  });
  if (sid) {
    void emitServerFunnelEvent({
      eventType: "checkout_session_created",
      paymentFlow,
      channel,
      locale,
      localRef: ref,
      actorUserId,
      stripeCheckoutSessionId: sid,
    });
  }
}

/**
 * Authorize that the authenticated user owns the Stripe Checkout Session via local ledgers.
 * @returns {Promise<{ ok: boolean, paymentFlow?: string, localRef?: string, code?: string }>}
 */
async function authorizeSessionOwnership({ userId, sessionId, claimedFlow }, db = getPool()) {
  const uid = Number(userId);
  const sid = normalizeSessionId(sessionId);
  if (!Number.isInteger(uid) || uid <= 0 || !sid) {
    return { ok: false, code: "INVALID_INPUT" };
  }

  const { rows: mca } = await db.query(
    `SELECT id, plan_code FROM marketplace_membership_checkout_attempts
     WHERE stripe_checkout_session_id = $1 AND freelancer_user_id = $2
     LIMIT 1`,
    [sid, uid],
  );
  if (mca[0]) {
    const plan = String(mca[0].plan_code || "").toLowerCase();
    const flow =
      plan === "annual_basic"
        ? "annual_silver"
        : claimedFlow === "special_offer"
          ? "special_offer"
          : plan
            ? `membership_${plan}`
            : "membership";
    return { ok: true, paymentFlow: normalizeFlow(claimedFlow) === "special_offer" ? "special_offer" : flow, localRef: `mca:${mca[0].id}` };
  }

  const { rows: cop } = await db.query(
    `SELECT id, purpose FROM client_order_payments
     WHERE provider_checkout_session_id = $1 AND client_id = $2
     LIMIT 1`,
    [sid, uid],
  );
  if (cop[0]) {
    const purpose = String(cop[0].purpose || "");
    const flow =
      purpose === "selected_bid_payment" || purpose === "client_selected_bid"
        ? "client_selected_bid"
        : "client_fixed";
    return { ok: true, paymentFlow: flow, localRef: `cop:${cop[0].id}` };
  }

  const { rows: tpp } = await db.query(
    `SELECT id FROM training_package_purchases
     WHERE stripe_checkout_session_id = $1 AND user_id = $2
     LIMIT 1`,
    [sid, uid],
  );
  if (tpp[0]) {
    return { ok: true, paymentFlow: "training", localRef: `tpp:${tpp[0].id}` };
  }

  // Bid credits (optional live flow)
  try {
    const { rows: bcp } = await db.query(
      `SELECT id FROM marketplace_bid_credit_purchases
       WHERE stripe_checkout_session_id = $1 AND freelancer_user_id = $2
       LIMIT 1`,
      [sid, uid],
    );
    if (bcp[0]) {
      return { ok: true, paymentFlow: "bid_credit_package", localRef: `bcp:${bcp[0].id}` };
    }
  } catch {
    /* table may be absent in some envs */
  }

  return { ok: false, code: "NOT_OWNER" };
}

/**
 * Aggregate first-party funnel events for the analytics report (no PII / no ids).
 */
async function loadFunnelTelemetryAggregates(db, { fromSec, toSec } = {}) {
  const available = await db.query(
    `SELECT to_regclass('public.payment_checkout_funnel_events') IS NOT NULL AS ok`,
  );
  if (!available.rows[0]?.ok) {
    return { available: false, instrumentationStartedAt: null, events: [], byType: {}, byFlow: {}, byChannel: {}, byLocale: {} };
  }

  const params = [];
  const where = [];
  if (fromSec != null) {
    params.push(new Date(fromSec * 1000));
    where.push(`occurred_at >= $${params.length}`);
  }
  if (toSec != null) {
    params.push(new Date(toSec * 1000));
    where.push(`occurred_at < $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { rows: boundary } = await db.query(
    `SELECT MIN(occurred_at) AS started_at FROM payment_checkout_funnel_events`,
  );
  const { rows } = await db.query(
    `SELECT event_type, payment_flow, channel, locale, COUNT(*)::int AS n
     FROM payment_checkout_funnel_events
     ${whereSql}
     GROUP BY 1, 2, 3, 4`,
    params,
  );

  const byType = {};
  const byFlow = {};
  const byChannel = {};
  const byLocale = {};
  for (const r of rows) {
    byType[r.event_type] = (byType[r.event_type] || 0) + r.n;
    byFlow[r.payment_flow] = byFlow[r.payment_flow] || {};
    byFlow[r.payment_flow][r.event_type] = (byFlow[r.payment_flow][r.event_type] || 0) + r.n;
    byChannel[r.channel] = byChannel[r.channel] || {};
    byChannel[r.channel][r.event_type] = (byChannel[r.channel][r.event_type] || 0) + r.n;
    const loc = r.locale || "unknown";
    byLocale[loc] = byLocale[loc] || {};
    byLocale[loc][r.event_type] = (byLocale[loc][r.event_type] || 0) + r.n;
  }

  const sessionWhere = where.length
    ? `${whereSql} AND stripe_checkout_session_id IS NOT NULL`
    : `WHERE stripe_checkout_session_id IS NOT NULL`;
  const { rows: sessionRows } = await db.query(
    `SELECT stripe_checkout_session_id AS sid,
            BOOL_OR(event_type = 'checkout_session_created') AS session_created,
            BOOL_OR(event_type = 'checkout_redirect_started') AS redirect_started,
            BOOL_OR(event_type = 'checkout_cancel_returned') AS cancel_returned,
            BOOL_OR(event_type = 'checkout_success_returned') AS success_returned,
            MIN(occurred_at) FILTER (WHERE event_type = 'checkout_session_created') AS session_at,
            MIN(occurred_at) FILTER (WHERE event_type = 'checkout_redirect_started') AS redirect_at,
            MIN(occurred_at) FILTER (WHERE event_type = 'checkout_cancel_returned') AS cancel_at,
            MIN(occurred_at) FILTER (WHERE event_type = 'checkout_success_returned') AS success_at,
            MIN(payment_flow) AS payment_flow,
            MIN(channel) AS channel,
            MIN(locale) AS locale
     FROM payment_checkout_funnel_events
     ${sessionWhere}
     GROUP BY stripe_checkout_session_id`,
    params,
  );

  return {
    available: true,
    instrumentationStartedAt: boundary.rows[0]?.started_at
      ? new Date(boundary.rows[0].started_at).toISOString()
      : null,
    byType,
    byFlow,
    byChannel,
    byLocale,
    sessions: sessionRows.map((r) => ({
      sessionCreated: !!r.session_created,
      redirectStarted: !!r.redirect_started,
      cancelReturned: !!r.cancel_returned,
      successReturned: !!r.success_returned,
      sessionAt: r.session_at ? new Date(r.session_at).toISOString() : null,
      redirectAt: r.redirect_at ? new Date(r.redirect_at).toISOString() : null,
      cancelAt: r.cancel_at ? new Date(r.cancel_at).toISOString() : null,
      successAt: r.success_at ? new Date(r.success_at).toISOString() : null,
      paymentFlow: r.payment_flow,
      channel: r.channel,
      locale: r.locale || null,
    })),
  };
}

function flowFromStripeMetadata(meta) {
  return paymentFlowOf(meta || {});
}

module.exports = {
  EVENT_TYPES,
  CLIENT_EMITTABLE,
  normalizeEventType,
  normalizeChannel,
  normalizeLocale,
  normalizeSessionId,
  normalizeFlow,
  recordFunnelEvent,
  emitServerFunnelEvent,
  emitCheckoutSessionLifecycle,
  authorizeSessionOwnership,
  loadFunnelTelemetryAggregates,
  flowFromStripeMetadata,
  localRefFromParts,
};
