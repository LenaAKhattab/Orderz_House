/**
 * Registration route must use a dedicated limiter (IP + email) with 429 JSON contract.
 * Run: npm run test:register-ratelimit  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/register_ratelimit_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  registerRateLimitKey,
  RATE_LIMITED_CODE,
  REGISTER_LIMIT_WINDOW_MS,
  REGISTER_LIMIT_MAX,
} = require("../src/middleware/rateLimiters");

describe("registerLimiter", () => {
  it("auth route applies registerLimiter (not otpSendLimiter) before validators", () => {
    const p = path.join(__dirname, "..", "src", "routes", "authRoutes.js");
    const src = fs.readFileSync(p, "utf8");
    const registerBlock = src.slice(src.indexOf('"/register"'), src.indexOf("authController.register") + 30);
    assert.ok(registerBlock.includes("registerLimiter"), "POST /register must use registerLimiter");
    assert.ok(
      !registerBlock.includes("otpSendLimiter"),
      "register must not share otpSendLimiter with forgot-password",
    );
    assert.ok(
      registerBlock.indexOf("registerLimiter") < registerBlock.indexOf("registerValidators"),
      "registerLimiter must run before registerValidators",
    );
  });

  it("registerRateLimitKey uses ipKeyGenerator and normalized email", () => {
    const req = { ip: "203.0.113.1", body: { email: "  User@Example.COM  " }, socket: {} };
    assert.strictEqual(registerRateLimitKey(req), "register:203.0.113.1:user@example.com");
  });

  it("registerRateLimitKey falls back to IP when email missing", () => {
    const req = { ip: "198.51.100.2", body: {}, socket: {} };
    assert.strictEqual(registerRateLimitKey(req), "register:198.51.100.2");
  });

  it("different emails get different keys for same IP", () => {
    const base = { ip: "10.0.0.1", socket: {} };
    const a = registerRateLimitKey({ ...base, body: { email: "a@x.com" } });
    const b = registerRateLimitKey({ ...base, body: { email: "b@x.com" } });
    assert.notStrictEqual(a, b);
  });

  it("429 handler returns English registration message and RATE_LIMITED code", () => {
    const p = path.join(__dirname, "..", "src", "middleware", "rateLimiters.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("registerRateLimitHandler"), "dedicated register handler");
    assert.ok(
      src.includes("Too many registration attempts. Please try again later."),
      "registration 429 uses English message",
    );
    assert.ok(src.includes('res.set("Retry-After"'), "429 includes Retry-After header");
    assert.ok(src.includes("success: false") && src.includes("code: RATE_LIMITED_CODE"));
  });

  it("register limiter uses 8 requests per 15 minutes", () => {
    assert.strictEqual(REGISTER_LIMIT_WINDOW_MS, 15 * 60 * 1000);
    assert.strictEqual(REGISTER_LIMIT_MAX, 8);
    const p = path.join(__dirname, "..", "src", "middleware", "rateLimiters.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(/const registerLimiter = rateLimit\(\{[\s\S]*?windowMs:\s*REGISTER_LIMIT_WINDOW_MS[\s\S]*?max:\s*REGISTER_LIMIT_MAX/.test(src));
  });

  it("exports RATE_LIMITED_CODE for clients", () => {
    assert.strictEqual(RATE_LIMITED_CODE, "RATE_LIMITED");
  });
});
