/**
 * Public homepage read limiter architecture.
 * Run: node --test test/publicReadRateLimitArchitecture.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/public_read_ratelimit_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { isPublicReadRateLimitedPath } = require("../src/middleware/publicReadRateLimiter");
const { getPublicReadRateLimitMax, DEFAULT_MAX } = require("../src/config/publicReadRateLimit");
const { shouldSkipGeneralApiRateLimit } = require("../src/middleware/apiRateLimiter");

describe("public_read path matching", () => {
  it("covers homepage public GETs and pool list", () => {
    assert.strictEqual(isPublicReadRateLimitedPath({ path: "/public/home-stats", method: "GET" }), true);
    assert.strictEqual(isPublicReadRateLimitedPath({ path: "/public/ads", method: "GET" }), true);
    assert.strictEqual(isPublicReadRateLimitedPath({ path: "/orders/pool", method: "GET" }), true);
  });

  it("does not cover writes or auth", () => {
    assert.strictEqual(isPublicReadRateLimitedPath({ path: "/public/ads/1/click", method: "POST" }), false);
    assert.strictEqual(isPublicReadRateLimitedPath({ path: "/auth/login", method: "POST" }), false);
    assert.strictEqual(isPublicReadRateLimitedPath({ path: "/orders/pool/1/take", method: "POST" }), false);
  });

  it("default max is relaxed above global homepage poll budget", () => {
    const prev = process.env.PUBLIC_READ_RATE_LIMIT_MAX;
    delete process.env.PUBLIC_READ_RATE_LIMIT_MAX;
    assert.ok(DEFAULT_MAX >= 1000);
    assert.ok(getPublicReadRateLimitMax() >= 1000);
    if (prev === undefined) delete process.env.PUBLIC_READ_RATE_LIMIT_MAX;
    else process.env.PUBLIC_READ_RATE_LIMIT_MAX = prev;
  });

  it("public GETs skip global and match public_read", () => {
    assert.strictEqual(shouldSkipGeneralApiRateLimit({ path: "/public/faq", method: "GET" }), true);
    assert.strictEqual(isPublicReadRateLimitedPath({ path: "/public/faq", method: "GET" }), true);
  });
});

describe("wiring source contracts", () => {
  it("app mounts public read limiter after global api limiter", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
    assert.ok(src.includes("createPublicReadLimiter"));
    const globalIdx = src.indexOf("createApiGeneralLimiter()");
    const publicIdx = src.indexOf("createPublicReadLimiter()");
    assert.ok(globalIdx >= 0 && publicIdx > globalIdx);
  });

  it("login limiter remains wired on auth routes", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "authRoutes.js"), "utf8");
    assert.ok(src.includes("loginLimiter"));
  });
});
