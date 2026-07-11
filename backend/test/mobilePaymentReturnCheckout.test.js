const assert = require("node:assert/strict");
const { describe, it, beforeEach, afterEach } = require("node:test");

const { buildClientOrderCheckoutReturnUrls } = require("../src/utils/checkoutReturnUrls");
const { renderMobilePaymentReturnHtml } = require("../src/utils/mobilePaymentReturnHtml");

describe("buildClientOrderCheckoutReturnUrls", () => {
  const clientUrl = "http://localhost:5173";
  let prevBackendUrl;

  beforeEach(() => {
    prevBackendUrl = process.env.BACKEND_PUBLIC_URL;
    process.env.BACKEND_PUBLIC_URL = "http://localhost:5000";
  });

  afterEach(() => {
    if (prevBackendUrl === undefined) delete process.env.BACKEND_PUBLIC_URL;
    else process.env.BACKEND_PUBLIC_URL = prevBackendUrl;
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
  });

  it("mobile checkout uses HTTPS bridge on backend public URL", () => {
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
    assert.ok(!urls.successUrl.includes("orderzhouse://"));
    assert.ok(!urls.successUrl.includes("localhost:5173"));
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
    assert.ok(!src.includes("buildClientOrderCheckoutReturnUrls({") || src.includes("createClientSelectedBidCheckoutSession"));
  });
});
