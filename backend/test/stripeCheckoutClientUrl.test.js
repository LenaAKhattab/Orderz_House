/**
 * Stripe Checkout redirect URLs must follow CLIENT_URL (getPrimaryClientUrl).
 * Regression: stale localhost:5174 must never appear when CLIENT_URL is 5173 / production.
 */
const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  getPrimaryClientUrl,
  buildFreelancerPlansCheckoutReturnUrls,
  buildFreelancerActivationFeeCheckoutReturnUrls,
} = require("../src/config/clientUrl");

const prevClientUrl = process.env.CLIENT_URL;
const prevNodeEnv = process.env.NODE_ENV;

describe("Stripe freelancer checkout CLIENT_URL redirects", () => {
  afterEach(() => {
    if (prevClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = prevClientUrl;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("dev CLIENT_URL=localhost:5173 produces success + cancel on 5173", () => {
    process.env.CLIENT_URL = "http://localhost:5173";
    const base = getPrimaryClientUrl();
    const urls = buildFreelancerPlansCheckoutReturnUrls(base);
    assert.equal(
      urls.successUrl,
      "http://localhost:5173/dashboard/freelancer/plans?freelancer_sub_paid=1&session_id={CHECKOUT_SESSION_ID}",
    );
    assert.equal(
      urls.cancelUrl,
      "http://localhost:5173/dashboard/freelancer/plans?freelancer_sub_cancelled=1&session_id={CHECKOUT_SESSION_ID}",
    );
    assert.ok(!urls.successUrl.includes("5174"));
    assert.ok(!urls.cancelUrl.includes("5174"));
    assert.ok(urls.successUrl.includes("{CHECKOUT_SESSION_ID}"));
    assert.ok(urls.cancelUrl.includes("{CHECKOUT_SESSION_ID}"));
  });

  it("production CLIENT_URL produces https://orderzhouse.com redirects", () => {
    process.env.CLIENT_URL = "https://orderzhouse.com";
    const urls = buildFreelancerPlansCheckoutReturnUrls(getPrimaryClientUrl());
    assert.equal(
      urls.successUrl,
      "https://orderzhouse.com/dashboard/freelancer/plans?freelancer_sub_paid=1&session_id={CHECKOUT_SESSION_ID}",
    );
    assert.equal(
      urls.cancelUrl,
      "https://orderzhouse.com/dashboard/freelancer/plans?freelancer_sub_cancelled=1&session_id={CHECKOUT_SESSION_ID}",
    );
    assert.ok(!urls.successUrl.includes("localhost"));
    assert.ok(!urls.cancelUrl.includes("localhost"));
  });

  it("activation-fee checkout URLs share the same CLIENT_URL origin", () => {
    process.env.CLIENT_URL = "http://localhost:5173";
    const urls = buildFreelancerActivationFeeCheckoutReturnUrls(getPrimaryClientUrl());
    assert.ok(urls.successUrl.startsWith("http://localhost:5173/"));
    assert.ok(urls.cancelUrl.startsWith("http://localhost:5173/"));
    assert.ok(urls.successUrl.includes("freelancer_activation_fee_paid=1"));
    assert.ok(urls.cancelUrl.includes("freelancer_activation_fee_cancelled=1"));
    assert.ok(!urls.successUrl.includes("5174"));
  });

  it("getPrimaryClientUrl uses first origin only (CORS multi-value)", () => {
    process.env.CLIENT_URL = "http://localhost:5173,http://localhost:5174";
    assert.equal(getPrimaryClientUrl(), "http://localhost:5173");
  });
});

describe("production CLIENT_URL rejects localhost", () => {
  it("validateEnv exits when NODE_ENV=production and CLIENT_URL is localhost", () => {
    const probe = `
require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/env_probe";
process.env.JWT_SECRET = "x".repeat(16);
process.env.STRIPE_SECRET_KEY = "sk_test_probe";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_probe";
process.env.CLIENT_URL = "http://localhost:5173";
require("./src/config/env").validateEnv();
process.stdout.write("UNEXPECTED_OK");
`;
    const root = path.join(__dirname, "..");
    const tmp = path.join(root, "scripts", "_tmp_env_localhost_probe.js");
    fs.writeFileSync(tmp, probe, "utf8");
    try {
      const result = spawnSync(process.execPath, [tmp], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          CLIENT_URL: "http://localhost:5173",
          DOTENV_CONFIG_QUIET: "true",
        },
      });
      assert.notEqual(result.status, 0);
      assert.match(String(result.stderr || "") + String(result.stdout || ""), /localhost/i);
      assert.ok(!String(result.stdout || "").includes("UNEXPECTED_OK"));
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe("recurring checkout source contracts", () => {
  it("keeps mode: subscription and shared return-url helper", () => {
    const recurring = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeRecurringSubscriptionService.js"),
      "utf8",
    );
    const checkout = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeCheckoutService.js"),
      "utf8",
    );
    assert.ok(recurring.includes('mode: "subscription"'));
    assert.ok(recurring.includes("buildFreelancerPlansCheckoutReturnUrls"));
    assert.ok(checkout.includes("buildFreelancerPlansCheckoutReturnUrls"));
    assert.ok(checkout.includes("buildFreelancerActivationFeeCheckoutReturnUrls"));
    assert.ok(recurring.includes("{CHECKOUT_SESSION_ID}") || recurring.includes("buildFreelancerPlansCheckoutReturnUrls"));
    assert.ok(!recurring.includes("localhost:5174"));
    assert.ok(!checkout.includes("localhost:5174"));
  });

  it("confirm path can fulfill recurring when webhook is delayed (architecture preserved)", () => {
    const checkout = fs.readFileSync(
      path.join(__dirname, "../src/services/stripeCheckoutService.js"),
      "utf8",
    );
    assert.ok(checkout.includes("freelancer_recurring_subscription"));
    assert.ok(checkout.includes("fulfillRecurringSubscriptionFromCheckout"));
    const webhook = fs.readFileSync(
      path.join(__dirname, "../src/controllers/stripeWebhookController.js"),
      "utf8",
    );
    assert.ok(webhook.includes("applyCheckoutSessionFreelancerRecurringCompleted"));
  });
});
