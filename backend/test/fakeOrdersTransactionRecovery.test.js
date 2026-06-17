const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { trainingPoolVisibleWhereSql } = require("../src/services/trainingPoolEligibility");

const fakeOrdersSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
  "utf8",
);

describe("fakeOrders transaction recovery", () => {
  it("uses SAVEPOINT around training round generation", () => {
    assert.match(fakeOrdersSrc, /withSavepoint\(client, "training_round_generation"/);
    assert.match(fakeOrdersSrc, /withSavepoint\(client, "manual_round_gen"/);
  });

  it("uses transaction-scoped advisory lock with stale session cleanup", () => {
    assert.match(fakeOrdersSrc, /pg_try_advisory_xact_lock/);
    assert.match(fakeOrdersSrc, /clearStaleSessionGenerationLock/);
    assert.match(fakeOrdersSrc, /releaseGenerationLock/);
    assert.match(fakeOrdersSrc, /isPgTransactionAbortedError/);
  });

  it("clears session advisory lock when pool client is released", () => {
    const dbSrc = fs.readFileSync(path.join(__dirname, "..", "src", "config", "db.js"), "utf8");
    assert.match(dbSrc, /pool\.on\("release"/);
    assert.match(dbSrc, /pg_advisory_unlock/);
    assert.match(dbSrc, /GENERATION_ADVISORY_LOCK_KEY/);
  });

  it("ensureMinimumVisibleFakeOrders retries on LOCK_BUSY for pool recovery", () => {
    assert.match(fakeOrdersSrc, /LOCK_BUSY_RETRY_REASONS/);
    assert.match(fakeOrdersSrc, /ensure_min_visible_retry/);
    assert.match(fakeOrdersSrc, /pool_list_empty/);
  });

  it("manual round start retries on LOCK_BUSY", () => {
    assert.match(fakeOrdersSrc, /manual_start_retry/);
    assert.match(fakeOrdersSrc, /"manual_start"/);
  });

  it("ensureMinimumVisibleFakeOrdersOnce returns GENERATION_FAILED instead of throwing", () => {
    assert.match(fakeOrdersSrc, /code: "GENERATION_FAILED"/);
    assert.match(fakeOrdersSrc, /ensure_min_visible_failed/);
  });

  it("strict visible_until boundary unchanged", () => {
    const sql = trainingPoolVisibleWhereSql();
    assert.match(sql, /visible_until > NOW\(\)/);
    assert.doesNotMatch(sql, /visible_until >= NOW\(\)/);
  });
});
