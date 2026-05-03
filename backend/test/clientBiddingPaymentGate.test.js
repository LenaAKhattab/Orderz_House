/**
 * Client priced bidding: winner assignment after Stripe payment only (checkout + webhook).
 * `acceptFreelancerBidClient` was removed from ordersService — it bypassed payment.
 *
 * Run: npm run test:client-bidding  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/client_bidding_gate_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

describe("client bidding — no ordersService payment bypass", () => {
  it("ordersService does not export acceptFreelancerBidClient", () => {
    const ordersService = require("../src/services/ordersService");
    assert.strictEqual(
      ordersService.acceptFreelancerBidClient,
      undefined,
      "Removing this export prevents assigning a bidding winner without Stripe-paid flow",
    );
  });

  it("ordersService source must not define acceptFreelancerBidClient", () => {
    const srcPath = path.join(__dirname, "..", "src", "services", "ordersService.js");
    const src = fs.readFileSync(srcPath, "utf8");
    assert.ok(
      !src.includes("acceptFreelancerBidClient"),
      "ordersService.js must not contain acceptFreelancerBidClient (dead payment bypass)",
    );
  });

  it("client accept-bid route uses Stripe checkout, not ordersService direct assign", () => {
    const ctrlPath = path.join(__dirname, "..", "src", "controllers", "clientOrdersController.js");
    const src = fs.readFileSync(ctrlPath, "utf8");
    assert.ok(
      src.includes("createClientSelectedBidCheckoutSession"),
      "acceptFreelancerBid should start Stripe checkout session",
    );
    assert.ok(
      !src.includes("acceptFreelancerBidClient"),
      "controller must not call removed ordersService.acceptFreelancerBidClient",
    );
  });
});
