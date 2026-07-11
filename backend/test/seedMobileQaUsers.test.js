const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("seed-mobile-qa-users.js (QA-3A)", () => {
  const seedPath = path.join(__dirname, "..", "scripts", "seed-mobile-qa-users.js");
  const src = fs.readFileSync(seedPath, "utf8");

  it("assigns platinum plan for freelancer QA", () => {
    assert.match(src, /orderzhouse_platinum/);
    assert.doesNotMatch(src, /freelancer_starter/);
  });

  it("seeds pool bidding order with bid budget range", () => {
    assert.match(src, /QA_POOL_BID_MIN/);
    assert.match(src, /QA_POOL_BID_MAX/);
    assert.match(src, /bid_budget_min/);
    assert.match(src, /bid_budget_max/);
  });

  it("creates pool orders owned by QA client not admin", () => {
    assert.match(src, /clientUserId/);
    assert.match(src, /source_type = 'client_created'/);
    assert.doesNotMatch(src, /resolveAdminCreatorId/);
  });

  it("resets pool order state on re-seed for idempotent QA", () => {
    assert.match(src, /resetPoolOrderWorkState/);
    assert.match(src, /order_freelancer_bids/);
  });

  it("requires ALLOW_QA_SEED guard", () => {
    assert.match(src, /ALLOW_QA_SEED/);
    assert.match(src, /assertQaSeedAllowed/);
  });
});

describe("check-local-stripe-qa-env.js", () => {
  const scriptPath = path.join(__dirname, "..", "scripts", "check-local-stripe-qa-env.js");
  const src = fs.readFileSync(scriptPath, "utf8");

  it("warns on sk_live without modifying env", () => {
    assert.match(src, /sk_live_/);
    assert.match(src, /cs_live_/);
    assert.doesNotMatch(src, /process\.env\.STRIPE_SECRET_KEY\s*=/);
  });
});
