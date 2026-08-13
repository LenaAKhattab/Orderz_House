/**
 * Phase D1 — Super Admin Bid Distribution Pool (static + calculation).
 * Does NOT apply migration 152. No Production mutation / git / deploy / engine enable.
 *
 * Run: npm run test:marketplace-bid-distribution-pool-phase-d1
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_bid_distribution_pool_d1_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ADMIN_BID_POOL_GRANT_SOURCE,
  ADMIN_DISTRIBUTION_POOL_GRANT_EVENT,
  BID_POOL_TOTAL_SOURCE,
  POOL_EXPIRED_UNUSED_BIDS_RETURN,
  POOL_CONSUMED_BIDS_RETURN,
  BID_POOL_WORK_TOKEN_RUNTIME,
  BID_POOL_DISTRIBUTION_MODES,
  BID_POOL_EXPIRATION_MODES,
} = require("../src/constants/marketplaceBidDistributionPools");

const {
  BID_CREDIT_SOURCE_TYPES,
  BID_CREDIT_LEDGER_EVENT_TYPES,
} = require("../src/constants/marketplaceBidCredits");

const {
  calculatePoolBidsFromBudget,
  calculateUnusedBidsToReturn,
  parseJodToMillis,
} = require("../src/utils/marketplaceBidPoolMoney");

const { resolvePoolAllocationExpiresAt } = require("../src/utils/marketplaceBidPoolExpiration");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase D1 product constants", () => {
  it("locks Admin Bid Pool product model", () => {
    assert.strictEqual(ADMIN_BID_POOL_GRANT_SOURCE, "admin_distribution_pool");
    assert.strictEqual(ADMIN_DISTRIBUTION_POOL_GRANT_EVENT, "ADMIN_DISTRIBUTION_POOL_GRANT");
    assert.strictEqual(BID_POOL_TOTAL_SOURCE, "SERVER_CALCULATION");
    assert.strictEqual(POOL_EXPIRED_UNUSED_BIDS_RETURN, "100_PERCENT");
    assert.strictEqual(POOL_CONSUMED_BIDS_RETURN, "NONE");
    assert.strictEqual(BID_POOL_WORK_TOKEN_RUNTIME, "NONE");
    assert.ok(BID_CREDIT_SOURCE_TYPES.includes("admin_distribution_pool"));
    assert.ok(BID_CREDIT_LEDGER_EVENT_TYPES.includes("ADMIN_DISTRIBUTION_POOL_GRANT"));
    assert.deepEqual([...BID_POOL_DISTRIBUTION_MODES], ["manual", "random"]);
    assert.deepEqual([...BID_POOL_EXPIRATION_MODES], ["days", "weeks", "exact_datetime"]);
  });
});

describe("Phase D1 money → Bid calculation (decimal-safe)", () => {
  it("1000 / 0.1 = 10000", () => {
    const calc = calculatePoolBidsFromBudget({ budgetJod: "1000", bidUnitPriceJod: "0.1" });
    assert.strictEqual(calc.totalBids, 10000);
    assert.strictEqual(calc.monetaryRemainderJod, "0.000");
  });

  it("1000 / 0.10 = 10000 (normalized)", () => {
    const calc = calculatePoolBidsFromBudget({ budgetJod: 1000, bidUnitPriceJod: 0.1 });
    assert.strictEqual(calc.totalBids, 10000);
  });

  it("floors fractional Bids and persists monetary remainder", () => {
    const calc = calculatePoolBidsFromBudget({ budgetJod: "100", bidUnitPriceJod: "0.30" });
    assert.strictEqual(calc.totalBids, 333);
    assert.strictEqual(calc.monetaryRemainderJod, "0.100");
    assert.strictEqual(calc.usedMillis, 333 * 300);
  });

  it("rejects floating-point drift paths via milli-JOD integers", () => {
    const budget = parseJodToMillis("0.1", { label: "budgetJod", minExclusive: true });
    const unit = parseJodToMillis("0.03", { label: "bidUnitPriceJod", minExclusive: true });
    assert.strictEqual(budget, 100);
    assert.strictEqual(unit, 30);
    assert.strictEqual(Math.floor(budget / unit), 3);
  });

  it("never creates fractional Bids", () => {
    const calc = calculatePoolBidsFromBudget({ budgetJod: "1", bidUnitPriceJod: "0.3" });
    assert.ok(Number.isInteger(calc.totalBids));
    assert.strictEqual(calc.totalBids, 3);
  });

  it("rejects zero/invalid unit price", () => {
    assert.throws(() => calculatePoolBidsFromBudget({ budgetJod: "10", bidUnitPriceJod: "0" }));
    assert.throws(() => calculatePoolBidsFromBudget({ budgetJod: "10", bidUnitPriceJod: "0.0001" }));
  });
});

describe("Phase D1 unused return math", () => {
  it("used Bid does not return; unused returns", () => {
    assert.strictEqual(
      calculateUnusedBidsToReturn({ allocatedBids: 50, amountConsumed: 20, returnedBids: 0 }),
      30,
    );
  });

  it("revoked Bids never return", () => {
    assert.strictEqual(
      calculateUnusedBidsToReturn({
        allocatedBids: 50,
        amountConsumed: 20,
        amountRevoked: 5,
        returnedBids: 0,
      }),
      25,
    );
  });

  it("fully unused grant returns all", () => {
    assert.strictEqual(
      calculateUnusedBidsToReturn({ allocatedBids: 50, amountConsumed: 0, returnedBids: 0 }),
      50,
    );
  });

  it("fully consumed grant returns zero", () => {
    assert.strictEqual(
      calculateUnusedBidsToReturn({ allocatedBids: 50, amountConsumed: 50, returnedBids: 0 }),
      0,
    );
  });

  it("return only once (idempotent remainder)", () => {
    assert.strictEqual(
      calculateUnusedBidsToReturn({ allocatedBids: 50, amountConsumed: 20, returnedBids: 30 }),
      0,
    );
  });

  it("pool total never increases on return (conceptual)", () => {
    const total = 10000;
    let available = 5000;
    const currentlyAllocatedUnused = 5000;
    const permanentlyConsumed = 0;
    assert.strictEqual(available + currentlyAllocatedUnused + permanentlyConsumed, total);
    const unusedReturn = 30;
    available += unusedReturn;
    const afterAllocated = currentlyAllocatedUnused - unusedReturn;
    assert.strictEqual(available + afterAllocated + permanentlyConsumed, total);
    assert.strictEqual(available <= total, true);
  });
});

describe("Phase D1 expiration normalization", () => {
  const now = new Date("2026-08-13T12:00:00.000Z");

  it("days → expires_at", () => {
    const out = resolvePoolAllocationExpiresAt({
      expirationMode: "days",
      expirationValue: 7,
      now,
    });
    assert.strictEqual(out.expiresAt.toISOString(), "2026-08-20T12:00:00.000Z");
  });

  it("weeks → expires_at", () => {
    const out = resolvePoolAllocationExpiresAt({
      expirationMode: "weeks",
      expirationValue: 2,
      now,
    });
    assert.strictEqual(out.expiresAt.toISOString(), "2026-08-27T12:00:00.000Z");
  });

  it("exact_datetime → expires_at", () => {
    const out = resolvePoolAllocationExpiresAt({
      expirationMode: "exact_datetime",
      expiresAt: "2026-09-30T00:00:00.000Z",
      now,
    });
    assert.strictEqual(out.expiresAt.toISOString(), "2026-09-30T00:00:00.000Z");
    assert.strictEqual(out.expirationValue, null);
  });
});

describe("Phase D1 migration 152 authored (not applied by tests)", () => {
  const sql = read("sql/migrations/152_admin_bid_distribution_pools.sql");

  it("creates pool/batch/allocation/events + vocabulary", () => {
    assert.match(sql, /marketplace_bid_distribution_pools/);
    assert.match(sql, /marketplace_bid_distribution_batches/);
    assert.match(sql, /marketplace_bid_distribution_allocations/);
    assert.match(sql, /marketplace_bid_distribution_pool_events/);
    assert.match(sql, /admin_distribution_pool/);
    assert.match(sql, /ADMIN_DISTRIBUTION_POOL_GRANT/);
    assert.match(sql, /152_admin_bid_distribution_pools/);
    assert.match(sql, /available_bids <= total_bids/);
    assert.match(sql, /UNIQUE \(batch_id, freelancer_user_id\)/);
    assert.match(sql, /'manual'/);
    assert.match(sql, /'random'/);
    assert.match(sql, /POOL_CREATED/);
    assert.match(sql, /RETURNED_UNUSED/);
  });

  it("does not enable engines, seed pools, or touch Work Tokens", () => {
    assert.doesNotMatch(sql, /SET\s+bid_credits_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_distribution_pools/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_bid_credit_grants/i);
    assert.doesNotMatch(sql, /INSERT INTO freelancer_work_token/i);
    assert.doesNotMatch(sql, /DROP TABLE.*work_token/i);
  });
});

describe("Phase D1 service / ACL / expiry wiring", () => {
  const svc = read("src/services/marketplaceBidDistributionPoolService.js");
  const accounting = read("src/services/marketplaceBidCreditAccountingService.js");
  const dist = read("src/services/marketplaceBidCreditDistributionService.js");
  const routes = read("src/routes/superAdminBidDistributionPoolsRoutes.js");
  const app = read("src/app.js");
  const rbac = read("src/middleware/rbacMiddleware.js");

  it("allocation uses admin_distribution_pool + ADMIN_DISTRIBUTION_POOL_GRANT", () => {
    assert.match(svc, /ADMIN_BID_POOL_GRANT_SOURCE/);
    assert.match(svc, /ADMIN_DISTRIBUTION_POOL_GRANT_EVENT/);
    assert.match(svc, /createBidCreditGrant/);
    assert.match(svc, /FOR UPDATE/);
    assert.match(svc, /available_bids >= \$2/);
    assert.doesNotMatch(svc, /ADMIN_BID_GRANT/);
    assert.doesNotMatch(svc, /work_token/i);
  });

  it("manual + random modes and freelancer eligibility", () => {
    assert.match(svc, /distributionMode/);
    assert.match(svc, /selectRandomEligibleFreelancers/);
    assert.match(svc, /role = 'freelancer'/);
    assert.match(svc, /is_active = TRUE/);
    assert.match(svc, /DUPLICATE_RECIPIENT/);
  });

  it("unused return is idempotent and never increases total_bids", () => {
    assert.match(svc, /pool_return_unused:allocation:/);
    assert.match(svc, /ALREADY_RETURNED/);
    assert.match(svc, /GRANT_STILL_SPENDABLE/);
    assert.match(svc, /would exceed total_bids/);
    assert.match(svc, /reconcileExpiredPoolAllocationReturns/);
    assert.match(svc, /notifySuperAdmins/);
    assert.match(svc, /Commit economic returns BEFORE Admin notifications/);
  });

  it("generic expiry tick integrates pool return (no double path in expire itself)", () => {
    assert.match(dist, /reconcileExpiredPoolAllocationReturns/);
    assert.match(accounting, /admin_distribution_pool unused inventory returns via/);
    assert.doesNotMatch(accounting, /returnUnusedPoolBidsForExpiredGrant/);
  });

  it("Super Admin ACL on /api/super-admin", () => {
    assert.match(routes, /requireSuperAdmin/);
    assert.match(routes, /requireAuth/);
    assert.match(app, /superAdminBidDistributionPoolsRoutes/);
    assert.match(app, /\/api\/super-admin.*superAdminBidDistributionPoolsRoutes/);
    assert.match(rbac, /function requireSuperAdmin/);
  });

  it("freelancer notify on allocate; Admin aggregate on return", () => {
    assert.match(svc, /You received .* Bids valid until/);
    assert.match(svc, /unused Bids from .* Freelancer allocations were returned/);
  });
});

describe("Phase D1 no Production enablement markers", () => {
  it("constants declare dormant WT runtime and server total source", () => {
    assert.strictEqual(BID_POOL_TOTAL_SOURCE, "SERVER_CALCULATION");
    assert.strictEqual(BID_POOL_WORK_TOKEN_RUNTIME, "NONE");
    assert.strictEqual(POOL_CONSUMED_BIDS_RETURN, "NONE");
  });
});
