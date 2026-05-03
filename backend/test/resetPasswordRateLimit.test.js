/**
 * Reset-password route must be rate-limited (IP + email key) with 429 JSON matching other limiters.
 * Run: npm run test:reset-password-ratelimit  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/reset_pw_ratelimit_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { resetPasswordRateLimitKey, RATE_LIMITED_CODE } = require("../src/middleware/rateLimiters");

describe("resetPasswordLimiter", () => {
  it("auth route applies resetPasswordLimiter before validators", () => {
    const p = path.join(__dirname, "..", "src", "routes", "authRoutes.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(
      src.includes("router.post(") && src.includes('"/reset-password"') && src.includes("resetPasswordLimiter"),
      "POST /reset-password must use resetPasswordLimiter",
    );
    const resetBlock = src.slice(src.indexOf('"/reset-password"'), src.indexOf("authController.resetPassword") + 30);
    assert.ok(
      resetBlock.indexOf("resetPasswordLimiter") < resetBlock.indexOf("resetPasswordValidators"),
      "resetPasswordLimiter must run before resetPasswordValidators",
    );
  });

  it("resetPasswordRateLimitKey uses ipKeyGenerator (IPv4) and normalized email", () => {
    const req = { ip: "203.0.113.1", body: { email: "  User@Example.COM  " }, socket: {} };
    // IPv4 passes through ipKeyGenerator unchanged
    assert.strictEqual(resetPasswordRateLimitKey(req), "reset_pw:203.0.113.1:user@example.com");
  });

  it("resetPasswordRateLimitKey falls back to IP when email missing", () => {
    const req = { ip: "198.51.100.2", body: {}, socket: {} };
    assert.strictEqual(resetPasswordRateLimitKey(req), "reset_pw:198.51.100.2");
  });

  it("different emails get different keys for same IP (limits token guesses per account)", () => {
    const base = { ip: "10.0.0.1", socket: {} };
    const a = resetPasswordRateLimitKey({ ...base, body: { email: "a@x.com" } });
    const b = resetPasswordRateLimitKey({ ...base, body: { email: "b@x.com" } });
    assert.notStrictEqual(a, b);
  });

  it("429 handler matches shared rateLimitJsonHandler shape (success false + code)", () => {
    const p = path.join(__dirname, "..", "src", "middleware", "rateLimiters.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("resetPasswordLimiter"), "resetPasswordLimiter defined");
    assert.ok(
      src.includes("ipKeyGenerator"),
      "keyGenerator must use ipKeyGenerator for IPv6-safe limiting (express-rate-limit)",
    );
    assert.ok(
      src.includes('rateLimitJsonHandler("تم تجاوز عدد محاولات إعادة تعيين كلمة المرور، حاول لاحقاً")'),
      "reset password uses Arabic handler like other limiters",
    );
    assert.ok(src.includes("RATE_LIMITED_CODE"), "handler uses RATE_LIMITED_CODE via rateLimitJsonHandler");
  });

  it("429 response contract matches otpVerifyLimiter (success/message/code)", () => {
    assert.strictEqual(RATE_LIMITED_CODE, "RATE_LIMITED");
    const limitersSrc = fs.readFileSync(path.join(__dirname, "..", "src", "middleware", "rateLimiters.js"), "utf8");
    assert.ok(
      limitersSrc.includes("res.status(429).json"),
      "handler uses 429 + JSON body like other limiters",
    );
    assert.ok(
      limitersSrc.includes("success: false") && limitersSrc.includes("code: RATE_LIMITED_CODE"),
      "429 payload includes success false and code",
    );
  });

  it("resetPasswordLimiter mirrors otpVerifyLimiter window and max (5 / 10 min)", () => {
    const p = path.join(__dirname, "..", "src", "middleware", "rateLimiters.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(/const resetPasswordLimiter = rateLimit\(\{[\s\S]*?windowMs:\s*10 \* 60 \* 1000[\s\S]*?max:\s*5/.test(src));
    assert.ok(src.includes("skipSuccessfulRequests: true"), "successful reset should not consume quota");
  });

  it("exports RATE_LIMITED_CODE for clients", () => {
    assert.strictEqual(RATE_LIMITED_CODE, "RATE_LIMITED");
  });
});
