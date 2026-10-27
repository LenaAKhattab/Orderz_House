/**
 * Marketplace membership checkout attempts — one unresolved Stripe Checkout per freelancer + plan.
 * In-memory DB (attempt ledger + per user/plan advisory lock) and a fake Stripe provider.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_membership_attempts_placeholder";
process.env.CLIENT_URL = process.env.CLIENT_URL || "https://example-orderzhouse.test";
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_attempts_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createMarketplaceMembershipCheckoutSession } = require("../src/services/marketplaceMembershipCheckoutService");
const attemptsService = require("../src/services/marketplaceMembershipCheckoutAttemptsService");
const { normalizePaymentProviderError } = require("../src/utils/paymentProviderError");
const { errorMiddleware } = require("../src/middleware/errorMiddleware");

const PLANS = {
  starter: { id: 1, tierCode: "starter", monthlyPriceJod: 0, cycleDurationDays: 10 },
  silver: { id: 2, tierCode: "silver", monthlyPriceJod: 19, cycleDurationDays: 30 },
  pro: { id: 3, tierCode: "pro", monthlyPriceJod: 39, cycleDurationDays: 30 },
  elite: { id: 4, tierCode: "elite", monthlyPriceJod: 79, cycleDurationDays: 30 },
  annual_basic: { id: 10, tierCode: "annual_basic", monthlyPriceJod: 50, entitlementDurationMonths: 12 },
  special_offer_v2: { id: 20, tierCode: "special_offer_v2", monthlyPriceJod: 25, cycleDurationDays: 60 },
};

function getPlanByTierCode(code) {
  const p = PLANS[String(code).toLowerCase()];
  return p ? { ...p, nameAr: p.tierCode, nameEn: p.tierCode.toUpperCase(), isActive: true, saleEnabled: false } : null;
}

function createHarness() {
  const attempts = [];
  let seq = 1;
  const locks = new Map();
  const handle = (sql, params) => {
    if (sql.includes("FROM users")) {
      return { rows: [{ id: params[0], role: "freelancer", is_active: true, email: "f@example.test" }] };
    }
    if (sql.includes("INSERT INTO marketplace_membership_checkout_attempts")) {
      const dup = attempts.find(
        (a) => a.freelancer_user_id === params[0] && a.marketplace_plan_id === params[1] && a.status === "pending",
      );
      if (dup) {
        const err = new Error("duplicate key value violates unique constraint mm_checkout_attempts_one_pending_uidx");
        err.code = "23505";
        throw err;
      }
      const row = {
        id: seq++,
        freelancer_user_id: params[0],
        marketplace_plan_id: params[1],
        plan_code: params[2],
        status: "pending",
        amount_minor: params[3],
        currency: params[4],
        stripe_checkout_session_id: null,
        resolution_reason: null,
        created_at: new Date().toISOString(),
      };
      attempts.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (sql.includes("FROM marketplace_membership_checkout_attempts") && sql.includes("marketplace_plan_id = $2")) {
      const rows = attempts
        .filter((a) => a.freelancer_user_id === params[0] && a.marketplace_plan_id === params[1] && a.status === "pending")
        .sort((a, b) => b.id - a.id);
      return { rows: rows.map((a) => ({ ...a })) };
    }
    if (sql.includes("FROM marketplace_membership_checkout_attempts") && sql.includes("LIMIT $2")) {
      const rows = attempts
        .filter((a) => a.freelancer_user_id === params[0] && a.status === "pending")
        .sort((a, b) => b.id - a.id)
        .slice(0, params[1]);
      return { rows: rows.map((a) => ({ ...a })) };
    }
    if (sql.includes("UPDATE marketplace_membership_checkout_attempts") && sql.includes("SET stripe_checkout_session_id")) {
      const row = attempts.find((a) => a.id === params[0]);
      row.stripe_checkout_session_id = params[1];
      return { rows: [] };
    }
    if (sql.includes("UPDATE marketplace_membership_checkout_attempts") && sql.includes("WHERE id = $1")) {
      const row = attempts.find((a) => a.id === params[0] && a.status === "pending");
      if (row) {
        row.status = params[1];
        row.resolution_reason = params[2];
      }
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (sql.includes("UPDATE marketplace_membership_checkout_attempts") && sql.includes("stripe_checkout_session_id = $1")) {
      const row = attempts.find((a) => a.stripe_checkout_session_id === params[0] && a.status === "pending");
      if (row) row.status = sql.includes("'paid'") ? "paid" : "expired";
      return { rows: row ? [{ id: row.id }] : [] };
    }
    // Current-membership resolver / referral reads: nothing current, no referral.
    return { rows: [] };
  };
  const db = {
    async query(sql, params) {
      return handle(sql, params);
    },
    async connect() {
      let release = null;
      let lockKey = null;
      const unlock = () => {
        if (lockKey != null && locks.get(lockKey)?.release === release) locks.delete(lockKey);
        if (release) release();
        release = null;
        lockKey = null;
      };
      return {
        async query(sql, params) {
          if (sql === "BEGIN") return { rows: [] };
          if (sql === "COMMIT" || sql === "ROLLBACK") {
            unlock();
            return { rows: [] };
          }
          if (sql.includes("pg_advisory_xact_lock")) {
            assert.ok(sql.includes("marketplace_membership_checkout:"), "narrow per user+plan lock key");
            lockKey = `${params[0]}:${params[1]}`;
            while (locks.has(lockKey)) await locks.get(lockKey).done;
            let resolveDone;
            const done = new Promise((r) => {
              resolveDone = r;
            });
            release = resolveDone;
            locks.set(lockKey, { done, release });
            return { rows: [] };
          }
          return handle(sql, params);
        },
        release() {},
      };
    },
  };
  const sessions = new Map();
  const stripe = {
    createCalls: 0,
    idempotencyKeys: [],
    retrieveError: null,
    createError: null,
    checkout: {
      sessions: {
        create: async (payload, opts) => {
          if (stripe.createError) throw stripe.createError;
          stripe.createCalls += 1;
          stripe.idempotencyKeys.push(opts?.idempotencyKey);
          await new Promise((r) => setTimeout(r, 5));
          const id = `cs_test_mm_${stripe.createCalls}`;
          const s = {
            id,
            url: `https://checkout.stripe.test/${id}`,
            status: "open",
            payment_status: "unpaid",
            mode: "payment",
            amount_total: payload.line_items[0].price_data.unit_amount,
            metadata: payload.metadata,
          };
          sessions.set(id, s);
          return { ...s };
        },
        retrieve: async (id) => {
          if (stripe.retrieveError) throw stripe.retrieveError;
          const s = sessions.get(id);
          if (!s) {
            const e = new Error("No such checkout.session");
            e.type = "StripeInvalidRequestError";
            e.code = "resource_missing";
            e.statusCode = 404;
            throw e;
          }
          return { ...s };
        },
        expire: async (id) => {
          const s = sessions.get(id);
          if (s && s.status === "open") s.status = "expired";
          return { ...s };
        },
      },
    },
  };
  const applied = [];
  const applyCheckoutSessionCompleted = async (session) => {
    applied.push(session.id);
    return { status: applied.filter((x) => x === session.id).length > 1 ? "already_applied" : "applied" };
  };
  return { db, stripe, sessions, attempts, applied, applyCheckoutSessionCompleted };
}

function buy(h, planCode, userId = 42) {
  return createMarketplaceMembershipCheckoutSession(
    { freelancerUserId: userId, planCode },
    {
      db: h.db,
      stripe: h.stripe,
      getPlanByTierCode,
      resolveReferralDiscount: async () => ({ discountMinor: 0, chargeMinor: 0, policyVersionId: null }),
      applyCheckoutSessionCompleted: h.applyCheckoutSessionCompleted,
    },
  );
}

function statusRead(h, userId = 42) {
  return attemptsService.listMembershipCheckoutAttempts(userId, {
    db: h.db,
    stripe: h.stripe,
    applyCheckoutSessionCompleted: h.applyCheckoutSessionCompleted,
  });
}

describe("marketplace membership checkout attempts (one unresolved checkout per freelancer + plan)", () => {
  it("A: single checkout creates one attempt, attempt-specific idempotency key, attempt id in metadata", async () => {
    const h = createHarness();
    const r = await buy(h, "silver");
    assert.equal(r.checkoutState, "created");
    assert.equal(h.attempts.length, 1);
    assert.equal(h.attempts[0].stripe_checkout_session_id, r.sessionId);
    assert.equal(h.stripe.idempotencyKeys[0], `marketplace_membership_checkout:attempt:${h.attempts[0].id}`);
    assert.ok(!/@|42/.test(h.stripe.idempotencyKeys[0].replace(`attempt:${h.attempts[0].id}`, "")), "no user data in key");
    assert.equal(h.sessions.get(r.sessionId).metadata.checkoutAttemptId, String(h.attempts[0].id));
    assert.equal(r.membershipGranted, false);
  });

  it("B/E: double click (sequential) resumes the same open session", async () => {
    const h = createHarness();
    const a = await buy(h, "silver");
    const b = await buy(h, "silver");
    assert.equal(h.stripe.createCalls, 1);
    assert.equal(b.checkoutState, "resume");
    assert.equal(b.sessionId, a.sessionId);
    assert.equal(b.checkoutUrl, a.checkoutUrl);
    assert.equal(h.attempts.length, 1);
  });

  it("C/D: simultaneous requests (two tabs) → one Stripe session, one unresolved attempt", async () => {
    const h = createHarness();
    const results = await Promise.all([buy(h, "silver"), buy(h, "silver"), buy(h, "silver"), buy(h, "silver")]);
    assert.equal(h.stripe.createCalls, 1);
    assert.equal(new Set(results.map((r) => r.sessionId)).size, 1);
    assert.equal(h.attempts.filter((a) => a.status === "pending").length, 1);
    assert.equal(results.filter((r) => r.checkoutState === "created").length, 1);
  });

  it("L: Annual SILVER same-plan concurrency → one session; SILVER and Annual stay separate products", async () => {
    const h = createHarness();
    const annual = await Promise.all([buy(h, "annual_basic"), buy(h, "annual_basic")]);
    assert.equal(new Set(annual.map((r) => r.sessionId)).size, 1);
    const silver = await buy(h, "silver");
    assert.notEqual(silver.sessionId, annual[0].sessionId);
    assert.equal(h.stripe.createCalls, 2);
    assert.deepEqual(
      h.attempts.map((a) => [a.plan_code, a.marketplace_plan_id, a.status]),
      [
        ["annual_basic", 10, "pending"],
        ["silver", 2, "pending"],
      ],
    );
  });

  it("F: expired session → attempt closed (history kept), a fresh session with a new key", async () => {
    const h = createHarness();
    const a = await buy(h, "pro");
    h.sessions.get(a.sessionId).status = "expired";
    const b = await buy(h, "pro");
    assert.notEqual(b.sessionId, a.sessionId);
    assert.equal(b.checkoutState, "created");
    assert.deepEqual(h.attempts.map((x) => x.status), ["expired", "pending"]);
    assert.notEqual(h.stripe.idempotencyKeys[0], h.stripe.idempotencyKeys[1]);
  });

  it("G: complete + unpaid → processing, no duplicate session", async () => {
    const h = createHarness();
    const a = await buy(h, "elite");
    Object.assign(h.sessions.get(a.sessionId), { status: "complete", payment_status: "unpaid" });
    await assert.rejects(() => buy(h, "elite"), (e) => e.publicCode === "MARKETPLACE_MEMBERSHIP_PAYMENT_PROCESSING" && e.statusCode === 409);
    const read = await statusRead(h);
    assert.deepEqual(read.attempts.map((x) => [x.planCode, x.state]), [["elite", "processing"]]);
    assert.equal(h.stripe.createCalls, 1);
  });

  it("H: complete + paid → granted through the trusted dispatch, never sold again", async () => {
    const h = createHarness();
    const a = await buy(h, "silver");
    Object.assign(h.sessions.get(a.sessionId), { status: "complete", payment_status: "paid" });
    await assert.rejects(() => buy(h, "silver"), (e) => e.publicCode === "MARKETPLACE_MEMBERSHIP_ALREADY_CURRENT");
    assert.deepEqual(h.applied, [a.sessionId]);
    assert.equal(h.attempts[0].status, "paid");
    assert.equal(h.stripe.createCalls, 1);
  });

  it("H: status read reconciles a paid session and reports the membership changed", async () => {
    const h = createHarness();
    const a = await buy(h, "annual_basic");
    Object.assign(h.sessions.get(a.sessionId), { status: "complete", payment_status: "paid" });
    const read = await statusRead(h);
    assert.equal(read.membershipChanged, true);
    assert.deepEqual(read.attempts, []);
    assert.equal(h.attempts[0].status, "paid");
  });

  it("I: provider unavailable → retryable 503, attempt untouched, no new session", async () => {
    const h = createHarness();
    await buy(h, "silver");
    h.stripe.retrieveError = Object.assign(new Error("connect ETIMEDOUT"), { type: "StripeConnectionError" });
    await assert.rejects(
      () => buy(h, "silver"),
      (e) => e.statusCode === 503 && e.publicCode === "MARKETPLACE_MEMBERSHIP_PAYMENT_STATUS_UNAVAILABLE",
    );
    const read = await statusRead(h);
    assert.deepEqual(read.attempts.map((x) => x.state), ["unknown"]);
    assert.equal(h.attempts[0].status, "pending");
    assert.equal(h.stripe.createCalls, 1);
  });

  it("I: Stripe create failure keeps a failed attempt and does not lock the next purchase", async () => {
    const h = createHarness();
    h.stripe.createError = Object.assign(new Error("Invalid API Key provided: sk_test_****abcd"), {
      type: "StripeAuthenticationError",
      statusCode: 401,
    });
    await assert.rejects(() => buy(h, "silver"), (e) => e.type === "StripeAuthenticationError");
    assert.deepEqual(h.attempts.map((x) => [x.status, x.resolution_reason]), [["failed", "stripe_create_failed"]]);
    h.stripe.createError = null;
    const ok = await buy(h, "silver");
    assert.equal(ok.checkoutState, "created");
  });

  it("J: Stripe provider auth error maps to PAYMENT_PROVIDER_ERROR 502 — never a user-auth 401", () => {
    const auth = normalizePaymentProviderError(
      Object.assign(new Error("Invalid API Key provided: sk_test_****abcd"), { type: "StripeAuthenticationError", statusCode: 401 }),
    );
    assert.equal(auth.statusCode, 502);
    assert.equal(auth.publicCode, "PAYMENT_PROVIDER_ERROR");
    assert.ok(!/sk_|API Key/.test(auth.message));
    const down = normalizePaymentProviderError(Object.assign(new Error("ECONNRESET"), { type: "StripeConnectionError" }));
    assert.equal(down.statusCode, 503);
    const plain = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    assert.equal(normalizePaymentProviderError(plain), plain, "real user-auth 401 untouched");

    let status = null;
    let body = null;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    const origError = console.error;
    console.error = () => {};
    try {
      errorMiddleware(
        Object.assign(new Error("Invalid API Key provided: sk_test_****abcd"), { type: "StripeAuthenticationError", statusCode: 401 }),
        { method: "POST", originalUrl: "/api/freelancer/marketplace-membership/checkout" },
        res,
        () => {},
      );
    } finally {
      console.error = origError;
    }
    assert.equal(status, 502);
    assert.equal(body.code, "PAYMENT_PROVIDER_ERROR");
    assert.ok(!JSON.stringify(body).includes("sk_"));
  });

  it("K: another user never resumes or sees someone else's attempt; no caller-supplied session ids", async () => {
    const h = createHarness();
    const a = await buy(h, "silver", 42);
    const b = await buy(h, "silver", 77);
    assert.notEqual(b.sessionId, a.sessionId);
    assert.equal(b.checkoutState, "created");
    const readB = await statusRead(h, 77);
    assert.equal(readB.attempts.length, 1);
    const readC = await statusRead(h, 99);
    assert.deepEqual(readC.attempts, []);
    const routes = fs.readFileSync(path.join(__dirname, "../src/routes/freelancerMarketplaceMembershipRoutes.js"), "utf8");
    assert.match(routes, /router\.use\(requireAuth, requireRole\("freelancer"\)\)/);
    assert.ok(!/checkout-attempts\/:/.test(routes), "no session/attempt id in the status route");
    const controller = fs.readFileSync(path.join(__dirname, "../src/controllers/marketplaceMembershipsController.js"), "utf8");
    assert.ok(controller.includes("listMembershipCheckoutAttempts(freelancerUserId)"));
    assert.ok(!/req\.(body|query|params)\??\.sessionId/.test(controller));
    for (const x of readB.attempts) {
      assert.deepEqual(Object.keys(x).sort(), ["marketplacePlanId", "planCode", "specialOffer", "state"]);
    }
  });

  it("STARTER never reaches Stripe; special offer uses its own plan identity", async () => {
    const h = createHarness();
    await assert.rejects(() => buy(h, "starter"), (e) => e.publicCode === "MARKETPLACE_MEMBERSHIP_STARTER_NOT_STRIPE" || e.statusCode === 400);
    const offer = await buy(h, "special_offer_v2");
    const silver = await buy(h, "silver");
    assert.notEqual(offer.sessionId, silver.sessionId);
    const read = await statusRead(h);
    assert.deepEqual(
      read.attempts.map((x) => [x.planCode, x.specialOffer]).sort(),
      [["silver", false], ["special_offer_v2", true]],
    );
    assert.equal(h.stripe.createCalls, 2);
  });

  it("O: checkout.session.expired webhook closes the attempt idempotently; other purposes ignored", async () => {
    const h = createHarness();
    const a = await buy(h, "silver");
    const { applyCheckoutSessionExpired } = require("../src/controllers/stripeWebhookController");
    const session = { id: a.sessionId, metadata: h.sessions.get(a.sessionId).metadata };
    const first = await applyCheckoutSessionExpired(session, h.db);
    const second = await applyCheckoutSessionExpired(session, h.db);
    assert.equal(first.status, "applied");
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(h.attempts[0].status, "expired");
    const untracked = await applyCheckoutSessionExpired({ id: "cs_untracked", metadata: {} }, h.db);
    assert.equal(untracked.status, "ignored");
    const next = await buy(h, "silver");
    assert.equal(next.checkoutState, "created");
  });

  it("checkout.session.completed marks the attempt paid only after a successful grant", async () => {
    const h = createHarness();
    const a = await buy(h, "pro");
    const r = await attemptsService.markAttemptPaidForSession({ id: a.sessionId }, h.db);
    assert.equal(r.updated, true);
    assert.equal(h.attempts[0].status, "paid");
    const again = await attemptsService.markAttemptPaidForSession({ id: a.sessionId }, h.db);
    assert.equal(again.updated, false);
    const src = fs.readFileSync(path.join(__dirname, "../src/controllers/stripeWebhookController.js"), "utf8");
    assert.ok(src.includes('if (result?.status === "applied" || result?.status === "already_applied") {'));
    assert.ok(src.includes("await attempts.markAttemptPaidForSession(session, dbPool);"));
  });

  it("success URL / browser return never grants; reconciliation logs carry no URL or PII", async () => {
    const h = createHarness();
    const lines = [];
    const orig = console.log;
    console.log = (l) => lines.push(String(l));
    try {
      await buy(h, "silver");
      await buy(h, "silver");
      await statusRead(h);
    } finally {
      console.log = orig;
    }
    assert.deepEqual(h.applied, []);
    assert.ok(lines.some((l) => l.includes("marketplace_membership_checkout_reconcile")));
    for (const l of lines) {
      assert.ok(!l.includes("checkout.stripe.test"));
      assert.ok(!l.includes("@"));
    }
  });

  it("migration 209 is additive with a one-pending-per-target unique index", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../sql/migrations/209_marketplace_membership_checkout_attempts.sql"), "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_membership_checkout_attempts/);
    assert.match(sql, /ON marketplace_membership_checkout_attempts \(freelancer_user_id, marketplace_plan_id\)\s+WHERE status = 'pending'/);
    assert.doesNotMatch(sql, /\bDROP\s|\bALTER TABLE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
