#!/usr/bin/env node
/**
 * Payment Analytics report (R2) — READ-ONLY. Journey / session / attempt funnel by product for 7 / 30 / 90 days,
 * retries and recoveries, time-to-pay, failure categories, abandonment, Stripe ↔ local reconciliation and
 * webhook coverage. Definitions: src/services/paymentFunnelAnalyticsModel.js.
 *
 * Usage (inside the backend container on Production, or any env with STRIPE_SECRET_KEY + DATABASE_URL):
 *   node scripts/paymentAnalyticsReport.js                  # text summary, windows 7,30,90
 *   node scripts/paymentAnalyticsReport.js --json           # full JSON
 *   node scripts/paymentAnalyticsReport.js --windows 7,30 --lookback 30 --gap-days 7 --no-webhook
 *
 * Never writes: Stripe list/retrieve calls only; SQL runs inside BEGIN READ ONLY and is rolled back.
 * Output: aggregates only — no ids, names, e-mails, customer ids, card data or URLs (enforced before printing).
 */
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const intArg = (name, fallback) => {
  const n = Number(arg(name));
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const pctText = (r) => (r.pct == null ? `${r.n}/${r.d}` : `${r.pct}% (${r.n}/${r.d})`);
const statText = (s) =>
  s.n === 0 ? "n=0" : `n=${s.n}` + (s.medianMin != null ? ` median=${s.medianMin}m` : "") + (s.p75Min != null ? ` p75=${s.p75Min}m p90=${s.p90Min}m` : "");
const kv = (o) => Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join(" ") || "-";

function line(label, s) {
  const j = s.journeys;
  return (
    `  ${label.padEnd(22)} journeys=${j.started} resolved=${j.resolved} attempted=${j.attempted} succeeded=${j.succeeded}` +
    ` (first_try=${j.succeededFirstTry} recovered=${j.recoveredAfterRetry}) failed=${j.failed} abandoned=${j.abandoned}` +
    ` in_progress=${j.inProgress} no_session=${j.noCheckoutSession} | sessions=${s.sessions.total} dup=${s.sessions.duplicates}` +
    ` attempted=${s.sessions.attempted} | attempts=${s.attempts.total} failed=${s.attempts.failed}` +
    ` | conversion=${pctText(s.rates.journeyConversion)} abandonment=${pctText(s.rates.abandonment)}`
  );
}

function renderText(r) {
  const out = [];
  out.push(`PAYMENT ANALYTICS — generated ${r.generatedAt}`);
  out.push(`population: hosts=${r.population.siteHosts.join(",")} listed=${r.population.stripeSessionsListed} included=${r.population.included} excluded: ${kv(r.population.excluded)}`);
  out.push(`definitions: abandoned = ${r.definitions.abandoned}; CHECKOUT_OPENED ${r.definitions.checkoutOpened}; rates shown from n>=${r.definitions.ratesShownFrom}`);
  for (const [name, w] of Object.entries(r.windows)) {
    out.push("");
    out.push(`== ${name} (${w.from.slice(0, 10)} → ${w.to.slice(0, 10)})`);
    out.push(line("ALL", w.overall));
    for (const [g, s] of Object.entries(w.byGroup)) out.push(line(g, s));
    out.push("  by flow:");
    for (const [f, s] of Object.entries(w.byFlow)) out.push(line(`  ${f}`, s));
    const o = w.overall;
    out.push(`  rates: reached_attempt=${pctText(o.rates.reachedPaymentAttempt)} success_after_attempt=${pctText(o.rates.successAfterAttempt)} attempt_failure=${pctText(o.rates.attemptFailure)} retry=${pctText(o.rates.retry)} retry_success=${pctText(o.rates.retrySuccess)} success_after_failure=${pctText(o.rates.successAfterPaymentFailure)} success_after_abandoned_session=${pctText(o.rates.successAfterAbandonedSession)}`);
    out.push(`  attempts per attempted journey: ${kv(o.attemptsPerJourney)} | genuine sessions per journey: ${kv(o.sessionsPerJourney)} | in-session retries=${o.attempts.inSessionRetries}`);
    out.push(`  failure groups: ${kv(o.attempts.byGroup)}`);
    out.push(`  failure categories: ${kv(o.attempts.byCategory)}`);
    const t = o.timeToPay;
    out.push(`  time: creation→session ${statText(t.creationToCheckoutSession)} | session→first attempt ${statText(t.sessionToFirstAttempt)} | first attempt→success ${statText(t.firstAttemptToSuccess)} | first session→success ${statText(t.firstSessionToSuccess)} | between attempts ${statText(t.betweenAttempts)} | between sessions ${statText(t.betweenGenuineSessions)}`);
    const a = w.abandonment;
    out.push(`  abandonment: sessions=${a.sessions} journeys=${a.journeys} (single_visit=${a.journeysNewVsRetry.singleVisit} multi_visit=${a.journeysNewVsRetry.multipleVisits}) by_channel: ${kv(a.byChannel)} by_amman_day_part: ${kv(a.byAmmanDayPart)} by_role: ${kv(a.byRole)} lifetime_h: ${kv(a.sessionLifetimeHours)}`);
    if (w.byBillingTerm && Object.keys(w.byBillingTerm).length) {
      out.push(`  membership term: ${Object.entries(w.byBillingTerm).map(([k, s]) => `${k} journeys=${s.journeys.started} succeeded=${s.journeys.succeeded}`).join(" | ")}`);
    }
    out.push(`  channel: ${Object.entries(w.byChannel).map(([k, s]) => `${k} journeys=${s.journeys.started} attempted=${s.journeys.attempted} succeeded=${s.journeys.succeeded} abandoned=${s.journeys.abandoned}`).join(" | ")}`);
    out.push(`  internal staff journeys: ${kv(w.internalStaffJourneys)}`);
  }
  out.push("");
  out.push(`recovery ledgers (duplicate sessions before/after): ${Object.entries(r.recoveryEra).map(([g, e]) => `${g} since ${e.ledgerSince}: before ${e.before.duplicates}/${e.before.sessions} after ${e.after.duplicates}/${e.after.sessions}`).join(" | ") || "-"}`);
  const rc = r.reconciliation;
  out.push(`reconciliation: ${kv(rc.checks)} HIGH=${rc.highSeverityFindings}`);
  for (const [type, m] of Object.entries(rc.mismatches)) out.push(`  ${m.severity} ${type} total=${m.total} by: ${kv(m.byFlow)}`);
  out.push(`  multiple sessions same object (journeys): ${kv(rc.multipleSessionsSameObject)} | stale pending local rows: ${kv(rc.stalePendingLocalRows)}`);
  const wh = r.webhook;
  if (wh.available) {
    out.push(`webhook: endpoints=${wh.endpoints.map((e) => `${e.status}/${e.enabledEvents}ev`).join(",")} local=${kv(wh.local.byStatus)} stuck=${wh.local.stuckProcessing} coverage since ${wh.coverageSince.slice(0, 16)}: ${kv(wh.coverage)}`);
    out.push(`  local rows (Stripe retention window): ${kv(wh.localRowsSinceRetention)} | by type: ${Object.entries(wh.byType).map(([t, v]) => `${t}=${v.processed}/${v.expected}`).join(" ")}`);
  } else {
    out.push(`webhook: ${wh.skipped ? "skipped" : "not available"}`);
  }
  const fp = r.firstPartyFunnel;
  out.push("");
  if (!fp || !fp.available) {
    out.push(`first-party funnel: not available (${fp?.note || fp?.error || "no instrumentation yet"})`);
  } else {
    out.push(`first-party funnel (post-instrumentation since ${fp.instrumentationStartedAt || "?"}):`);
    out.push(`  events: ${kv(fp.counts)}`);
    out.push(`  rates: session→redirect=${pctText(fp.rates.sessionToRedirect)} redirect→cancel_return=${pctText(fp.rates.redirectToCancelReturn)} redirect→success_return=${pctText(fp.rates.redirectToSuccessReturn)} abandon_before_redirect=${pctText(fp.rates.abandonmentBeforeObservedRedirect)}`);
    out.push(`  timing: session→redirect ${statText(fp.timing.sessionCreatedToRedirectStarted)} | redirect→cancel ${statText(fp.timing.redirectStartedToCancelReturned)} | redirect→success_return ${statText(fp.timing.redirectStartedToSuccessReturned)}`);
    out.push(`  by channel: ${Object.entries(fp.byChannel || {}).map(([ch, ev]) => `${ch}{${kv(ev)}}`).join(" | ") || "-"}`);
    out.push(`  by locale: ${Object.entries(fp.byLocale || {}).map(([loc, ev]) => `${loc}{${kv(ev)}}`).join(" | ") || "-"}`);
    out.push(`  by flow (top): ${Object.entries(fp.byFlow || {}).slice(0, 12).map(([f, ev]) => `${f}{${kv(ev)}}`).join(" | ") || "-"}`);
    out.push(`  note: ${fp.note}`);
  }
  return out.join("\n");
}

async function main() {
  const { getStripeOrNull } = require("../src/services/stripeCheckoutService");
  const { buildPaymentAnalyticsReport } = require("../src/services/paymentFunnelAnalyticsService");
  const stripe = getStripeOrNull();
  if (!stripe) {
    console.log("PAYMENT_ANALYTICS_REPORT", JSON.stringify({ error: "stripe_not_configured" }));
    process.exitCode = 2;
    return;
  }
  const windowsDays = String(arg("--windows") || "7,30,90")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 365);
  const { pool } = require("../src/config/db");
  const client = await pool.connect();
  let report;
  try {
    await client.query("BEGIN READ ONLY");
    report = await buildPaymentAnalyticsReport({
      stripe,
      db: client,
      windowsDays: windowsDays.length ? windowsDays : [7, 30, 90],
      lookbackDays: intArg("--lookback", 30),
      gapDays: intArg("--gap-days", undefined),
      includeWebhook: !process.argv.includes("--no-webhook"),
    });
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
  if (process.argv.includes("--json")) console.log("PAYMENT_ANALYTICS_REPORT", JSON.stringify(report));
  else console.log(renderText(report));
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("PAYMENT_ANALYTICS_REPORT_FAILED", err?.code || err?.type || err?.name || "error");
      process.exitCode = 1;
    })
    .finally(async () => {
      try {
        await require("../src/config/db").pool.end();
      } catch {
        /* pool never opened */
      }
    });
}

module.exports = { renderText };
