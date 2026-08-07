const assert = require("node:assert/strict");
const { describe, it, beforeEach, afterEach } = require("node:test");

const { buildClientOrderCheckoutReturnUrls } = require("../src/utils/checkoutReturnUrls");
const { renderMobilePaymentReturnHtml } = require("../src/utils/mobilePaymentReturnHtml");
const {
  getBackendPublicUrl,
  isUnsafeMobileCheckoutPublicUrl,
} = require("../src/config/backendPublicUrl");

describe("getBackendPublicUrl", () => {
  let prevBackend;
  let prevClient;
  let prevNodeEnv;
  let prevUseClient;

  beforeEach(() => {
    prevBackend = process.env.BACKEND_PUBLIC_URL;
    prevClient = process.env.CLIENT_URL;
    prevNodeEnv = process.env.NODE_ENV;
    prevUseClient = process.env.MOBILE_PAYMENT_BRIDGE_USE_CLIENT_URL;
    delete process.env.BACKEND_PUBLIC_URL;
    delete process.env.MOBILE_PAYMENT_BRIDGE_USE_CLIENT_URL;
  });

  afterEach(() => {
    if (prevBackend === undefined) delete process.env.BACKEND_PUBLIC_URL;
    else process.env.BACKEND_PUBLIC_URL = prevBackend;
    if (prevClient === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = prevClient;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevUseClient === undefined) delete process.env.MOBILE_PAYMENT_BRIDGE_USE_CLIENT_URL;
    else process.env.MOBILE_PAYMENT_BRIDGE_USE_CLIENT_URL = prevUseClient;
  });

  it("prefers BACKEND_PUBLIC_URL when set", () => {
    process.env.BACKEND_PUBLIC_URL = "https://orderzhouse.com";
    process.env.CLIENT_URL = "https://other.example";
    assert.equal(getBackendPublicUrl(), "https://orderzhouse.com");
  });

  it("production falls back to HTTPS CLIENT_URL origin (not localhost)", () => {
    process.env.NODE_ENV = "production";
    process.env.CLIENT_URL = "https://orderzhouse.com";
    delete process.env.BACKEND_PUBLIC_URL;
    assert.equal(getBackendPublicUrl(), "https://orderzhouse.com");
    assert.equal(isUnsafeMobileCheckoutPublicUrl(getBackendPublicUrl()), false);
  });

  it("dev without BACKEND_PUBLIC_URL still allows localhost fallback", () => {
    process.env.NODE_ENV = "development";
    process.env.CLIENT_URL = "http://localhost:5173";
    delete process.env.BACKEND_PUBLIC_URL;
    assert.match(getBackendPublicUrl(), /^http:\/\/localhost:\d+$/);
  });
});

describe("buildClientOrderCheckoutReturnUrls", () => {
  const clientUrl = "http://localhost:5173";
  let prevBackendUrl;
  let prevNodeEnv;
  let prevClient;

  beforeEach(() => {
    prevBackendUrl = process.env.BACKEND_PUBLIC_URL;
    prevNodeEnv = process.env.NODE_ENV;
    prevClient = process.env.CLIENT_URL;
    process.env.BACKEND_PUBLIC_URL = "http://localhost:5000";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    if (prevBackendUrl === undefined) delete process.env.BACKEND_PUBLIC_URL;
    else process.env.BACKEND_PUBLIC_URL = prevBackendUrl;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevClient === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = prevClient;
  });

  it("web checkout keeps SPA my-orders success/cancel URLs", () => {
    const urls = buildClientOrderCheckoutReturnUrls({
      isMobile: false,
      orderId: 42,
      clientUrl,
    });
    assert.ok(urls.successUrl.includes("/dashboard/client/my-orders?paid=1"));
    assert.ok(urls.successUrl.includes("orderId=42"));
    assert.ok(urls.cancelUrl.includes("cancelled=1"));
    assert.ok(!urls.successUrl.includes("/mobile/payment-return"));
    assert.ok(!urls.successUrl.includes("orderzhouse://"));
  });

  it("mobile checkout uses bridge on backend public URL with session_id and status", () => {
    const urls = buildClientOrderCheckoutReturnUrls({
      isMobile: true,
      orderId: 99,
      clientUrl,
    });
    assert.ok(urls.successUrl.startsWith("http://localhost:5000/mobile/payment-return"));
    assert.ok(urls.successUrl.includes("status=success"));
    assert.ok(urls.successUrl.includes("orderId=99"));
    assert.ok(urls.successUrl.includes("session_id={CHECKOUT_SESSION_ID}"));
    assert.ok(urls.cancelUrl.includes("status=cancel"));
    assert.ok(urls.cancelUrl.includes("session_id={CHECKOUT_SESSION_ID}"));
    assert.ok(!urls.successUrl.includes("orderzhouse://"));
    assert.ok(!urls.successUrl.includes("localhost:5173"));
  });

  it("mobile production rejects loopback BACKEND_PUBLIC_URL", () => {
    process.env.NODE_ENV = "production";
    process.env.BACKEND_PUBLIC_URL = "http://localhost:5000";
    assert.throws(
      () =>
        buildClientOrderCheckoutReturnUrls({
          isMobile: true,
          orderId: 1,
          clientUrl: "https://orderzhouse.com",
        }),
      (err) => err && err.publicCode === "MOBILE_CHECKOUT_URL_MISCONFIGURED",
    );
  });

  it("mobile production with public BACKEND_PUBLIC_URL has no localhost", () => {
    process.env.NODE_ENV = "production";
    process.env.BACKEND_PUBLIC_URL = "https://orderzhouse.com";
    const urls = buildClientOrderCheckoutReturnUrls({
      isMobile: true,
      orderId: 7,
      clientUrl: "https://orderzhouse.com",
    });
    assert.ok(urls.successUrl.startsWith("https://orderzhouse.com/mobile/payment-return"));
    assert.ok(!urls.successUrl.includes("localhost"));
    assert.ok(!urls.cancelUrl.includes("10.0.2.2"));
    assert.ok(urls.cancelUrl.includes("status=cancel"));
  });
});

describe("mobile payment return HTML bridge", () => {
  it("renders deep link without userId or token", () => {
    const html = renderMobilePaymentReturnHtml({
      deepLink: "orderzhouse://payment/success?orderId=1&session_id=cs_test_abc",
      status: "success",
    });
    assert.ok(html.includes("orderzhouse://payment/success"));
    assert.ok(html.includes("يتم إعادتك إلى التطبيق"));
    assert.ok(!html.includes("userId"));
    assert.ok(!html.includes("token"));
  });

  it("cancel status uses cancel messaging", () => {
    const html = renderMobilePaymentReturnHtml({
      deepLink: "orderzhouse://payment/cancel?orderId=2",
      status: "cancel",
    });
    assert.ok(html.includes("إلغاء الدفع"));
  });
});

describe("freelancer subscription checkout URLs unchanged", () => {
  it("stripeCheckoutService freelancer paths still use dashboard/freelancer/plans", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "stripeCheckoutService.js"),
      "utf8",
    );
    assert.ok(src.includes("/dashboard/freelancer/plans?freelancer_sub_paid=1"));
    assert.ok(src.includes("/dashboard/freelancer/plans?freelancer_activation_fee_paid=1"));
  });
});
