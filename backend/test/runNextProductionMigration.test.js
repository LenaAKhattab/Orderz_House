/**
 * Isolated tests for single-migration Production apply tooling.
 * Does NOT connect to Production. Uses in-memory mock clients + temp migration dirs.
 *
 * Run: node --test test/runNextProductionMigration.test.js
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  resolveNextMigrationPin,
  applyOneMigration,
  discoverPendingMigrations,
  ensureMigrationsTable,
  normalizeMigrationVersion,
  isValidExpectedMigrationVersion,
} = require("../scripts/lib/migrationRunnerCore");
const {
  assertProductionMigrationAllowed,
  PRODUCTION_MIGRATE_CONFIRM_VALUE,
} = require("../src/utils/databaseEnvironmentSafety");

const PROD_URL =
  "postgresql://u:SECRET_PASSWORD@ep-wandering-cherry-ah474lak-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";

function pending(version) {
  return {
    file: `${version}.sql`,
    version,
    filePath: `/virtual/${version}.sql`,
    raw: `-- ${version}\nSELECT 1;`,
    scan: { dangerous: false, findings: [] },
  };
}

function createRecordingClient({ applied = new Set(), failOnSubstring = null } = {}) {
  const appliedSet = applied instanceof Set ? new Set(applied) : new Set(applied);
  const queries = [];
  let rolledBack = false;

  return {
    queries,
    appliedSet,
    get rolledBack() {
      return rolledBack;
    },
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      const text = String(sql);

      if (/CREATE TABLE IF NOT EXISTS schema_migrations/i.test(text)) {
        return { rows: [] };
      }
      if (/SELECT version FROM schema_migrations/i.test(text)) {
        return { rows: [...appliedSet].map((version) => ({ version })) };
      }
      if (/SELECT 1 FROM schema_migrations WHERE version/i.test(text)) {
        const version = params[0];
        return { rows: appliedSet.has(version) ? [{ "?column?": 1 }] : [] };
      }
      if (/INSERT INTO schema_migrations \(version\)/i.test(text)) {
        const version = params[0];
        appliedSet.add(version);
        return { rows: [] };
      }
      if (/^\s*ROLLBACK\b/i.test(text)) {
        rolledBack = true;
        return { rows: [] };
      }
      if (failOnSubstring && text.includes(failOnSubstring)) {
        const err = new Error(`forced failure matching ${failOnSubstring}`);
        throw err;
      }
      return { rows: [] };
    },
  };
}

describe("EXPECTED_MIGRATION_VERSION normalization", () => {
  it("strips .sql and trims", () => {
    assert.equal(
      normalizeMigrationVersion(" 145_marketplace_article_level_model.sql "),
      "145_marketplace_article_level_model",
    );
  });

  it("rejects path traversal / invalid shapes", () => {
    assert.equal(isValidExpectedMigrationVersion("../evil"), false);
    assert.equal(isValidExpectedMigrationVersion("145"), false);
    assert.equal(isValidExpectedMigrationVersion("145_marketplace_article_level_model"), true);
  });
});

describe("resolveNextMigrationPin", () => {
  it("zero pending → NO_PENDING_MIGRATIONS", () => {
    const pin = resolveNextMigrationPin({
      pendingFiles: [],
      appliedVersions: ["144_marketplace_membership_catalog_and_token_grants"],
      expectedVersion: "145_marketplace_article_level_model",
    });
    assert.equal(pin.ok, false);
    assert.equal(pin.code, "NO_PENDING_MIGRATIONS");
  });

  it("missing expected → EXPECTED_MIGRATION_VERSION_REQUIRED", () => {
    const pin = resolveNextMigrationPin({
      pendingFiles: [pending("145_marketplace_article_level_model")],
      expectedVersion: "",
    });
    assert.equal(pin.ok, false);
    assert.equal(pin.code, "EXPECTED_MIGRATION_VERSION_REQUIRED");
  });

  it("one pending matching expected → apply that one", () => {
    const pin = resolveNextMigrationPin({
      pendingFiles: [pending("145_marketplace_article_level_model")],
      appliedVersions: [],
      expectedVersion: "145_marketplace_article_level_model",
    });
    assert.equal(pin.ok, true);
    assert.equal(pin.migration.version, "145_marketplace_article_level_model");
    assert.equal(pin.remainingPendingAfter, 0);
  });

  it("multiple pending + expected 145 → selects only 145; 146 remains listed after", () => {
    const pin = resolveNextMigrationPin({
      pendingFiles: [
        pending("145_marketplace_article_level_model"),
        pending("146_marketplace_bid_credits_foundation"),
      ],
      appliedVersions: ["144_x"],
      expectedVersion: "145_marketplace_article_level_model",
    });
    assert.equal(pin.ok, true);
    assert.equal(pin.migration.version, "145_marketplace_article_level_model");
    assert.equal(pin.remainingPendingAfter, 1);
    assert.deepEqual(pin.remainingPendingVersionsAfter, [
      "146_marketplace_bid_credits_foundation",
    ]);
  });

  it("expected 146 while 145 is first pending → mismatch fail-closed", () => {
    const pin = resolveNextMigrationPin({
      pendingFiles: [
        pending("145_marketplace_article_level_model"),
        pending("146_marketplace_bid_credits_foundation"),
      ],
      appliedVersions: [],
      expectedVersion: "146_marketplace_bid_credits_foundation",
    });
    assert.equal(pin.ok, false);
    assert.equal(pin.code, "EXPECTED_MIGRATION_DOES_NOT_MATCH_NEXT_PENDING");
    assert.equal(pin.nextPending, "145_marketplace_article_level_model");
  });

  it("expected already applied while another is pending → EXPLICIT already-applied (no silent next)", () => {
    const pin = resolveNextMigrationPin({
      pendingFiles: [pending("146_marketplace_bid_credits_foundation")],
      appliedVersions: ["145_marketplace_article_level_model"],
      expectedVersion: "145_marketplace_article_level_model",
    });
    assert.equal(pin.ok, false);
    assert.equal(pin.code, "EXPECTED_MIGRATION_ALREADY_APPLIED");
    assert.equal(pin.nextPending, "146_marketplace_bid_credits_foundation");
  });
});

describe("applyOneMigration semantics", () => {
  it("applies exactly one migration and records schema_migrations once via runner insert", async () => {
    const client = createRecordingClient();
    const logs = [];
    const migration = {
      file: "145_marketplace_article_level_model.sql",
      version: "145_marketplace_article_level_model",
      raw: "BEGIN;\nCREATE TABLE t(id int);\nCOMMIT;",
    };
    const result = await applyOneMigration(client, migration, {
      log: (m) => logs.push(m),
    });
    assert.equal(result.applied, true);
    assert.equal(result.version, "145_marketplace_article_level_model");
    assert.equal(result.statementCount, 3);
    assert.ok(client.appliedSet.has("145_marketplace_article_level_model"));
    const inserts = client.queries.filter((q) =>
      /INSERT INTO schema_migrations \(version\)/.test(q.sql),
    );
    assert.equal(inserts.length, 1);
    assert.deepEqual(inserts[0].params, ["145_marketplace_article_level_model"]);
  });

  it("multiple pending scenario: apply 145 only leaves 146 unrecorded", async () => {
    const client = createRecordingClient();
    const m145 = {
      file: "145_marketplace_article_level_model.sql",
      version: "145_marketplace_article_level_model",
      raw: "SELECT '145';",
    };
    const m146 = {
      file: "146_marketplace_bid_credits_foundation.sql",
      version: "146_marketplace_bid_credits_foundation",
      raw: "SELECT '146';",
    };

    const pin = resolveNextMigrationPin({
      pendingFiles: [m145, m146],
      appliedVersions: [],
      expectedVersion: "145_marketplace_article_level_model",
    });
    assert.equal(pin.ok, true);

    await applyOneMigration(client, pin.migration, { log: () => {} });

    assert.ok(client.appliedSet.has("145_marketplace_article_level_model"));
    assert.equal(client.appliedSet.has("146_marketplace_bid_credits_foundation"), false);

    // Critically: never invoked apply on 146 in this invocation
    const executedSql = client.queries.map((q) => q.sql).join("\n");
    assert.match(executedSql, /SELECT '145'/);
    assert.doesNotMatch(executedSql, /SELECT '146'/);
  });

  it("failure mid-migration rolls back and does not record version", async () => {
    const client = createRecordingClient({ failOnSubstring: "BOOM" });
    const migration = {
      file: "999_fail.sql",
      version: "999_fail",
      raw: "SELECT 1;\nSELECT 'BOOM';\nSELECT 3;",
    };
    await assert.rejects(
      () => applyOneMigration(client, migration, { log: () => {} }),
      /forced failure/,
    );
    assert.equal(client.rolledBack, true);
    assert.equal(client.appliedSet.has("999_fail"), false);
    const inserts = client.queries.filter((q) =>
      /INSERT INTO schema_migrations \(version\)/.test(q.sql),
    );
    assert.equal(inserts.length, 0);
  });
});

describe("discoverPendingMigrations with temp dir", () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-migrate-next-"));
    fs.writeFileSync(
      path.join(tmpDir, "145_marketplace_article_level_model.sql"),
      "BEGIN;\nSELECT 1;\nCOMMIT;\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, "146_marketplace_bid_credits_foundation.sql"),
      "BEGIN;\nSELECT 2;\nCOMMIT;\n",
    );
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns both pending in canonical order when none applied", async () => {
    const client = createRecordingClient();
    await ensureMigrationsTable(client);
    const pendingFiles = await discoverPendingMigrations(client, {
      migrationsDir: tmpDir,
      scanDangerous: false,
    });
    assert.deepEqual(
      pendingFiles.map((p) => p.version),
      ["145_marketplace_article_level_model", "146_marketplace_bid_credits_foundation"],
    );
  });

  it("omits applied versions from pending list", async () => {
    const client = createRecordingClient({
      applied: new Set(["145_marketplace_article_level_model"]),
    });
    const pendingFiles = await discoverPendingMigrations(client, {
      migrationsDir: tmpDir,
      scanDangerous: false,
    });
    assert.deepEqual(
      pendingFiles.map((p) => p.version),
      ["146_marketplace_bid_credits_foundation"],
    );
  });
});

describe("Production guard contract for single-migration apply", () => {
  it("fails without ALLOW_PRODUCTION_DB_MIGRATIONS", () => {
    assert.throws(
      () =>
        assertProductionMigrationAllowed("production next migration", {
          DATABASE_URL: PROD_URL,
          APP_ENV: "production",
          CONFIRM_PRODUCTION_DATABASE: PRODUCTION_MIGRATE_CONFIRM_VALUE,
          PRODUCTION_BACKUP_CONFIRMED: "1",
        }),
      (e) => e && e.code === "PRODUCTION_MIGRATION_APPROVAL_REQUIRED",
    );
  });

  it("fails without CONFIRM_PRODUCTION_DATABASE", () => {
    assert.throws(
      () =>
        assertProductionMigrationAllowed("production next migration", {
          DATABASE_URL: PROD_URL,
          APP_ENV: "production",
          ALLOW_PRODUCTION_DB_MIGRATIONS: "1",
          PRODUCTION_BACKUP_CONFIRMED: "1",
        }),
      (e) => e && e.code === "PRODUCTION_MIGRATION_CONFIRM_REQUIRED",
    );
  });

  it("fails without PRODUCTION_BACKUP_CONFIRMED", () => {
    assert.throws(
      () =>
        assertProductionMigrationAllowed("production next migration", {
          DATABASE_URL: PROD_URL,
          APP_ENV: "production",
          ALLOW_PRODUCTION_DB_MIGRATIONS: "1",
          CONFIRM_PRODUCTION_DATABASE: PRODUCTION_MIGRATE_CONFIRM_VALUE,
        }),
      (e) => e && e.code === "PRODUCTION_BACKUP_CONFIRM_REQUIRED",
    );
  });

  it("allows full approval set (same as db:migrate:production)", () => {
    const result = assertProductionMigrationAllowed("production next migration", {
      DATABASE_URL: PROD_URL,
      APP_ENV: "production",
      ALLOW_PRODUCTION_DB_MIGRATIONS: "1",
      CONFIRM_PRODUCTION_DATABASE: PRODUCTION_MIGRATE_CONFIRM_VALUE,
      PRODUCTION_BACKUP_CONFIRMED: "1",
    });
    assert.equal(result.mode, "production");
  });
});

describe("migration 145/146 files untouched by tooling task", () => {
  it("145 and 146 still exist with stable content markers", () => {
    const m145 = path.join(
      __dirname,
      "../sql/migrations/145_marketplace_article_level_model.sql",
    );
    const m146 = path.join(
      __dirname,
      "../sql/migrations/146_marketplace_bid_credits_foundation.sql",
    );
    assert.ok(fs.existsSync(m145));
    assert.ok(fs.existsSync(m146));
    const sql145 = fs.readFileSync(m145, "utf8");
    const sql146 = fs.readFileSync(m146, "utf8");
    assert.match(sql145, /CREATE TABLE IF NOT EXISTS marketplace_articles/);
    assert.match(sql146, /bid_credit/i);
    const hash145 = crypto.createHash("sha256").update(sql145).digest("hex");
    const hash146 = crypto.createHash("sha256").update(sql146).digest("hex");
    assert.equal(hash145.length, 64);
    assert.equal(hash146.length, 64);
  });
});
