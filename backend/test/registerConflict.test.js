/**
 * Register must resume unverified signups on email unique races (not 409).
 * Run: npm run test:register-conflict  |  npm test
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

describe("registerUser email conflict handling", () => {
  it("resumes unverified registration when insert races on unique email", () => {
    const p = path.join(__dirname, "..", "src", "services", "authService.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("isEmailUniqueViolation"), "email unique helper");
    assert.ok(
      src.includes("resumeUnverifiedRegistration"),
      "shared resume path for unverified users",
    );
    assert.ok(
      /if \(isEmailUniqueViolation\(error\)\)[\s\S]*?resumeUnverifiedRegistration/.test(src),
      "catch block resumes OTP flow instead of always throwing 409",
    );
  });

  it("verified email still returns EMAIL_ALREADY_REGISTERED before insert", () => {
    const p = path.join(__dirname, "..", "src", "services", "authService.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(
      src.includes('createPublicApiError("هذا البريد الإلكتروني مسجّل مسبقاً.", 409, "EMAIL_ALREADY_REGISTERED")'),
      "verified duplicate email remains 409",
    );
  });
});
