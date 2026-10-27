#!/usr/bin/env node
/**
 * READ-ONLY provider-side payment funnel for OrderzHouse Stripe Checkout (aggregates only).
 *
 * Population: Checkout Sessions whose success_url host is the configured CLIENT_URL host (the Stripe account
 * is shared with other businesses and with historical local QA sessions — both are excluded).
 * One canonical outcome per Session (mutually exclusive):
 *   succeeded | expired_without_attempt | open | processing | last failed attempt category
 *   (radar_blocked_rule / radar_blocked_risk / issuer_<reason> / authentication_failed / invalid_payment_details)
 * Attempt-level counts are per Charge (one Session can hold several attempts) and are reported separately.
 *
 * Usage:
 *   node scripts/auditStripePaymentFunnel.js              # windows: 150d, 30d, 14d, 7d
 *   node scripts/auditStripePaymentFunnel.js --days 30
 *   node scripts/auditStripePaymentFunnel.js --since 2026-10-27T13:00:00Z
 * Output: counts and rates only (no ids, emails, names, card data or URLs). Never writes anything.
 */
const crypto = require("crypto");
const { getStripeOrNull } = require("../src/services/stripeCheckoutService");
const { paymentFlowOf, chargeOutcomeCategory, amountBucket, cardCountryGroup } = require("../src/services/stripePaymentFunnelLog");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const sinceArg = arg("--since");
const daysArg = Number(arg("--days"));
const WINDOWS = sinceArg
  ? { since: Math.floor(new Date(sinceArg).getTime() / 1000) }
  : Number.isInteger(daysArg) && daysArg > 0
    ? { [`d${daysArg}`]: NOW - daysArg * DAY }
    : { d150: NOW - 150 * DAY, d30: NOW - 30 * DAY, d14: NOW - 14 * DAY, d7: NOW - 7 * DAY };
const FROM = Math.min(...Object.values(WINDOWS));

function siteHost() {
  try {
    return new URL(String(process.env.CLIENT_URL || "https://orderzhouse.com")).hostname.replace(/^www\./, "");
  } catch {
    return "orderzhouse.com";
  }
}

const inc = (o, k, n = 1) => {
  o[k] = (o[k] || 0) + n;
  return o;
};
const pct = (a, b) => (b ? Number(((100 * a) / b).toFixed(1)) : null);
// Distinct-count keys only; the salt is random per run and never printed.
const SALT = crypto.randomBytes(16).toString("hex");
const anon = (v) => (v ? crypto.createHash("sha256").update(SALT + String(v)).digest("hex") : null);
const idOf = (v) => (v && typeof v === "object" ? v.id : v || null);

async function listAll(iterable) {
  const out = [];
  for await (const x of iterable) out.push(x);
  return out;
}

async function main() {
  const stripe = getStripeOrNull();
  if (!stripe) {
    console.log("STRIPE_PAYMENT_FUNNEL", JSON.stringify({ error: "stripe_not_configured" }));
    return;
  }
  const host = siteHost();
  const isSite = (url) => {
    try {
      return new URL(String(url)).hostname.replace(/^www\./, "") === host;
    } catch {
      return false;
    }
  };

  const allSessions = await listAll(stripe.checkout.sessions.list({ created: { gte: FROM }, limit: 100 }));
  const sessions = allSessions.filter((s) => isSite(s.success_url));
  const charges = await listAll(stripe.charges.list({ created: { gte: FROM - DAY }, limit: 100 }));
  const chargesByPi = new Map();
  for (const c of charges) {
    const pi = idOf(c.payment_intent);
    if (!pi) continue;
    if (!chargesByPi.has(pi)) chargesByPi.set(pi, []);
    chargesByPi.get(pi).push(c);
  }
  for (const list of chargesByPi.values()) list.sort((a, b) => a.created - b.created);

  const userOf = (s) => anon(s.metadata?.userId || s.metadata?.clientUserId || s.metadata?.freelancerUserId || idOf(s.customer));
  const outcomeOf = (s) => {
    if (s.payment_status === "paid" || s.payment_status === "no_payment_required") return "succeeded";
    const list = chargesByPi.get(idOf(s.payment_intent)) || [];
    if (list.length) return chargeOutcomeCategory(list[list.length - 1]);
    if (idOf(s.payment_intent)) return "attempted_without_charge";
    if (s.status === "open") return "open";
    if (s.status === "complete") return "processing";
    return "expired_without_attempt";
  };

  const report = {
    host,
    excluded: { otherSitesOrLocalQa: allSessions.length - sessions.length },
    amountAudit: { sessions: sessions.length, expectedMismatch: 0, notChargeableJod: 0, chargeVsSessionMismatch: 0 },
    windows: {},
  };
  for (const s of sessions) {
    const exp = s.metadata?.expectedAmountMinor != null ? Number(s.metadata.expectedAmountMinor) : null;
    if (exp != null && Number.isFinite(exp) && exp !== s.amount_total) report.amountAudit.expectedMismatch += 1;
    if (String(s.currency) === "jod" && Number(s.amount_total) % 10 !== 0) report.amountAudit.notChargeableJod += 1;
    for (const c of chargesByPi.get(idOf(s.payment_intent)) || []) {
      if (c.amount !== s.amount_total) report.amountAudit.chargeVsSessionMismatch += 1;
    }
  }

  for (const [name, from] of Object.entries(WINDOWS)) {
    const ss = sessions.filter((s) => s.created >= from);
    const w = { sessions: ss.length, distinctCustomers: new Set(ss.map(userOf).filter(Boolean)).size, outcomes: {}, byFlow: {},
      attempts: { sessionsWithAttempt: 0, charges: 0, byCategory: {}, byCardCountry: {}, byAmountBand: {}, distinctCards: 0 } };
    const cards = new Set();
    for (const s of ss) {
      const outcome = outcomeOf(s);
      inc(w.outcomes, outcome);
      const attempted = outcome !== "expired_without_attempt" && outcome !== "open";
      if (attempted) w.attempts.sessionsWithAttempt += 1;
      const flow = paymentFlowOf(s.metadata);
      const f = (w.byFlow[flow] = w.byFlow[flow] || { sessions: 0, attempted: 0, succeeded: 0 });
      f.sessions += 1;
      if (attempted) f.attempted += 1;
      if (outcome === "succeeded") f.succeeded += 1;
      for (const c of chargesByPi.get(idOf(s.payment_intent)) || []) {
        w.attempts.charges += 1;
        inc(w.attempts.byCategory, chargeOutcomeCategory(c));
        const card = c.payment_method_details?.card;
        inc(w.attempts.byCardCountry, `${cardCountryGroup(card?.country)}:${c.status === "succeeded" ? "ok" : "failed"}`);
        inc(w.attempts.byAmountBand, `${amountBucket(c.amount, c.currency)}:${c.status === "succeeded" ? "ok" : "failed"}`);
        if (card?.fingerprint) cards.add(anon(card.fingerprint));
      }
    }
    w.attempts.distinctCards = cards.size;
    w.succeededSessions = w.outcomes.succeeded || 0;
    w.checkoutToAttemptPct = pct(w.attempts.sessionsWithAttempt, w.sessions);
    w.attemptToSuccessPct = pct(w.succeededSessions, w.attempts.sessionsWithAttempt);
    w.smallSample = w.attempts.sessionsWithAttempt < 30;
    report.windows[name] = w;
  }
  console.log("STRIPE_PAYMENT_FUNNEL", JSON.stringify(report, null, 1));
}

main()
  .catch((err) => {
    console.error("STRIPE_PAYMENT_FUNNEL_FAILED", err?.type || err?.code || err?.name || "error");
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await require("../src/config/db").pool.end();
    } catch {
      /* the pool may never have been opened */
    }
  });
