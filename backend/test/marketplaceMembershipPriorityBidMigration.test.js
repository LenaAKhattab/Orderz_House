/**
 * Migration 136 — per-plan Priority Bid capability (additive; prices untouched).
 * Seed is guarded by schema_migrations + untouched FALSE/0 defaults.
 * Run: node --test test/marketplaceMembershipPriorityBidMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("path");
const { scanSqlForDangerousStatements } = require("../scripts/lib/assertScriptDatabaseAllowed");
const { splitSqlStatements, stripSqlLineComments } = require("../scripts/lib/splitSqlStatements");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/136_marketplace_membership_priority_bid.sql",
);
const migration134Path = path.join(
  __dirname,
  "../sql/migrations/134_marketplace_membership_plans.sql",
);
const migration135Path = path.join(
  __dirname,
  "../sql/migrations/135_marketplace_economy_settings.sql",
);

const MIGRATION_VERSION = "136_marketplace_membership_priority_bid";

const SEED_BY_TIER = Object.freeze({
  pay_as_you_work: 1,
  active: 2,
  pro: 3,
  elite: 4,
});

/**
 * Mirrors migration 136 seed guard semantics.
 * @param {{
 *   migrationAlreadyApplied: boolean,
 *   tier_code: string,
 *   priority_bid_enabled: boolean,
 *   priority_bid_uses_per_cycle: number,
 * }} input
 */
function applyPriorityBidSeedOnce(input) {
  const targetUses = SEED_BY_TIER[input.tier_code];
  if (targetUses == null) {
    return { ...input, changed: false };
  }
  // Durable guard: schema_migrations already has 136 → never reseed
  if (input.migrationAlreadyApplied) {
    return {
      tier_code: input.tier_code,
      priority_bid_enabled: input.priority_bid_enabled,
      priority_bid_uses_per_cycle: input.priority_bid_uses_per_cycle,
      changed: false,
    };
  }
  // Extra safety: only untouched ADD COLUMN defaults
  const untouchedDefault =
    input.priority_bid_enabled === false && input.priority_bid_uses_per_cycle === 0;
  if (!untouchedDefault) {
    return {
      tier_code: input.tier_code,
      priority_bid_enabled: input.priority_bid_enabled,
      priority_bid_uses_per_cycle: input.priority_bid_uses_per_cycle,
      changed: false,
    };
  }
  return {
    tier_code: input.tier_code,
    priority_bid_enabled: true,
    priority_bid_uses_per_cycle: targetUses,
    changed: true,
  };
}

describe("136_marketplace_membership_priority_bid migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");
  const sql134 = fs.readFileSync(migration134Path, "utf8");

  it("adds priority_bid_enabled and priority_bid_uses_per_cycle", () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS priority_bid_enabled/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS priority_bid_uses_per_cycle/);
  });

  it("guards seed with schema_migrations before INSERT of 136", () => {
    assert.match(
      sql,
      /IF NOT EXISTS \(\s*SELECT 1\s*FROM schema_migrations\s*WHERE version = '136_marketplace_membership_priority_bid'\s*\)/s,
    );
    const seedIdx = sql.indexOf("priority_bid_uses_per_cycle = 1");
    const insertIdx = sql.lastIndexOf(
      "INSERT INTO schema_migrations (version) VALUES ('136_marketplace_membership_priority_bid')",
    );
    assert.ok(seedIdx > 0 && insertIdx > seedIdx, "seed must run before schema_migrations INSERT");
  });

  it("seeds uses 1/2/3/4 by tier_code with FALSE/0 extra safety and no price writes", () => {
    assert.match(sql, /tier_code = 'pay_as_you_work'[\s\S]*priority_bid_enabled = FALSE[\s\S]*priority_bid_uses_per_cycle = 0/);
    assert.match(sql, /priority_bid_uses_per_cycle = 1/);
    assert.match(sql, /priority_bid_uses_per_cycle = 2/);
    assert.match(sql, /priority_bid_uses_per_cycle = 3/);
    assert.match(sql, /priority_bid_uses_per_cycle = 4/);
    assert.doesNotMatch(sql, /IS DISTINCT FROM/);
    assert.doesNotMatch(sql, /monthly_price_jod\s*=/);
    assert.doesNotMatch(sql, /24\.99|39\.99|69\.99|99\.99/);
  });

  it("does not rewrite migration 134", () => {
    assert.doesNotMatch(sql134, /priority_bid_uses_per_cycle/);
    assert.match(sql, new RegExp(MIGRATION_VERSION));
  });

  it("is additive and non-destructive", () => {
    assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM marketplace_membership_plans/i);
    assert.doesNotMatch(sql, /work_token_wallet|priority_bid_auctions/i);
    assert.doesNotMatch(sql, /\bDROP\b/i);
    assert.doesNotMatch(sql, /\bDELETE\b/i);
  });

  it("parser/safety scan is clean", () => {
    const scan = scanSqlForDangerousStatements(sql);
    assert.strictEqual(scan.dangerous, false);
    assert.deepStrictEqual(scan.findings, []);
    const statements = splitSqlStatements(stripSqlLineComments(sql));
    // BEGIN, 2 ALTER, constraint DO, 2 COMMENT, seed DO, INSERT schema_migrations, COMMIT
    assert.strictEqual(statements.length, 9);
    assert.match(sql, /\bBEGIN\b/);
    assert.match(sql, /\bCOMMIT\b/);
  });
});

describe("136 seed idempotency semantics", () => {
  it("CASE A — first run: fresh defaults receive initial capability seed", () => {
    for (const [tier, uses] of Object.entries(SEED_BY_TIER)) {
      const after = applyPriorityBidSeedOnce({
        migrationAlreadyApplied: false,
        tier_code: tier,
        priority_bid_enabled: false,
        priority_bid_uses_per_cycle: 0,
      });
      assert.strictEqual(after.changed, true);
      assert.strictEqual(after.priority_bid_enabled, true);
      assert.strictEqual(after.priority_bid_uses_per_cycle, uses);
    }
  });

  it("CASE B — Admin-changed Elite uses=8 survives rerun", () => {
    const after = applyPriorityBidSeedOnce({
      migrationAlreadyApplied: true,
      tier_code: "elite",
      priority_bid_enabled: true,
      priority_bid_uses_per_cycle: 8,
    });
    assert.strictEqual(after.changed, false);
    assert.strictEqual(after.priority_bid_uses_per_cycle, 8);
  });

  it("CASE C — Admin-disabled Pro (enabled=false, uses=3) survives rerun", () => {
    const after = applyPriorityBidSeedOnce({
      migrationAlreadyApplied: true,
      tier_code: "pro",
      priority_bid_enabled: false,
      priority_bid_uses_per_cycle: 3,
    });
    assert.strictEqual(after.changed, false);
    assert.strictEqual(after.priority_bid_enabled, false);
    assert.strictEqual(after.priority_bid_uses_per_cycle, 3);
  });

  it("CASE D — Admin-set Active enabled=true uses=0 is not reset to 2", () => {
    const after = applyPriorityBidSeedOnce({
      migrationAlreadyApplied: true,
      tier_code: "active",
      priority_bid_enabled: true,
      priority_bid_uses_per_cycle: 0,
    });
    assert.strictEqual(after.changed, false);
    assert.strictEqual(after.priority_bid_uses_per_cycle, 0);
  });

  it("CASE E — only untouched FALSE/0 is eligible when migration not yet applied", () => {
    assert.strictEqual(
      applyPriorityBidSeedOnce({
        migrationAlreadyApplied: false,
        tier_code: "pay_as_you_work",
        priority_bid_enabled: false,
        priority_bid_uses_per_cycle: 0,
      }).changed,
      true,
    );
    assert.strictEqual(
      applyPriorityBidSeedOnce({
        migrationAlreadyApplied: false,
        tier_code: "pay_as_you_work",
        priority_bid_enabled: true,
        priority_bid_uses_per_cycle: 1,
      }).changed,
      false,
    );
  });

  it("CASE F — Admin intentional false/0 after rollout must NOT reseed on rerun", () => {
    const after = applyPriorityBidSeedOnce({
      migrationAlreadyApplied: true,
      tier_code: "pay_as_you_work",
      priority_bid_enabled: false,
      priority_bid_uses_per_cycle: 0,
    });
    assert.strictEqual(after.changed, false);
    assert.strictEqual(after.priority_bid_enabled, false);
    assert.strictEqual(after.priority_bid_uses_per_cycle, 0);
  });
});

describe("136 fix isolation", () => {
  it("does not modify migration 135 content via this test file's subject", () => {
    const sql135 = fs.readFileSync(migration135Path, "utf8");
    assert.match(sql135, /135_marketplace_economy_settings/);
    assert.doesNotMatch(sql135, /priority_bid_uses_per_cycle/);
  });
});
