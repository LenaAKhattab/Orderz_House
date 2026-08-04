const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

function loadEmailServiceFresh() {
  delete require.cache[require.resolve("../src/services/emailService")];
  return require("../src/services/emailService");
}

describe("emailService mock delivery mode", () => {
  const prev = {};

  beforeEach(() => {
    for (const k of ["NODE_ENV", "EMAIL_DELIVERY_MODE", "RESEND_API_KEY"]) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    delete require.cache[require.resolve("../src/services/emailService")];
  });

  it("mocks OTP send when EMAIL_DELIVERY_MODE=mock in development even if RESEND_API_KEY is set", async () => {
    process.env.NODE_ENV = "development";
    process.env.EMAIL_DELIVERY_MODE = "mock";
    process.env.RESEND_API_KEY = "re_should_not_be_called";
    const emailService = loadEmailServiceFresh();
    assert.strictEqual(emailService.isMockEmailDeliveryEnabled(), true);
    const out = await emailService.sendRegisterOtpEmail("dev@example.com", "654321");
    assert.strictEqual(out.id, "dev_console");
  });

  it("never mocks when NODE_ENV=production even if EMAIL_DELIVERY_MODE=mock", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_DELIVERY_MODE = "mock";
    process.env.RESEND_API_KEY = "re_test_fake";
    process.env.EMAIL_SEND_TIMEOUT_MS = "50";

    const resendPath = require.resolve("resend");
    const originalResend = require.cache[resendPath]?.exports;
    let sendCalled = false;
    require.cache[resendPath] = {
      exports: {
        Resend: class {
          constructor() {
            this.emails = {
              send: async () => {
                sendCalled = true;
                return { data: { id: "real" }, error: null };
              },
            };
          }
        },
      },
    };

    const emailService = loadEmailServiceFresh();
    assert.strictEqual(emailService.isMockEmailDeliveryEnabled(), false);
    const out = await emailService.sendRegisterOtpEmail("prod@example.com", "111111");
    assert.strictEqual(sendCalled, true);
    assert.strictEqual(out.id, "real");

    if (originalResend) require.cache[resendPath].exports = originalResend;
    else delete require.cache[resendPath];
  });

  it("mocks in development when RESEND_API_KEY is empty (legacy path)", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.EMAIL_DELIVERY_MODE;
    delete process.env.RESEND_API_KEY;
    const emailService = loadEmailServiceFresh();
    assert.strictEqual(emailService.isMockEmailDeliveryEnabled(), true);
    const out = await emailService.sendForgotPasswordOtpEmail("dev@example.com", "999888");
    assert.strictEqual(out.id, "dev_console");
  });
});
