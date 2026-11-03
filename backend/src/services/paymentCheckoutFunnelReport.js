/**
 * Post-instrumentation first-party funnel section for Payment Analytics.
 * Pure aggregation over telemetry rows + Stripe session financial states (optional).
 */

const MIN_RATE = 20;

function rate(n, d) {
  const num = Number(n) || 0;
  const den = Number(d) || 0;
  if (den < MIN_RATE) return { n: num, d: den, pct: null };
  return { n: num, d: den, pct: Math.round((1000 * num) / den) / 10 };
}

function durationStats(secondsList) {
  const vals = secondsList.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!vals.length) return { n: 0, medianMin: null, p75Min: null, p90Min: null };
  const at = (p) => vals[Math.min(vals.length - 1, Math.floor((p / 100) * vals.length))];
  const toMin = (s) => Math.round((s / 60) * 10) / 10;
  return { n: vals.length, medianMin: toMin(at(50)), p75Min: toMin(at(75)), p90Min: toMin(at(90)) };
}

/**
 * @param {{ sessions: Array, byType: object, instrumentationStartedAt: string|null, available: boolean }} telemetry
 * @param {{ stripeSessionsById?: Map<string, object> }} [opts]
 */
function summarizeFirstPartyFunnel(telemetry, opts = {}) {
  if (!telemetry?.available) {
    return {
      available: false,
      instrumentationStartedAt: null,
      note: "payment_checkout_funnel_events table not present yet",
    };
  }

  const sessions = telemetry.sessions || [];
  const byType = telemetry.byType || {};
  const stripeById = opts.stripeSessionsById || null;

  let redirectObserved = 0;
  let redirectNotObserved = 0;
  let cancelReturned = 0;
  let successReturned = 0;
  let redirectedThenExpiredWithoutAttempt = 0;
  const sessionToRedirect = [];
  const redirectToCancel = [];
  const redirectToSuccess = [];

  for (const s of sessions) {
    if (s.sessionCreated || s.redirectStarted || s.cancelReturned || s.successReturned) {
      /* counted below */
    }
    if (s.redirectStarted) redirectObserved += 1;
    else if (s.sessionCreated) redirectNotObserved += 1;
    if (s.cancelReturned) cancelReturned += 1;
    if (s.successReturned) successReturned += 1;

    if (s.sessionAt && s.redirectAt) {
      sessionToRedirect.push((new Date(s.redirectAt) - new Date(s.sessionAt)) / 1000);
    }
    if (s.redirectAt && s.cancelAt) {
      redirectToCancel.push((new Date(s.cancelAt) - new Date(s.redirectAt)) / 1000);
    }
    if (s.redirectAt && s.successAt) {
      redirectToSuccess.push((new Date(s.successAt) - new Date(s.redirectAt)) / 1000);
    }

    if (stripeById && s.redirectStarted && !s.successReturned) {
      // Caller may attach stripe session id on telemetry.sessions in future; skip without id.
    }
  }

  // Financial classifications remain Stripe-derived; counts below are telemetry-only.
  return {
    available: true,
    instrumentationStartedAt: telemetry.instrumentationStartedAt,
    note: "First-party signals only exist after instrumentation_started_at; do not backfill history.",
    counts: {
      checkout_requested: byType.checkout_requested || 0,
      checkout_session_created: byType.checkout_session_created || 0,
      checkout_redirect_started: byType.checkout_redirect_started || 0,
      checkout_cancel_returned: byType.checkout_cancel_returned || 0,
      checkout_success_returned: byType.checkout_success_returned || 0,
      sessionsWithTelemetry: sessions.length,
      redirectObserved,
      redirectNotObserved,
      cancelReturned,
      successReturned,
      redirectedThenExpiredWithoutAttempt,
    },
    rates: {
      sessionToRedirect: rate(redirectObserved, (byType.checkout_session_created || 0) || sessions.filter((s) => s.sessionCreated).length),
      redirectToCancelReturn: rate(cancelReturned, redirectObserved),
      redirectToSuccessReturn: rate(successReturned, redirectObserved),
      abandonmentBeforeObservedRedirect: rate(redirectNotObserved, (byType.checkout_session_created || 0)),
    },
    timing: {
      sessionCreatedToRedirectStarted: durationStats(sessionToRedirect),
      redirectStartedToCancelReturned: durationStats(redirectToCancel),
      redirectStartedToSuccessReturned: durationStats(redirectToSuccess),
    },
    byFlow: telemetry.byFlow || {},
    byChannel: telemetry.byChannel || {},
    byLocale: telemetry.byLocale || {},
  };
}

module.exports = { summarizeFirstPartyFunnel, rate, durationStats, MIN_RATE };
