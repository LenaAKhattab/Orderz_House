/**
 * Admin internal priced-bid award: routes + service constraints (no DB).
 * Run: node --test test/adminInternalBidAward.test.js  |  npm test
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/admin_bid_award_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("path");

describe("admin orders routes — internal bid award + list", () => {
  it("registers GET bids and POST bids/:bidId/approve after auth middleware", () => {
    const p = path.join(__dirname, "..", "src", "routes", "adminOrdersRoutes.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes('"/orders/:id/bids"'), "GET list bids route");
    assert.ok(src.includes('"/orders/:id/bids/:bidId/approve"'), "POST approve bid route");
    assert.ok(src.includes("listInternalOrderBids"), "controller listInternalOrderBids");
    assert.ok(src.includes("approveInternalPricedBid"), "controller approveInternalPricedBid");
    assert.ok(src.includes("router.use(requireAuth, requireAnyRole"), "auth gate on router");
  });
});

describe("approveInternalPricedBidAdmin (ordersService source)", () => {
  it("locks order and bid with FOR UPDATE and restricts to internal not_required + open_for_bids", () => {
    const p = path.join(__dirname, "..", "src", "services", "ordersService.js");
    const src = fs.readFileSync(p, "utf8");
    const fn = src.split("async function approveInternalPricedBidAdmin")[1];
    assert.ok(fn, "function exists");
    assert.ok(
      /FOR UPDATE/.test(fn) && fn.indexOf("FOR UPDATE") !== fn.lastIndexOf("FOR UPDATE"),
      "order and bid rows locked",
    );
    assert.ok(
      /source_type IN \('admin_created', 'super_admin_created'\)/.test(fn) && /payment_status = 'not_required'/.test(fn),
      "SQL enforces internal + not_required",
    );
    assert.ok(
      /order_status = \$9/.test(fn) && /ORDER_STATUSES\.OPEN_FOR_BIDS/.test(fn),
      "state guard for open_for_bids",
    );
    assert.ok(
      /activateCurrentSubscriptionOnFirstAcceptedOrder/.test(fn),
      "subscription activation on first accept (same as claim approve)",
    );
  });

  it("re-exports list + approve for admin", () => {
    const p = path.join(__dirname, "..", "src", "services", "ordersService.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("listInternalOrderBidsForAdmin"));
    assert.ok(src.includes("approveInternalPricedBidAdmin"));
  });
});

describe("client bidding payment path unchanged", () => {
  it("clientOrdersController acceptFreelancerBid still uses Stripe checkout service only", () => {
    const p = path.join(__dirname, "..", "src", "controllers", "clientOrdersController.js");
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.includes("createClientSelectedBidCheckoutSession"));
    assert.ok(!src.includes("approveInternalPricedBidAdmin"));
  });
});
