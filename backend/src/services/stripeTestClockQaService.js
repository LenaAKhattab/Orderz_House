/**
 * TEST-ONLY Stripe Test Clock helpers for recurring renewal QA.
 *
 * Hard-blocked unless:
 * - STRIPE_SECRET_KEY=sk_test_
 * - NODE_ENV !== production
 * - ORDERZ_QA_ISOLATED_DB=1
 *
 * Never expose from public freelancer UI routes.
 */

const { pool } = require("../config/db");
const {
  assertStripeSandboxQaAllowed,
  assertStripeObjectMatchesSecretKey,
  isStripeTestSecret,
} = require("../utils/stripeModeGuard");

const METADATA_VERSION = "1";
const QA_EMAIL = "stripe-renewal-qa@local.test";

function requireTestStripe(stripe) {
  assertStripeSandboxQaAllowed({ requirePublishable: false });
  if (!stripe) {
    const err = new Error("Stripe client required.");
    err.statusCode = 500;
    throw err;
  }
  if (!isStripeTestSecret()) {
    const err = new Error("Test Clock helpers require sk_test_.");
    err.statusCode = 500;
    err.code = "STRIPE_SANDBOX_QA_BLOCKED";
    throw err;
  }
}

/**
 * Create a Stripe Test Clock (frozen time defaults to now).
 * @returns {Promise<{ id: string, frozen_time: number }>}
 */
async function createStripeTestClock({ stripe, frozenTimeUnix = null, name = "orderz-house-renewal-qa" }) {
  requireTestStripe(stripe);
  const frozen_time =
    frozenTimeUnix != null ? Number(frozenTimeUnix) : Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time,
    name: String(name).slice(0, 120),
  });
  assertStripeObjectMatchesSecretKey(clock, { label: "test_clock" });
  return { id: clock.id, frozen_time: clock.frozen_time };
}

/**
 * Ensure the freelancer user has a Stripe Customer bound to the given Test Clock.
 * If the user already has a customer on a different clock (or no clock), refuses.
 */
async function ensureTestClockCustomerForUser(
  { stripe, userId, testClockId, email = null },
  client,
) {
  requireTestStripe(stripe);
  const runner = client || pool;
  const uid = Number(userId);
  const clockId = String(testClockId || "").trim();
  if (!Number.isInteger(uid) || uid < 1 || !clockId) {
    const err = new Error("userId and testClockId are required.");
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await runner.query(
    "SELECT id, email, stripe_customer_id FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
    [uid],
  );
  const user = rows[0];
  if (!user) {
    const err = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }

  if (user.stripe_customer_id) {
    const existing = await stripe.customers.retrieve(String(user.stripe_customer_id));
    assertStripeObjectMatchesSecretKey(existing, { label: "customer" });
    const existingClock =
      typeof existing.test_clock === "string"
        ? existing.test_clock
        : existing.test_clock?.id || null;
    if (existingClock && existingClock === clockId) {
      return String(existing.id);
    }
    const err = new Error(
      `User ${uid} already has stripe_customer_id not bound to Test Clock ${clockId}. Use a fresh QA user or clear TEST customer id in the isolated DB only.`,
    );
    err.statusCode = 409;
    err.code = "STRIPE_TEST_CLOCK_CUSTOMER_CONFLICT";
    throw err;
  }

  const customer = await stripe.customers.create({
    email: email || user.email || undefined,
    test_clock: clockId,
    metadata: {
      platform: "FAZAAT",
      project: "Orderz House",
      user_id: String(uid),
      metadata_version: METADATA_VERSION,
      qa: "stripe_renewal_sandbox",
    },
  });
  assertStripeObjectMatchesSecretKey(customer, { label: "customer" });
  await runner.query("UPDATE users SET stripe_customer_id = $2, updated_at = NOW() WHERE id = $1", [
    uid,
    customer.id,
  ]);
  return String(customer.id);
}

async function advanceStripeTestClock({ stripe, testClockId, frozenTimeUnix }) {
  requireTestStripe(stripe);
  const clockId = String(testClockId || "").trim();
  const frozen_time = Number(frozenTimeUnix);
  if (!clockId || !Number.isFinite(frozen_time)) {
    const err = new Error("testClockId and frozenTimeUnix are required.");
    err.statusCode = 400;
    throw err;
  }
  const clock = await stripe.testHelpers.testClocks.advance(clockId, { frozen_time });
  assertStripeObjectMatchesSecretKey(clock, { label: "test_clock" });
  return clock;
}

module.exports = {
  QA_EMAIL,
  createStripeTestClock,
  ensureTestClockCustomerForUser,
  advanceStripeTestClock,
};
