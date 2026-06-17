const { describe, it } = require("node:test");
const assert = require("node:assert");

describe("emailService send timeout", () => {
  it("rejects hung Resend calls within EMAIL_SEND_TIMEOUT_MS", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    const prevTimeout = process.env.EMAIL_SEND_TIMEOUT_MS;
    process.env.RESEND_API_KEY = "re_test_fake";
    process.env.EMAIL_SEND_TIMEOUT_MS = "50";

    const resendPath = require.resolve("resend");
    const originalResend = require.cache[resendPath]?.exports;

    require.cache[resendPath] = {
      exports: {
        Resend: class {
          constructor() {
            this.emails = {
              send: () => new Promise(() => {}),
            };
          }
        },
      },
    };

    delete require.cache[require.resolve("../src/services/emailService")];
    const emailService = require("../src/services/emailService");

    const start = Date.now();
    await assert.rejects(
      () => emailService.sendRegisterOtpEmail("user@example.com", "123456"),
      (err) => {
        assert.strictEqual(err.statusCode, 503);
        assert.strictEqual(err.publicCode, "FAILED_TO_SEND_OTP");
        assert.strictEqual(err.otpPersisted, true);
        return true;
      },
    );
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40 && elapsed < 500, `expected ~50ms timeout, got ${elapsed}ms`);

    if (originalResend) {
      require.cache[resendPath].exports = originalResend;
    } else {
      delete require.cache[resendPath];
    }
    delete require.cache[require.resolve("../src/services/emailService")];

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevTimeout === undefined) delete process.env.EMAIL_SEND_TIMEOUT_MS;
    else process.env.EMAIL_SEND_TIMEOUT_MS = prevTimeout;
  });
});
