/**
 * DB safety guard for FAZAT staging scripts + live schema-only gate.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const {
  inspectDatabaseUrl,
  assertSafeFazatDbOrThrow,
  assertSafeForSchemaMigrationOrThrow,
} = require("../src/utils/fazatDbSafety");

const KEYS = [
  "FAZAT_ALLOW_REMOTE_STAGING_DB",
  "FAZAT_SEED_CONFIRM",
  "FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT",
  "FAZAT_LIVE_SCHEMA_CONFIRM",
];

function clearKeys() {
  for (const k of KEYS) delete process.env[k];
}

describe("fazatDbSafety", () => {
  beforeEach(clearKeys);
  afterEach(clearKeys);

  it("allows localhost for seed and migrate", () => {
    const info = inspectDatabaseUrl("postgresql://user:pass@127.0.0.1:5432/orderz_local");
    assert.strictEqual(info.looksLocal, true);
    assert.strictEqual(info.safeForMigrationOrSeed, true);
  });

  it("blocks neon by default", () => {
    const info = inspectDatabaseUrl(
      "postgresql://user:pass@ep-example-pooler.c-3.us-east-1.aws.neon.tech/neondb",
    );
    assert.strictEqual(info.looksNeon, true);
    assert.strictEqual(info.safeForMigrationOrSeed, false);
    assert.strictEqual(info.allowsLiveSchemaRollout, false);
  });

  it("live schema override allows schema migrate gate but not seed", () => {
    process.env.FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT = "true";
    process.env.FAZAT_LIVE_SCHEMA_CONFIRM = "LIVE_SCHEMA_ONLY";
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-example-pooler.c-3.us-east-1.aws.neon.tech/neondb";

    const gate = assertSafeForSchemaMigrationOrThrow("test-migrate");
    assert.strictEqual(gate.mode, "live_schema_only");

    assert.throws(() => assertSafeFazatDbOrThrow("test-seed"), (err) => {
      return err && err.code === "FAZAT_LIVE_SCHEMA_ONLY";
    });
  });

  it("live schema flag without confirm does not unlock migrate", () => {
    process.env.FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT = "true";
    // missing FAZAT_LIVE_SCHEMA_CONFIRM
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-example-pooler.c-3.us-east-1.aws.neon.tech/neondb";
    assert.throws(() => assertSafeForSchemaMigrationOrThrow("test-migrate"), (err) => {
      return err && err.code === "FAZAT_UNSAFE_DB";
    });
  });
});
