/**
 * Tests for controlled institutional QA cleanup script + helper guards.
 */
const path = require("node:path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const {
  parseArgs,
  matchesQaName,
  classifyCandidate,
  CONFIRM_TOKEN,
} = require("../scripts/cleanupInstitutionalQaData");
const {
  assertCleanupEnvironmentSafe,
  cleanupInstitutionalTestRecords,
} = require("./helpers/institutionalTestCleanup");
const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

describe("cleanupInstitutionalQaData script safety", () => {
  it("dry-run is default and apply requires confirm token", () => {
    const dry = parseArgs([]);
    assert.equal(dry.apply, false);
    const applyMissing = parseArgs(["--apply"]);
    assert.equal(applyMissing.apply, true);
    assert.notEqual(applyMissing.confirm, CONFIRM_TOKEN);
    const applyOk = parseArgs([`--confirm=${CONFIRM_TOKEN}`, "--apply"]);
    assert.equal(applyOk.apply, true);
    assert.equal(applyOk.confirm, CONFIRM_TOKEN);
  });

  it("matches only approved QA prefixes", () => {
    assert.equal(matchesQaName("QA-INST-123", ["QA-INST-"]), true);
    assert.equal(matchesQaName("Inst Rel 1", ["Inst Rel "]), true);
    assert.equal(matchesQaName("Jordan University", ["QA-INST-"]), false);
  });

  it("skips ambiguous shared or marketplace-linked institutions", () => {
    const base = { name: "QA-INST-x" };
    assert.equal(
      classifyCandidate(base, { sharedWithNonQa: true, nonQaActiveStorages: 0, bids: 0, claims: 0 }, ["QA-INST-"])
        .classification,
      "ambiguous",
    );
    assert.equal(
      classifyCandidate(base, { sharedWithNonQa: false, nonQaActiveStorages: 0, bids: 2, claims: 0 }, ["QA-INST-"])
        .classification,
      "ambiguous",
    );
    assert.equal(
      classifyCandidate(base, { sharedWithNonQa: false, nonQaActiveStorages: 0, bids: 0, claims: 0 }, ["QA-INST-"])
        .classification,
      "safe_test_residue",
    );
    assert.equal(
      classifyCandidate({ name: "Real Org" }, { sharedWithNonQa: false, nonQaActiveStorages: 0, bids: 0, claims: 0 }, [
        "QA-INST-",
      ]).classification,
      "must_preserve",
    );
  });

  it("production-like environment blocks destructive cleanup", () => {
    assert.throws(() => assertCleanupEnvironmentSafe({ NODE_ENV: "production", DATABASE_URL: "postgres://x" }), /production/);
    assert.throws(
      () =>
        assertCleanupEnvironmentSafe({
          NODE_ENV: "development",
          DATABASE_URL: "postgres://user:pass@prod-db.example.com/app",
        }),
      /DATABASE_URL looks like production/,
    );
    assert.doesNotThrow(() =>
      assertCleanupEnvironmentSafe({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost/orderz_dev",
      }),
    );
  });
});

const rootDescribe = isIntegrationEnvConfigured() ? describe : describe.skip;

rootDescribe("institutionalTestCleanup integration", () => {
  it("removes test graph and leaves unrelated institution intact", { timeout: 60_000 }, async () => {
    const { pool } = require("../src/config/db");
    const institutionsService = require("../src/services/institutionsService");
    const storageService = require("../src/services/institutionalStorageService");

    const stamp = Date.now();
    const actorEmail = `cleanup_actor_${stamp}@example.com`;
    const { rows: actorRows } = await pool.query(
      `INSERT INTO users (
         account_id, email, password_hash, role, first_name, father_name, family_name,
         phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
       ) VALUES ($1, $2, 'x', 'super_admin', 'C', 'L', 'Actor', $3, $3, 'ذكر', 'JO', TRUE, TRUE, TRUE)
       RETURNING id`,
      [`CL${String(stamp).slice(-8)}`, actorEmail, `+96279${String(stamp).slice(-7)}`],
    );
    const actorId = Number(actorRows[0].id);

    const keep = await institutionsService.createInstitution({
      actorUserId: actorId,
      name: `KEEP-REAL-INST-${stamp}`,
    });
    const kill = await institutionsService.createInstitution({
      actorUserId: actorId,
      name: `QA-INST-CLEANUP-${stamp}`,
    });
    const storage = await storageService.createStorage({
      actorUserId: actorId,
      payload: {
        name: `QA-STOR-CLEANUP-${stamp}`,
        financialLimitJod: 25,
        distributionMonths: 1,
        distributionStartDate: new Date().toISOString().slice(0, 10),
        institutionIds: [Number(kill.id)],
      },
    });

    await cleanupInstitutionalTestRecords(pool, {
      storageId: Number(storage.id),
      institutionId: Number(kill.id),
      userIds: [],
      logPrefix: "[cleanupRegression]",
    });

    const { rows: gone } = await pool.query(`SELECT id FROM institutions WHERE id = $1`, [Number(kill.id)]);
    const { rows: kept } = await pool.query(`SELECT id FROM institutions WHERE id = $1`, [Number(keep.id)]);
    assert.equal(gone.length, 0);
    assert.equal(kept.length, 1);

    await cleanupInstitutionalTestRecords(pool, {
      institutionId: Number(keep.id),
      userIds: [actorId],
      logPrefix: "[cleanupRegressionKeep]",
    });
  });

  it("cleanup failure is not swallowed", { timeout: 30_000 }, async () => {
    const fakePool = {
      async query(sql) {
        if (String(sql).includes("DELETE FROM institutions")) {
          throw new Error("simulated_fk_failure");
        }
        return { rows: [] };
      },
    };
    await assert.rejects(
      () =>
        cleanupInstitutionalTestRecords(fakePool, {
          institutionId: 999999001,
          logPrefix: "[cleanupFail]",
        }),
      /simulated_fk_failure|cleanup completed with/,
    );
  });
});
