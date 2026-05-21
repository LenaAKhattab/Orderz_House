/**
 * Phase 4A — security baseline (no live server).
 * Run: npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/phase4a_security_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { getAutomationCronSecret } = require("../src/config/fakeOrdersAutomation");
const {
  getApiRateLimitWindowMs,
  getApiRateLimitMax,
  isApiRateLimitEnabled,
} = require("../src/config/apiRateLimit");
const { shouldSkipGeneralApiRateLimit } = require("../src/middleware/apiRateLimiter");
const {
  shouldSkipOriginGuard,
  normalizeOriginUrl,
} = require("../src/middleware/originGuardMiddleware");
const { sanitizePublicPoolOrder } = require("../src/utils/poolOrderSanitize");

describe("api rate limit config", () => {
  it("defaults to enabled with sane window and max", () => {
    const prevW = process.env.API_RATE_LIMIT_WINDOW_MS;
    const prevM = process.env.API_RATE_LIMIT_MAX;
    delete process.env.API_RATE_LIMIT_WINDOW_MS;
    delete process.env.API_RATE_LIMIT_MAX;
    assert.strictEqual(isApiRateLimitEnabled(), true);
    assert.ok(getApiRateLimitWindowMs() >= 60_000);
    assert.ok(getApiRateLimitMax() >= 100);
    process.env.API_RATE_LIMIT_WINDOW_MS = prevW;
    process.env.API_RATE_LIMIT_MAX = prevM;
  });

  it("skips Stripe webhook and health paths", () => {
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/webhooks/stripe" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/health" }), true);
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/auth/login" }), false);
  });
});

describe("automation cron secret", () => {
  it("rejects short and placeholder secrets", () => {
    const prev = process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET;
    process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET = "changeme";
    assert.strictEqual(getAutomationCronSecret(), null);
    process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET = "short";
    assert.strictEqual(getAutomationCronSecret(), null);
    process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET =
      "a-valid-production-secret-min-16";
    assert.strictEqual(getAutomationCronSecret(), "a-valid-production-secret-min-16");
    if (prev === undefined) delete process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET;
    else process.env.FAKE_ORDERS_AUTOMATION_CRON_SECRET = prev;
  });
});

describe("origin guard", () => {
  it("skips webhooks and internal paths", () => {
    assert.strictEqual(shouldSkipOriginGuard({ path: "/webhooks/stripe" }), true);
    assert.strictEqual(shouldSkipOriginGuard({ path: "/internal/fake-orders/automation-tick" }), true);
    assert.strictEqual(shouldSkipOriginGuard({ path: "/auth/login" }), false);
  });

  it("normalizes origin URLs", () => {
    assert.strictEqual(normalizeOriginUrl("https://app.example.com/path"), "https://app.example.com");
    assert.strictEqual(normalizeOriginUrl("not-a-url"), null);
  });
});

describe("app.js security wiring", () => {
  it("keeps Stripe raw body before express.json and applies helmet", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
    const stripeIdx = src.indexOf('app.use("/api/webhooks/stripe"');
    const jsonIdx = src.indexOf("app.use(express.json()");
    const helmetIdx = src.indexOf("applySecurityHeaders");
    assert.ok(stripeIdx > -1 && jsonIdx > -1, "stripe + json present");
    assert.ok(stripeIdx < jsonIdx, "Stripe webhook must register before express.json()");
    assert.ok(helmetIdx > -1 && helmetIdx < jsonIdx, "helmet before express.json");
    assert.ok(src.includes("createApiGeneralLimiter()"), "general API rate limit mounted");
    assert.ok(src.includes("originGuardMiddleware"), "origin guard mounted on /api");
  });
});

describe("auth rate limit coverage", () => {
  it("login, register, OTP, and reset-password routes use limiters", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "authRoutes.js"), "utf8");
    assert.ok(src.includes("loginLimiter"), "login limited");
    assert.ok(src.includes('"/register"') && src.includes("otpSendLimiter"), "register limited");
    assert.ok(src.includes('"/verify-register-otp"') && src.includes("otpVerifyLimiter"), "register OTP verify limited");
    assert.ok(src.includes('"/forgot-password"') && src.includes("otpSendLimiter"), "forgot-password limited");
    assert.ok(src.includes("resetPasswordLimiter"), "reset-password limited");
  });
});

describe("public pool sanitizer — no PII leak", () => {
  it("strips client identifiers and payment fields from guest pool rows", () => {
    const safe = sanitizePublicPoolOrder({
      id: "1",
      title: "Job",
      createdByUserId: "77",
      clientEmail: "secret@x.com",
      clientPhone: "+962",
      paymentStatus: "paid",
      assignedFreelancerId: "9",
      internalNotes: "secret",
      files: [{ secureUrl: "https://x/y" }],
    });
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "createdByUserId"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "clientEmail"));
    assert.ok(!Object.prototype.hasOwnProperty.call(safe, "paymentStatus"));
    assert.strictEqual(safe.files.length, 0);
  });
});

describe("order upload file filter", () => {
  it("rejects dangerous extensions in middleware source", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "middleware", "ordersUploadMiddleware.js"),
      "utf8",
    );
    assert.ok(src.includes("DANGEROUS_FILENAME"));
    assert.ok(/\(exe\|bat/.test(src));
  });
});
