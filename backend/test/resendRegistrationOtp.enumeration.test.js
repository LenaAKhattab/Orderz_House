/**
 * Registration OTP resend must not reveal whether an email exists (enumeration-safe).
 * Run: npm run test:resend-register-otp  |  npm test
 *
 * Loads authOtpService with mocked pg pool + emailService (no real DB / Resend).
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/resend_reg_otp_enum_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");

const dbPath = path.join(__dirname, "..", "src", "config", "db.js");
const emailPath = path.join(__dirname, "..", "src", "services", "emailService.js");
const otpPath = path.join(__dirname, "..", "src", "services", "authOtpService.js");

function clearOtpServiceLoad() {
  delete require.cache[otpPath];
  delete require.cache[emailPath];
  delete require.cache[dbPath];
}

/**
 * @param {"unknown"|"verified"|"unverified"|"unverified_cooldown"} scenario
 */
function installMocks(scenario) {
  const sent = [];

  const mockPool = {
    connect: async () => ({
      query: async (sql) => {
        const s = String(sql);
        if (s === "BEGIN") return {};
        if (s.includes("FROM users") && s.includes("FOR UPDATE")) {
          if (scenario === "unknown") return { rows: [] };
          if (scenario === "verified") return { rows: [{ id: 1, email_verified: true }] };
          return { rows: [{ id: 99, email_verified: false }] };
        }
        if (s.includes("SELECT last_sent_at FROM auth_otps")) {
          if (scenario === "unverified_cooldown") {
            return { rows: [{ last_sent_at: new Date() }] };
          }
          return { rows: [] };
        }
        if (s.includes("UPDATE auth_otps") && s.includes("consumed_at")) return { rowCount: 0 };
        if (s.includes("INSERT INTO auth_otps")) return { rows: [{ id: 1 }] };
        if (s === "COMMIT") return {};
        if (s === "ROLLBACK") return {};
        throw new Error(`unexpected sql in mock: ${s.slice(0, 100)}`);
      },
      release() {},
    }),
  };

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: mockPool, connectDB: async () => {} },
  };
  require.cache[emailPath] = {
    id: emailPath,
    filename: emailPath,
    loaded: true,
    exports: {
      sendRegisterOtpEmail: async (email, otp) => {
        sent.push({ email, otp: String(otp) });
      },
      sendForgotPasswordOtpEmail: async () => {},
    },
  };

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { resendRegistrationOtp } = require("../src/services/authOtpService");
  return { resendRegistrationOtp, sent };
}

describe("resendRegistrationOtp enumeration safety", () => {
  it("unknown email: resolves without sending mail (no NOT_FOUND)", async () => {
    clearOtpServiceLoad();
    const { resendRegistrationOtp, sent } = installMocks("unknown");
    const out = await resendRegistrationOtp("nobody@example.com");
    assert.strictEqual(out, undefined);
    assert.deepStrictEqual(sent, []);
  });

  it("already verified: resolves without sending mail (same as unknown for probes)", async () => {
    clearOtpServiceLoad();
    const { resendRegistrationOtp, sent } = installMocks("verified");
    const out = await resendRegistrationOtp("verified@example.com");
    assert.strictEqual(out, undefined);
    assert.deepStrictEqual(sent, []);
  });

  it("successful paths return undefined (matches forgot-password no-op; HTTP body from controller)", async () => {
    for (const scenario of ["unknown", "verified", "unverified"]) {
      clearOtpServiceLoad();
      const { resendRegistrationOtp } = installMocks(scenario);
      assert.strictEqual(await resendRegistrationOtp(`probe-${scenario}@example.com`), undefined);
    }
  });

  it("unverified user (no cooldown): sends exactly one registration OTP", async () => {
    clearOtpServiceLoad();
    const { resendRegistrationOtp, sent } = installMocks("unverified");
    await resendRegistrationOtp("pending@example.com");
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].email, "pending@example.com");
    assert.ok(/^\d{6}$/.test(sent[0].otp), "OTP must be six digits");
  });

  it("unverified + cooldown: still rate-limited (429)", async () => {
    clearOtpServiceLoad();
    const { resendRegistrationOtp } = installMocks("unverified_cooldown");
    await assert.rejects(
      () => resendRegistrationOtp("fast@example.com"),
      (err) => err.statusCode === 429 && String(err.message).includes("60"),
    );
  });

  it("public API uses one generic success message (no ‘account not found’ leak)", () => {
    const controllerSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "controllers", "authController.js"),
      "utf8",
    );
    assert.ok(
      controllerSrc.includes(
        "إذا كان هناك حساب بانتظار تأكيد البريد الإلكتروني، سيتم إرسال رمز التحقق.",
      ),
      "resend-register success message must be enumeration-safe",
    );
    assert.ok(
      !controllerSrc.includes("تم إرسال رمز تحقق جديد إلى بريدك"),
      "old definitive send message must not remain on resend-register path",
    );
  });

  it("auth routes keep otpSendLimiter on resend-register-otp", () => {
    const routesSrc = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "authRoutes.js"), "utf8");
    assert.ok(
      routesSrc.includes('router.post("/resend-register-otp", otpSendLimiter'),
      "resend-register-otp should stay behind otpSendLimiter",
    );
  });

  it("service must not expose NOT_FOUND for missing user on resend path", () => {
    const otpSrc = fs.readFileSync(otpPath, "utf8");
    const idx = otpSrc.indexOf("async function resendRegistrationOtp");
    assert.ok(idx >= 0);
    const fnChunk = otpSrc.slice(idx, idx + 2200);
    assert.ok(!fnChunk.includes("NOT_FOUND"), "resendRegistrationOtp should not use NOT_FOUND");
    assert.ok(!fnChunk.includes("لم يتم العثور على حساب"), "no account-not-found Arabic in resendRegistrationOtp");
  });
});
