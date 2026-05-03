/**
 * Internal + pool bidding: priced bidding accepts bids; unpriced "bidding" is invalid at create;
 * claim vs bid semantics use hasPricedBiddingRow + order status.
 * Run: npm run test:internal-bidding-pool  |  npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/internal_bidding_pool_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { hasPricedBiddingRow } = require("../src/services/ordersService");

describe("hasPricedBiddingRow", () => {
  const row = (overrides = {}) => ({
    project_type: "bidding",
    bid_budget_min: 10,
    bid_budget_max: 100,
    ...overrides,
  });

  it("returns true for valid bidding range", () => {
    assert.strictEqual(hasPricedBiddingRow(row()), true);
  });

  it("returns false when min/max missing or invalid", () => {
    assert.strictEqual(hasPricedBiddingRow(row({ bid_budget_min: null, bid_budget_max: null })), false);
    assert.strictEqual(hasPricedBiddingRow(row({ bid_budget_min: 10, bid_budget_max: 5 })), false);
    assert.strictEqual(hasPricedBiddingRow(row({ project_type: "fixed" })), false);
  });
});

describe("internal order create — bidding requires min/max (Option A)", () => {
  it("validators require bidBudgetMin/Max when projectType is bidding", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "validators", "ordersValidators.js"), "utf8");
    assert.ok(src.includes("Bid budget min is required for bidding projects."));
    assert.ok(src.includes("Bid budget max is required for bidding projects."));
  });

  it("createInternalOrder sets OPEN_FOR_BIDS for pool bidding after priced insert", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ordersService.js"), "utf8");
    assert.ok(
      /else if \(isBidding\) \{[\s\S]*?orderStatus = ORDER_STATUSES\.OPEN_FOR_BIDS/.test(src),
      "internal unassigned pool bidding should get open_for_bids",
    );
    assert.ok(
      src.includes("Bidding projects require valid bidBudgetMin and bidBudgetMax"),
      "service rejects invalid bidding range",
    );
  });
});

describe("mapOrderBase exposes acceptsPriceBids", () => {
  it("matches hasPricedBiddingRow for priced bidding rows", () => {
    const ordersServicePath = path.join(__dirname, "..", "src", "services", "ordersService.js");
    const src = fs.readFileSync(ordersServicePath, "utf8");
    assert.ok(src.includes("acceptsPriceBids: hasPricedBiddingRow(row)"));
  });
});

describe("pool listing: bidding filter = priced bidding only", () => {
  it("listPoolOrders uses priced bidding predicate when projectType is bidding", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ordersService.js"), "utf8");
    assert.ok(
      /if \(pt === "bidding"\)[\s\S]*?bid_budget_min > 0[\s\S]*?bid_budget_max >= o\.bid_budget_min/.test(src),
    );
  });

  it("trainingPoolList merged pool applies same bidding filter", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "trainingPoolList.js"), "utf8");
    assert.ok(src.includes(`pt === "bidding"`));
    assert.ok(src.includes("fo.bid_budget_max >= fo.bid_budget_min"));
  });
});

describe("claim vs bid — priced bidding rejects claim", () => {
  it("claimPoolOrder rejects hasPricedBiddingRow (read source)", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "src", "services", "ordersService.js"), "utf8");
    assert.ok(
      /if \(hasPricedBiddingRow\(order\)\) \{[\s\S]*?bidding order\. Submit a price offer/.test(src),
    );
  });
});
