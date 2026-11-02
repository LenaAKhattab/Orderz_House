/**
 * Canonical payment funnel model (Payment Analytics R2). Pure functions: no I/O, no clock reads unless `now`
 * is omitted, and no identifier ever leaves this module — outputs are counts, rates, durations and Stripe's own
 * enumerated outcome categories.
 *
 * Vocabulary (the three units are never mixed):
 *   CHECKOUT SESSION — one Stripe Checkout Session = one payable URL. A reload, double click, second tab or
 *     «Continue payment» while a session is open returns that SAME session (per-object lock + attempt-specific
 *     Stripe idempotency key), so it is one session however many times it is opened.
 *   PAYMENT ATTEMPT — one confirmation of a payment method inside a session = one Stripe Charge (succeeded or
 *     failed, Radar blocks included). A PaymentIntent without any Charge is one attempt that stopped at
 *     authentication (3-D Secure). Checkout creates the PaymentIntent lazily, only when the buyer submits a
 *     payment method, so a session WITHOUT a PaymentIntent was never attempted.
 *   PAYMENT JOURNEY — one buyer's effort to pay for one business object: a client order (fixed price or selected
 *     bid; the order IS the journey), a membership plan, a training package or a legacy plan. A journey holds one
 *     or more sessions and ends at its first success; for actor-scoped objects (plan / package) a new journey starts
 *     after a success or after JOURNEY_GAP_DAYS without activity.
 *
 * Session role inside a journey (genuine retries vs duplicate requests):
 *   initial                  — first session of the journey;
 *   retry_after_failure      — created after a failed attempt in the journey (genuine retry);
 *   duplicate                — created while an earlier session of the journey was still payable and nothing
 *                              failed (reload / double click / second tab — pre-ledger behaviour, today resumed);
 *   retry_after_abandonment  — created after every earlier session expired without an attempt (genuine retry).
 *
 * Canonical states:
 *   session — open | processing | succeeded | expired_without_attempt (ABANDONED) |
 *             expired_after_failed_attempt (FAILED) | expired_attempt_unknown (subscription-mode Checkout keeps no
 *             PaymentIntent on the session, so attempts are not observable there)
 *   journey — succeeded_first_try | recovered_after_retry | failed | abandoned | in_progress | processing |
 *             attempt_unknown | no_checkout_session (created locally, Stripe never reached)
 *   NOT observable today: CHECKOUT_OPENED (Stripe emits no "opened" event and no client-side tracking is used);
 *   CANCELLED is not distinguishable from expiry at Stripe (an expired session looks the same either way).
 */

const { paymentFlowOf, chargeOutcomeCategory, isOrderzHousePurpose } = require("./stripePaymentFunnelLog");

const DAY_SECONDS = 86400;
const JOURNEY_GAP_DAYS = 7;
/** Percentages are only printed when the denominator reaches this size (tiny samples mislead). */
const MIN_RATE_DENOMINATOR = 20;
const AMMAN_TIME_ZONE = "Asia/Amman";

const SESSION_STATE = Object.freeze({
  OPEN: "open",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  EXPIRED_WITHOUT_ATTEMPT: "expired_without_attempt",
  EXPIRED_AFTER_FAILED_ATTEMPT: "expired_after_failed_attempt",
  EXPIRED_ATTEMPT_UNKNOWN: "expired_attempt_unknown",
});

const SESSION_ROLE = Object.freeze({
  INITIAL: "initial",
  DUPLICATE: "duplicate",
  RETRY_AFTER_ABANDONMENT: "retry_after_abandonment",
  RETRY_AFTER_FAILURE: "retry_after_failure",
});

const JOURNEY_OUTCOME = Object.freeze({
  SUCCEEDED_FIRST_TRY: "succeeded_first_try",
  RECOVERED_AFTER_RETRY: "recovered_after_retry",
  FAILED: "failed",
  ABANDONED: "abandoned",
  IN_PROGRESS: "in_progress",
  PROCESSING: "processing",
  ATTEMPT_UNKNOWN: "attempt_unknown",
  NO_CHECKOUT_SESSION: "no_checkout_session",
});

const PRODUCT_GROUPS = Object.freeze(["membership", "client_order", "selected_bid", "training", "bid_credit", "legacy_subscription", "other"]);

const idOf = (v) => (v && typeof v === "object" ? v.id || null : v || null);
const posInt = (...values) => {
  for (const v of values) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
};
/** Stripe enumerations only (codes / reasons); anything else collapses to "other". */
const safeCode = (v) => {
  const s = String(v || "").toLowerCase();
  return /^[a-z0-9_]{1,60}$/.test(s) ? s : "other";
};

function hostAndPath(url) {
  try {
    const u = new URL(String(url || ""));
    return { host: u.host.replace(/^www\./, ""), path: u.pathname };
  } catch {
    return { host: "", path: "" };
  }
}

/** Product group used for segmentation (membership / client_order / selected_bid / training / legacy...). */
function productGroupOf(flow) {
  const f = String(flow || "");
  if (f === "client_fixed") return "client_order";
  if (f === "client_selected_bid") return "selected_bid";
  if (f === "training") return "training";
  if (f === "bid_credit_package") return "bid_credit";
  if (f === "special_offer" || f === "annual_silver" || f.startsWith("membership")) return "membership";
  if (f.startsWith("legacy_")) return "legacy_subscription";
  return "other";
}

/** Membership billing term: annual (annual_basic) vs monthly tiers vs special offer. */
function billingTermOf(flow) {
  if (flow === "annual_silver") return "annual";
  if (flow === "special_offer") return "special_offer";
  if (String(flow || "").startsWith("membership")) return "monthly";
  return null;
}

/**
 * Journey identity from server-written session metadata (internal ids stay in memory, never in output).
 * objectScoped: the object itself bounds the journey (an order) — no inactivity split.
 */
function journeyIdentityOf(meta) {
  const m = meta && typeof meta === "object" ? meta : {};
  const purpose = String(m.purpose || "");
  const actor = posInt(m.clientUserId, m.freelancerUserId, m.user_id, m.userId, m.freelancer_user_id);
  if (purpose === "client_fixed_order" || purpose === "client_selected_bid") {
    const orderId = posInt(m.orderId, m.order_id);
    if (orderId) return { key: `${purpose}:order:${orderId}`, objectScoped: true, actor, orderId };
  }
  if (purpose === "marketplace_membership_checkout") {
    const plan = posInt(m.marketplacePlanId, m.marketplace_plan_id, m.planId, m.plan_id);
    if (actor && plan) return { key: `membership:${actor}:${plan}`, objectScoped: false, actor, orderId: null };
  }
  if (purpose === "training_package_purchase") {
    const pkg = String(m.training_package_code || "").trim().toLowerCase();
    if (actor && pkg) return { key: `training:${actor}:${pkg}`, objectScoped: false, actor, orderId: null };
  }
  if (purpose === "bid_credit_package_purchase") {
    const pkg = posInt(m.packageId, m.package_id) || String(m.packageCode || m.package_code || "");
    if (actor && pkg) return { key: `bid_credit:${actor}:${pkg}`, objectScoped: false, actor, orderId: null };
  }
  if (purpose.startsWith("freelancer_") && actor) {
    // Legacy subscription / activation fee / recurring: one journey per freelancer (they were one purchase path).
    return { key: `legacy:${actor}`, objectScoped: false, actor, orderId: null };
  }
  return { key: null, objectScoped: false, actor, orderId: null };
}

/**
 * Normalize one Stripe Checkout Session. Returns { excludedReason } for sessions outside the population:
 * other businesses on the shared Stripe account, non-production hosts (historical local QA used live keys),
 * test-mode sessions.
 * @param {object} s Stripe Checkout Session
 * @param {{ siteHosts: Set<string> }} opts
 */
function normalizeSession(s, { siteHosts }) {
  const meta = s?.metadata || {};
  if (!isOrderzHousePurpose(meta)) return { excludedReason: "other_business" };
  const { host, path } = hostAndPath(s.success_url);
  if (!siteHosts.has(host)) return { excludedReason: "non_production_host" };
  if (s.livemode === false) return { excludedReason: "test_mode" };
  const flow = paymentFlowOf(meta);
  const identity = journeyIdentityOf(meta);
  return {
    sessionId: String(s.id),
    created: Number(s.created),
    expiresAt: s.expires_at != null ? Number(s.expires_at) : null,
    status: String(s.status || ""),
    paymentStatus: String(s.payment_status || ""),
    mode: String(s.mode || ""),
    purpose: String(meta.purpose),
    flow,
    group: productGroupOf(flow),
    billingTerm: billingTermOf(flow),
    channel: path.includes("/mobile/payment-return") ? "mobile_app" : "web",
    journeyKey: identity.key || `session:${s.id}`,
    objectScoped: identity.objectScoped,
    actorId: identity.actor,
    orderId: identity.orderId,
    paymentIntentId: idOf(s.payment_intent),
    subscriptionId: idOf(s.subscription),
    // Subscription-mode Checkout keeps no PaymentIntent on the session: attempts are not observable there.
    attemptObservable: String(s.mode || "") !== "subscription",
  };
}

/** One canonical category per payment attempt (Stripe Charge, or PaymentIntent error without a Charge). */
function attemptsOfSession(ns, { chargesByPi, paymentIntentsById }) {
  if (!ns.paymentIntentId) return [];
  const charges = [...(chargesByPi.get(ns.paymentIntentId) || [])].sort((a, b) => a.created - b.created);
  if (charges.length) {
    return charges.map((c) => {
      const succeeded = c.status === "succeeded" || c.paid === true;
      return { at: Number(c.created), succeeded, category: succeeded ? "succeeded" : safeCode(chargeOutcomeCategory(c)) };
    });
  }
  const pi = paymentIntentsById.get(ns.paymentIntentId) || null;
  if (pi?.status === "succeeded") return [{ at: Number(pi.created), succeeded: true, category: "succeeded" }];
  const err = pi?.last_payment_error || null;
  let category = "authentication_incomplete";
  if (err) {
    category =
      err.code === "payment_intent_authentication_failure"
        ? "authentication_failed"
        : `error_${safeCode(err.decline_code || err.code)}`;
  }
  return [{ at: Number(pi?.created || ns.created), succeeded: false, category }];
}

function isPaidStatus(paymentStatus) {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

function classifySession(ns, attempts, nowSec) {
  if (ns.status === "complete") return isPaidStatus(ns.paymentStatus) ? SESSION_STATE.SUCCEEDED : SESSION_STATE.PROCESSING;
  if (ns.status === "open" && (ns.expiresAt == null || ns.expiresAt > nowSec)) return SESSION_STATE.OPEN;
  if (!ns.attemptObservable) return SESSION_STATE.EXPIRED_ATTEMPT_UNKNOWN;
  return attempts.length ? SESSION_STATE.EXPIRED_AFTER_FAILED_ATTEMPT : SESSION_STATE.EXPIRED_WITHOUT_ATTEMPT;
}

/** Attach attempts, state, success time and the time the session stopped being payable. */
function enrichSessions(normalized, sources, nowSec) {
  const seen = new Set();
  const out = [];
  for (const ns of normalized) {
    if (seen.has(ns.sessionId)) continue; // the same session listed twice (pagination / re-delivery) counts once
    seen.add(ns.sessionId);
    const attempts = attemptsOfSession(ns, sources);
    const state = classifySession(ns, attempts, nowSec);
    const success = attempts.find((a) => a.succeeded) || null;
    const successAt = state === SESSION_STATE.SUCCEEDED ? (success ? success.at : null) : null;
    let closedAt = Infinity;
    if (state === SESSION_STATE.SUCCEEDED || state === SESSION_STATE.PROCESSING) closedAt = successAt || ns.created;
    else if (state !== SESSION_STATE.OPEN) closedAt = ns.expiresAt != null ? ns.expiresAt : ns.created + DAY_SECONDS;
    out.push({ ...ns, attempts, state, successAt, closedAt });
  }
  return out.sort((a, b) => a.created - b.created || (a.sessionId < b.sessionId ? -1 : 1));
}

function roleFor(journey, s) {
  if (!journey.sessions.length) return SESSION_ROLE.INITIAL;
  const failedBefore = journey.sessions.some((p) => p.attempts.some((a) => !a.succeeded && a.at <= s.created));
  if (failedBefore) return SESSION_ROLE.RETRY_AFTER_FAILURE;
  if (journey.sessions.some((p) => p.closedAt > s.created)) return SESSION_ROLE.DUPLICATE;
  return SESSION_ROLE.RETRY_AFTER_ABANDONMENT;
}

function lastTouchOf(s) {
  const lastAttempt = s.attempts.length ? s.attempts[s.attempts.length - 1].at : 0;
  return Math.max(s.created, lastAttempt);
}

function finalizeJourney(j) {
  const attempts = j.sessions.flatMap((s) => s.attempts).sort((a, b) => a.at - b.at);
  const successSession = j.sessions.find((s) => s.state === SESSION_STATE.SUCCEEDED) || null;
  const successAt = successSession ? successSession.successAt : null;
  const visitOf = new Map();
  let visit = 0;
  for (const s of j.sessions) {
    if (s.role !== SESSION_ROLE.DUPLICATE) visit += 1;
    visitOf.set(s, Math.max(visit, 1));
  }
  let inSessionRetries = 0;
  for (const s of j.sessions) {
    for (let i = 1; i < s.attempts.length; i += 1) if (!s.attempts[i - 1].succeeded) inSessionRetries += 1;
  }
  const failedAttempts = attempts.filter((a) => !a.succeeded);
  const genuineSessions = j.sessions.filter((s) => s.role !== SESSION_ROLE.DUPLICATE).length;

  let outcome;
  let recoveredAfter = null;
  if (successSession) {
    const failedBeforeSuccess = failedAttempts.some((a) => successAt == null || a.at < successAt);
    const successVisit = visitOf.get(successSession);
    if (failedBeforeSuccess) recoveredAfter = "failure";
    else if (successVisit > 1) recoveredAfter = "abandonment";
    outcome = recoveredAfter ? JOURNEY_OUTCOME.RECOVERED_AFTER_RETRY : JOURNEY_OUTCOME.SUCCEEDED_FIRST_TRY;
  } else if (j.sessions.some((s) => s.state === SESSION_STATE.OPEN)) outcome = JOURNEY_OUTCOME.IN_PROGRESS;
  else if (j.sessions.some((s) => s.state === SESSION_STATE.PROCESSING)) outcome = JOURNEY_OUTCOME.PROCESSING;
  else if (attempts.length) outcome = JOURNEY_OUTCOME.FAILED;
  else if (j.sessions.some((s) => s.state === SESSION_STATE.EXPIRED_ATTEMPT_UNKNOWN)) outcome = JOURNEY_OUTCOME.ATTEMPT_UNKNOWN;
  else outcome = JOURNEY_OUTCOME.ABANDONED;

  const first = j.sessions[0];
  const firstAttempt = attempts[0] || null;
  const firstAttemptSession = firstAttempt ? j.sessions.find((s) => s.attempts.includes(firstAttempt)) : null;
  const retried = genuineSessions > 1 || inSessionRetries > 0;
  return {
    flow: first.flow,
    group: first.group,
    billingTerm: first.billingTerm,
    channel: first.channel,
    actorId: first.actorId,
    orderId: first.orderId,
    startedAt: first.created,
    objectCreatedAt: j.objectCreatedAt ?? null,
    sessions: j.sessions,
    sessionCount: j.sessions.length,
    genuineSessions,
    duplicateSessions: j.sessions.length - genuineSessions,
    attemptCount: attempts.length,
    failedAttemptCount: failedAttempts.length,
    inSessionRetries,
    attemptTimes: attempts.map((a) => a.at),
    firstAttemptAt: firstAttempt ? firstAttempt.at : null,
    firstAttemptSessionCreated: firstAttemptSession ? firstAttemptSession.created : null,
    successAt,
    outcome,
    recoveredAfter,
    retried,
    succeeded: Boolean(successSession),
  };
}

/**
 * Group enriched sessions into journeys and give every session its role.
 * @param {object[]} sessions output of enrichSessions
 * @param {{ gapDays?: number, objectCreatedAtByOrder?: Map<number, number> }} [opts]
 */
function buildJourneys(sessions, { gapDays = JOURNEY_GAP_DAYS, objectCreatedAtByOrder = new Map() } = {}) {
  const gap = gapDays * DAY_SECONDS;
  const byKey = new Map();
  for (const s of sessions) {
    if (!byKey.has(s.journeyKey)) byKey.set(s.journeyKey, []);
    byKey.get(s.journeyKey).push(s);
  }
  const journeys = [];
  for (const list of byKey.values()) {
    let cur = null;
    for (const s of list) {
      const startNew =
        !cur || cur.succeeded || (!s.objectScoped && s.created - cur.lastTouch > gap);
      if (startNew) {
        cur = { sessions: [], lastTouch: s.created, succeeded: false, objectCreatedAt: s.orderId ? objectCreatedAtByOrder.get(s.orderId) ?? null : null };
        journeys.push(cur);
      }
      s.role = roleFor(cur, s);
      cur.sessions.push(s);
      cur.lastTouch = Math.max(cur.lastTouch, lastTouchOf(s));
      if (s.state === SESSION_STATE.SUCCEEDED) cur.succeeded = true;
    }
  }
  return journeys.map(finalizeJourney).sort((a, b) => a.startedAt - b.startedAt);
}

// ---------------------------------------------------------------- aggregation helpers

function rate(n, d) {
  return { n, d, pct: d >= MIN_RATE_DENOMINATOR ? Number(((100 * n) / d).toFixed(1)) : null, smallSample: d < MIN_RATE_DENOMINATOR };
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Durations in minutes. Median from 3 values, p75 / p90 from 10 values; below that only the count. */
function durationStats(secondsList) {
  const mins = secondsList.filter((v) => Number.isFinite(v) && v >= 0).map((v) => v / 60).sort((a, b) => a - b);
  const r = (v) => (v == null ? null : Math.round(v * 10) / 10);
  const n = mins.length;
  return {
    n,
    medianMin: n >= 3 ? r(quantile(mins, 0.5)) : null,
    p75Min: n >= 10 ? r(quantile(mins, 0.75)) : null,
    p90Min: n >= 10 ? r(quantile(mins, 0.9)) : null,
  };
}

/** Business failure group for one attempt category (from Stripe outcome / decline enumerations). */
function failureGroupOf(category) {
  const c = String(category || "");
  if (c.startsWith("radar_blocked")) return "blocked_by_fraud_screening";
  if (/authentication|redirect|three_d|3ds/.test(c)) return "authentication_3ds";
  if (/insufficient_funds/.test(c)) return "insufficient_funds";
  if (/expired_card/.test(c)) return "expired_card";
  if (/incorrect|invalid/.test(c)) return "invalid_card_details";
  if (/processing/.test(c)) return "processing_error";
  if (c.startsWith("issuer_") || c.startsWith("error_card_declined") || /decline|do_not_honor|not_allowed|call_issuer|lost|stolen|pickup/.test(c)) return "card_declined";
  return "other";
}

const ammanHourFormatter = (() => {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: AMMAN_TIME_ZONE });
  } catch {
    return null;
  }
})();
function ammanDayPart(unixSeconds) {
  const h = ammanHourFormatter ? Number(ammanHourFormatter.format(new Date(unixSeconds * 1000))) : new Date((unixSeconds + 3 * 3600) * 1000).getUTCHours();
  if (h < 6) return "00-06";
  if (h < 12) return "06-12";
  if (h < 18) return "12-18";
  return "18-24";
}

const inc = (o, k, n = 1) => {
  o[k] = (o[k] || 0) + n;
};

/** Funnel summary for one population of journeys + sessions (already filtered to one window / segment). */
function summarize(journeys, sessions, localCreationsWithoutSession = 0) {
  const J = { started: journeys.length + localCreationsWithoutSession, withCheckoutSession: journeys.length, noCheckoutSession: localCreationsWithoutSession };
  const outcomes = {};
  for (const j of journeys) inc(outcomes, j.outcome);
  outcomes[JOURNEY_OUTCOME.NO_CHECKOUT_SESSION] = (outcomes[JOURNEY_OUTCOME.NO_CHECKOUT_SESSION] || 0) + localCreationsWithoutSession;
  const resolved = journeys.filter((j) => j.outcome !== JOURNEY_OUTCOME.IN_PROGRESS && j.outcome !== JOURNEY_OUTCOME.PROCESSING);
  // A success is an attempt even where attempts are not observable (subscription-mode Checkout).
  const attempted = resolved.filter((j) => j.attemptCount > 0 || j.succeeded);
  const succeeded = resolved.filter((j) => j.succeeded);
  const abandoned = resolved.filter((j) => j.outcome === JOURNEY_OUTCOME.ABANDONED);
  const failed = resolved.filter((j) => j.outcome === JOURNEY_OUTCOME.FAILED);
  const retried = resolved.filter((j) => j.retried);
  const recovered = succeeded.filter((j) => j.outcome === JOURNEY_OUTCOME.RECOVERED_AFTER_RETRY);
  const afterFailure = resolved.filter((j) => j.failedAttemptCount > 0);
  // Journeys that saw a session expire without any attempt BEFORE the journey resolved (a duplicate tab that
  // expires after the success is not an abandonment of that journey).
  const afterAbandonedSession = resolved.filter((j) =>
    j.sessions.some((s) => s.state === SESSION_STATE.EXPIRED_WITHOUT_ATTEMPT && s.closedAt <= (j.successAt ?? Infinity)),
  );

  Object.assign(J, {
    resolved: resolved.length,
    attempted: attempted.length,
    succeeded: succeeded.length,
    succeededFirstTry: outcomes[JOURNEY_OUTCOME.SUCCEEDED_FIRST_TRY] || 0,
    recoveredAfterRetry: recovered.length,
    recoveredAfterFailure: recovered.filter((j) => j.recoveredAfter === "failure").length,
    recoveredAfterAbandonment: recovered.filter((j) => j.recoveredAfter === "abandonment").length,
    failed: failed.length,
    abandoned: abandoned.length,
    attemptUnknown: outcomes[JOURNEY_OUTCOME.ATTEMPT_UNKNOWN] || 0,
    inProgress: outcomes[JOURNEY_OUTCOME.IN_PROGRESS] || 0,
    processing: outcomes[JOURNEY_OUTCOME.PROCESSING] || 0,
    retried: retried.length,
    retriedSucceeded: retried.filter((j) => j.succeeded).length,
    multiSessionJourneys: journeys.filter((j) => j.sessionCount > 1).length,
  });

  const S = { total: sessions.length, byRole: {}, byState: {}, attempted: 0 };
  for (const s of sessions) {
    inc(S.byRole, s.role || SESSION_ROLE.INITIAL);
    inc(S.byState, s.state);
    if (s.attempts.length) S.attempted += 1;
  }
  S.duplicates = S.byRole[SESSION_ROLE.DUPLICATE] || 0;
  S.genuine = S.total - S.duplicates;

  const allAttempts = sessions.flatMap((s) => s.attempts);
  const A = { total: allAttempts.length, succeeded: 0, failed: 0, byCategory: {}, byGroup: {} };
  for (const a of allAttempts) {
    if (a.succeeded) {
      A.succeeded += 1;
      continue;
    }
    A.failed += 1;
    inc(A.byCategory, a.category);
    inc(A.byGroup, failureGroupOf(a.category));
  }
  let inSession = 0;
  for (const s of sessions) for (let i = 1; i < s.attempts.length; i += 1) if (!s.attempts[i - 1].succeeded) inSession += 1;
  A.inSessionRetries = inSession;

  const attemptsPerJourney = { 1: 0, 2: 0, "3+": 0 };
  const sessionsPerJourney = { 1: 0, 2: 0, "3+": 0 };
  for (const j of resolved) {
    if (j.attemptCount > 0) inc(attemptsPerJourney, j.attemptCount >= 3 ? "3+" : String(j.attemptCount));
    inc(sessionsPerJourney, j.genuineSessions >= 3 ? "3+" : String(Math.max(j.genuineSessions, 1)));
  }

  const betweenAttempts = [];
  const betweenSessions = [];
  for (const j of journeys) {
    for (let i = 1; i < j.attemptTimes.length; i += 1) betweenAttempts.push(j.attemptTimes[i] - j.attemptTimes[i - 1]);
    let prev = null;
    for (const s of j.sessions) {
      if (s.role === SESSION_ROLE.DUPLICATE) continue;
      if (prev) betweenSessions.push(s.created - prev.created);
      prev = s;
    }
  }
  const timeToPay = {
    creationToCheckoutSession: durationStats(journeys.filter((j) => j.objectCreatedAt != null).map((j) => j.startedAt - j.objectCreatedAt)),
    sessionToFirstAttempt: durationStats(journeys.filter((j) => j.firstAttemptAt != null).map((j) => j.firstAttemptAt - j.firstAttemptSessionCreated)),
    firstAttemptToSuccess: durationStats(succeeded.filter((j) => j.firstAttemptAt != null && j.successAt != null).map((j) => j.successAt - j.firstAttemptAt)),
    firstSessionToSuccess: durationStats(succeeded.filter((j) => j.successAt != null).map((j) => j.successAt - j.startedAt)),
    betweenAttempts: durationStats(betweenAttempts),
    betweenGenuineSessions: durationStats(betweenSessions),
  };

  const rates = {
    journeyConversion: rate(succeeded.length, resolved.length),
    reachedPaymentAttempt: rate(attempted.length, resolved.length),
    successAfterAttempt: rate(succeeded.length, attempted.length),
    failedAfterAttempt: rate(failed.length, attempted.length),
    abandonment: rate(abandoned.length, resolved.length),
    attemptFailure: rate(A.failed, A.total),
    retry: rate(retried.length, resolved.length),
    retrySuccess: rate(retried.filter((j) => j.succeeded).length, retried.length),
    successAfterPaymentFailure: rate(afterFailure.filter((j) => j.succeeded).length, afterFailure.length),
    successAfterAbandonedSession: rate(afterAbandonedSession.filter((j) => j.succeeded).length, afterAbandonedSession.length),
    duplicateSessionShare: rate(S.duplicates, S.total),
  };

  return { journeys: J, journeyOutcomes: outcomes, sessions: S, attempts: A, attemptsPerJourney, sessionsPerJourney, rates, timeToPay };
}

/** Observable abandonment facts only (no motivation is inferred). */
function abandonmentFacts(sessions, journeys) {
  const abandonedSessions = sessions.filter((s) => s.state === SESSION_STATE.EXPIRED_WITHOUT_ATTEMPT);
  const out = { sessions: abandonedSessions.length, byGroup: {}, byFlow: {}, byChannel: {}, byAmmanDayPart: {}, byRole: {}, sessionLifetimeHours: {} };
  for (const s of abandonedSessions) {
    inc(out.byGroup, s.group);
    inc(out.byFlow, s.flow);
    inc(out.byChannel, s.channel);
    inc(out.byAmmanDayPart, ammanDayPart(s.created));
    inc(out.byRole, s.role || SESSION_ROLE.INITIAL);
  }
  for (const s of sessions) if (s.expiresAt) inc(out.sessionLifetimeHours, String(Math.round((s.expiresAt - s.created) / 3600)));
  const abandonedJourneys = journeys.filter((j) => j.outcome === JOURNEY_OUTCOME.ABANDONED);
  out.journeys = abandonedJourneys.length;
  out.journeysNewVsRetry = {
    singleVisit: abandonedJourneys.filter((j) => j.genuineSessions <= 1).length,
    multipleVisits: abandonedJourneys.filter((j) => j.genuineSessions > 1).length,
  };
  return out;
}

/** Summaries for one window: overall, by product group, by flow, by membership billing term, abandonment. */
function summarizeWindow({ journeys, sessions, localCreations = [], fromSec, toSec }) {
  const inWin = (t) => t >= fromSec && t < toSec;
  const J = journeys.filter((j) => inWin(j.startedAt));
  const S = sessions.filter((s) => inWin(s.created));
  const L = localCreations.filter((c) => inWin(c.at));
  const segment = (pick) => {
    const keys = new Set([...J.map(pick), ...S.map(pick), ...L.map(pick)].filter(Boolean));
    const out = {};
    for (const k of [...keys].sort()) {
      out[k] = summarize(J.filter((j) => pick(j) === k), S.filter((s) => pick(s) === k), L.filter((c) => pick(c) === k).length);
    }
    return out;
  };
  return {
    overall: summarize(J, S, L.length),
    byGroup: segment((x) => x.group),
    byFlow: segment((x) => x.flow),
    byBillingTerm: segment((x) => x.billingTerm),
    byChannel: segment((x) => x.channel),
    abandonment: abandonmentFacts(S, J),
  };
}

module.exports = {
  DAY_SECONDS,
  JOURNEY_GAP_DAYS,
  MIN_RATE_DENOMINATOR,
  SESSION_STATE,
  SESSION_ROLE,
  JOURNEY_OUTCOME,
  PRODUCT_GROUPS,
  productGroupOf,
  billingTermOf,
  journeyIdentityOf,
  normalizeSession,
  attemptsOfSession,
  classifySession,
  enrichSessions,
  buildJourneys,
  summarize,
  summarizeWindow,
  abandonmentFacts,
  durationStats,
  failureGroupOf,
  ammanDayPart,
  rate,
};
