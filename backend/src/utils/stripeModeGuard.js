/**
 * Stripe key / object mode guards — prevent silent Live/Test mixing.
 * Never logs secret values.
 */

function getStripeSecretKey() {
  return String(process.env.STRIPE_SECRET_KEY || "").trim();
}

function getStripePublishableKey() {
  return String(
    process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      "",
  ).trim();
}

/** @returns {"test"|"live"|"unknown"|"missing"} */
function getStripeSecretMode(key = getStripeSecretKey()) {
  const k = String(key || "").trim();
  if (!k) return "missing";
  if (k.startsWith("sk_test_")) return "test";
  if (k.startsWith("sk_live_")) return "live";
  return "unknown";
}

/** @returns {"test"|"live"|"unknown"|"missing"} */
function getStripePublishableMode(key = getStripePublishableKey()) {
  const k = String(key || "").trim();
  if (!k) return "missing";
  if (k.startsWith("pk_test_")) return "test";
  if (k.startsWith("pk_live_")) return "live";
  return "unknown";
}

function isStripeTestSecret(key = getStripeSecretKey()) {
  return getStripeSecretMode(key) === "test";
}

function isStripeLiveSecret(key = getStripeSecretKey()) {
  return getStripeSecretMode(key) === "live";
}

/**
 * Checkout Session IDs encode mode: cs_test_… vs cs_live_…
 * Product/Price/Customer/Subscription IDs do not — use livemode on retrieve.
 */
function getCheckoutSessionIdMode(sessionId) {
  const id = String(sessionId || "");
  if (id.startsWith("cs_test_")) return "test";
  if (id.startsWith("cs_live_")) return "live";
  return "unknown";
}

function modeMismatchError(message, code = "STRIPE_MODE_MISMATCH") {
  const err = new Error(message);
  err.statusCode = 500;
  err.code = code;
  err.exposeToClient = false;
  return err;
}

/**
 * Fail when a retrieved Stripe object’s livemode disagrees with STRIPE_SECRET_KEY.
 * @param {object|null|undefined} stripeObject
 * @param {{ label?: string, key?: string }} [opts]
 */
function assertStripeObjectMatchesSecretKey(stripeObject, opts = {}) {
  if (!stripeObject || typeof stripeObject.livemode !== "boolean") return;
  const key = opts.key || getStripeSecretKey();
  const mode = getStripeSecretMode(key);
  const label = opts.label || stripeObject.object || "stripe_object";
  if (mode === "test" && stripeObject.livemode === true) {
    throw modeMismatchError(
      `Stripe mode mismatch: secret key is TEST but ${label} is LIVE (livemode=true).`,
    );
  }
  if (mode === "live" && stripeObject.livemode === false) {
    throw modeMismatchError(
      `Stripe mode mismatch: secret key is LIVE but ${label} is TEST (livemode=false).`,
    );
  }
}

/**
 * Fail when Checkout Session id prefix disagrees with secret key mode.
 */
function assertCheckoutSessionIdMatchesSecretKey(sessionId, key = getStripeSecretKey()) {
  const keyMode = getStripeSecretMode(key);
  const sidMode = getCheckoutSessionIdMode(sessionId);
  if (keyMode === "test" && sidMode === "live") {
    throw modeMismatchError("Stripe mode mismatch: TEST secret key cannot use cs_live_ session.");
  }
  if (keyMode === "live" && sidMode === "test") {
    throw modeMismatchError("Stripe mode mismatch: LIVE secret key cannot use cs_test_ session.");
  }
}

/**
 * Hard gate for Sandbox QA helpers (Test Clock, readiness scripts).
 * Never allows production NODE_ENV or sk_live_.
 */
function assertStripeSandboxQaAllowed(extra = {}) {
  const nodeEnv = String(process.env.NODE_ENV || "").toLowerCase();
  if (nodeEnv === "production") {
    throw modeMismatchError(
      "Stripe Sandbox QA helpers are blocked when NODE_ENV=production.",
      "STRIPE_SANDBOX_QA_BLOCKED",
    );
  }
  if (!isStripeTestSecret()) {
    throw modeMismatchError(
      "Stripe Sandbox QA requires STRIPE_SECRET_KEY=sk_test_…",
      "STRIPE_SANDBOX_QA_BLOCKED",
    );
  }
  if (String(process.env.ORDERZ_QA_ISOLATED_DB || "").trim() !== "1") {
    throw modeMismatchError(
      "Stripe Sandbox QA requires ORDERZ_QA_ISOLATED_DB=1 (isolated Neon branch/test DB attestation).",
      "TEST_DATABASE_NOT_ISOLATED",
    );
  }
  if (extra.requirePublishable !== false) {
    const pubMode = getStripePublishableMode();
    if (pubMode !== "test") {
      throw modeMismatchError(
        "Stripe Sandbox QA requires VITE_STRIPE_PUBLISHABLE_KEY (or STRIPE_PUBLISHABLE_KEY)=pk_test_…",
        "STRIPE_SANDBOX_QA_BLOCKED",
      );
    }
  }
}

/**
 * Hosts known to be the shared Neon used with Live recovery — never for Sandbox QA.
 * Markers only (no credentials).
 */
const BLOCKED_SHARED_DB_HOST_MARKERS = Object.freeze([
  "ep-wandering-cherry", // shared Neon pooler used with Live subscription recovery
]);

function classifyDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  const raw = String(databaseUrl || "").trim();
  if (!raw) return { class: "MISSING", host: null, blockedShared: false };
  let host = null;
  try {
    const u = new URL(raw.replace(/^postgresql:/i, "postgres:"));
    host = u.hostname || null;
  } catch {
    host = null;
  }
  const lower = `${host || ""} ${raw}`.toLowerCase();
  const blockedShared = BLOCKED_SHARED_DB_HOST_MARKERS.some((m) => lower.includes(m.toLowerCase()));
  const looksLocal = /localhost|127\.0\.0\.1/i.test(lower);
  const looksQaNamed = /sandbox|stripe.?qa|_test\b|\/orderz_house_test|qa_renewal/i.test(lower);
  let classification = "SHARED";
  if (looksQaNamed && !blockedShared) classification = "TEST";
  if (looksLocal) classification = "LOCAL";
  if (blockedShared) classification = "SHARED";
  return { class: classification, host, blockedShared, looksQaNamed, looksLocal };
}

function assertDatabaseIsolatedForSandboxQa(databaseUrl = process.env.DATABASE_URL) {
  if (String(process.env.ORDERZ_QA_ISOLATED_DB || "").trim() !== "1") {
    const err = modeMismatchError(
      "TEST_DATABASE_NOT_ISOLATED: set ORDERZ_QA_ISOLATED_DB=1 only after pointing DATABASE_URL at an isolated Neon branch/test DB.",
      "TEST_DATABASE_NOT_ISOLATED",
    );
    throw err;
  }
  const info = classifyDatabaseUrl(databaseUrl);
  if (info.blockedShared) {
    throw modeMismatchError(
      "TEST_DATABASE_NOT_ISOLATED: DATABASE_URL matches the shared/Live Neon host marker. Use a separate Neon branch.",
      "TEST_DATABASE_NOT_ISOLATED",
    );
  }
  return info;
}

module.exports = {
  getStripeSecretKey,
  getStripePublishableKey,
  getStripeSecretMode,
  getStripePublishableMode,
  isStripeTestSecret,
  isStripeLiveSecret,
  getCheckoutSessionIdMode,
  assertStripeObjectMatchesSecretKey,
  assertCheckoutSessionIdMatchesSecretKey,
  assertStripeSandboxQaAllowed,
  assertDatabaseIsolatedForSandboxQa,
  classifyDatabaseUrl,
  BLOCKED_SHARED_DB_HOST_MARKERS,
};
