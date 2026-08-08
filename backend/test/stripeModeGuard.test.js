/**
 * Stripe mode guard unit tests.
 * Run: node --test test/stripeModeGuard.test.js
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  getStripeSecretMode,
  getStripePublishableMode,
  getCheckoutSessionIdMode,
  assertStripeObjectMatchesSecretKey,
  assertCheckoutSessionIdMatchesSecretKey,
  assertStripeSandboxQaAllowed,
  assertDatabaseIsolatedForSandboxQa,
  classifyDatabaseUrl,
} = require("../src/utils/stripeModeGuard");

const prev = { ...process.env };

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in prev)) delete process.env[k];
  }
  Object.assign(process.env, prev);
});

describe("stripe key mode detection", () => {
  it("detects sk_test_ / sk_live_", () => {
    assert.equal(getStripeSecretMode("sk_test_abc"), "test");
    assert.equal(getStripeSecretMode("sk_live_abc"), "live");
    assert.equal(getStripeSecretMode(""), "missing");
  });

  it("detects pk_test_ / pk_live_", () => {
    assert.equal(getStripePublishableMode("pk_test_x"), "test");
    assert.equal(getStripePublishableMode("pk_live_x"), "live");
  });

  it("detects cs_test_ / cs_live_", () => {
    assert.equal(getCheckoutSessionIdMode("cs_test_123"), "test");
    assert.equal(getCheckoutSessionIdMode("cs_live_123"), "live");
  });
});

describe("livemode object guards", () => {
  it("rejects LIVE object with TEST secret", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    assert.throws(
      () => assertStripeObjectMatchesSecretKey({ object: "price", livemode: true }),
      (e) => e && e.code === "STRIPE_MODE_MISMATCH",
    );
  });

  it("rejects TEST object with LIVE secret", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    assert.throws(
      () => assertStripeObjectMatchesSecretKey({ object: "customer", livemode: false }),
      (e) => e && e.code === "STRIPE_MODE_MISMATCH",
    );
  });

  it("allows matching modes", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    assert.doesNotThrow(() =>
      assertStripeObjectMatchesSecretKey({ object: "price", livemode: false }),
    );
  });

  it("rejects cs_live with sk_test", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    assert.throws(
      () => assertCheckoutSessionIdMatchesSecretKey("cs_live_abc"),
      (e) => e && e.code === "STRIPE_MODE_MISMATCH",
    );
  });
});

describe("sandbox QA + DB isolation", () => {
  it("blocks production NODE_ENV", () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.ORDERZ_QA_ISOLATED_DB = "1";
    process.env.VITE_STRIPE_PUBLISHABLE_KEY = "pk_test_x";
    assert.throws(() => assertStripeSandboxQaAllowed(), (e) => e && e.code === "STRIPE_SANDBOX_QA_BLOCKED");
  });

  it("blocks shared Neon host marker", () => {
    process.env.ORDERZ_QA_ISOLATED_DB = "1";
    process.env.DATABASE_URL =
      "postgresql://u:p@ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech/neondb";
    assert.throws(
      () => assertDatabaseIsolatedForSandboxQa(),
      (e) => e && e.code === "TEST_DATABASE_NOT_ISOLATED",
    );
  });

  it("classifies localhost DB as LOCAL", () => {
    const info = classifyDatabaseUrl("postgresql://u:p@localhost:5432/orderz_house_test");
    assert.equal(info.class, "LOCAL");
    assert.equal(info.blockedShared, false);
  });

  it("allows sandbox QA when gates set", () => {
    process.env.NODE_ENV = "development";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.VITE_STRIPE_PUBLISHABLE_KEY = "pk_test_x";
    process.env.ORDERZ_QA_ISOLATED_DB = "1";
    assert.doesNotThrow(() => assertStripeSandboxQaAllowed());
  });
});

describe("test clock service is test-only", () => {
  it("source hard-requires sandbox gates", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeTestClockQaService.js"),
      "utf8",
    );
    assert.match(src, /assertStripeSandboxQaAllowed/);
    assert.match(src, /test_clock/);
    assert.match(src, /testHelpers\.testClocks/);
    assert.doesNotMatch(src, /router\.(get|post|patch)/);
  });
});
