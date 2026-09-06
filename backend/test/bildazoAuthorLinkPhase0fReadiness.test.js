/**
 * Phase 0F — production migration readiness for 163 then 164.
 * Does not connect to production. Does not apply SQL.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { scanSqlForDangerousStatements } = require("../src/utils/databaseEnvironmentSafety");
const {
  listMigrationFilenames,
  versionFromMigrationFilename,
  resolveNextMigrationPin,
} = require("../scripts/lib/migrationRunnerCore");
const { isBildazoAuthorGateEnabled } = require("../src/config/bildazoAuthorGate");

const MIGRATIONS_DIR = path.join(__dirname, "..", "sql", "migrations");

function readMigration(file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

function stripComments(raw) {
  return raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

describe("Phase 0F migration readiness", () => {
  it("163 then 164 are the next filenames in order with no 158/163 collision", () => {
    const files = listMigrationFilenames();
    assert.equal(files.filter((f) => f.startsWith("158_")).length, 1);
    assert.equal(files.filter((f) => f.startsWith("163_")).length, 1);
    assert.equal(files.filter((f) => f.startsWith("164_")).length, 1);
    const i163 = files.findIndex((f) => f.startsWith("163_"));
    const i164 = files.findIndex((f) => f.startsWith("164_"));
    assert.ok(i163 >= 0 && i164 === i163 + 1);
    assert.equal(versionFromMigrationFilename(files[i163]), "163_freelancer_onboarding");
    assert.equal(versionFromMigrationFilename(files[i164]), "164_freelancer_bildazo_author_links");
  });

  it("runner cannot skip 163 to apply 164", () => {
    const pending = [
      { file: "163_freelancer_onboarding.sql", version: "163_freelancer_onboarding" },
      { file: "164_freelancer_bildazo_author_links.sql", version: "164_freelancer_bildazo_author_links" },
    ];
    const skip = resolveNextMigrationPin({
      pendingFiles: pending,
      appliedVersions: [],
      expectedVersion: "164_freelancer_bildazo_author_links",
    });
    assert.equal(skip.ok, false);
    assert.equal(skip.nextPending, "163_freelancer_onboarding");
    const next163 = resolveNextMigrationPin({
      pendingFiles: pending,
      appliedVersions: [],
      expectedVersion: "163_freelancer_onboarding",
    });
    assert.equal(next163.ok, true);
    assert.equal(next163.remainingPendingAfter, 1);
  });

  it("163 executable SQL is additive CREATE/INSERT only", () => {
    const raw = readMigration("163_freelancer_onboarding.sql");
    const stripped = stripComments(raw);
    assert.equal(scanSqlForDangerousStatements(raw).dangerous, false);
    assert.equal(scanSqlForDangerousStatements(stripped).dangerous, false);
    assert.match(stripped, /CREATE TABLE IF NOT EXISTS onboarding_items/);
    assert.match(stripped, /ON CONFLICT \(key\) DO NOTHING/);
    assert.doesNotMatch(stripped, /\bDROP TABLE\b/i);
    assert.doesNotMatch(stripped, /\bDELETE FROM\b/i);
    assert.doesNotMatch(stripped, /\bTRUNCATE\b/i);
  });

  it("164 executable SQL is additive CREATE TABLE and does not trip the production danger scanner", () => {
    const raw = readMigration("164_freelancer_bildazo_author_links.sql");
    const stripped = stripComments(raw);
    assert.equal(scanSqlForDangerousStatements(raw).dangerous, false);
    assert.equal(scanSqlForDangerousStatements(stripped).dangerous, false);
    assert.match(stripped, /CREATE TABLE IF NOT EXISTS freelancer_bildazo_author_links/);
    assert.doesNotMatch(stripped, /\bDROP TABLE\b/i);
    assert.doesNotMatch(stripped, /\bDELETE FROM\b/i);
    assert.doesNotMatch(stripped, /\bTRUNCATE\b/i);
  });

  it("Bildazo gate defaults off", () => {
    const prev = process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    assert.equal(isBildazoAuthorGateEnabled(), false);
    if (prev == null) delete process.env.BILDAZO_AUTHOR_GATE_ENABLED;
    else process.env.BILDAZO_AUTHOR_GATE_ENABLED = prev;
  });

  it("Bildazo S2S sync defaults off and is a separate flag from the apply gate", () => {
    const { isBildazoAuthorSyncEnabled } = require("../src/config/bildazoAuthorSync");
    const prev = process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
    delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
    assert.equal(isBildazoAuthorSyncEnabled(), false);
    process.env.BILDAZO_AUTHOR_SYNC_ENABLED = "true";
    assert.equal(isBildazoAuthorSyncEnabled(), true);
    assert.equal(isBildazoAuthorGateEnabled(), false);
    if (prev == null) delete process.env.BILDAZO_AUTHOR_SYNC_ENABLED;
    else process.env.BILDAZO_AUTHOR_SYNC_ENABLED = prev;
  });

  it("JWT sub is the identity source; cookie then Bearer; /auth/me uses sub", () => {
    const authService = fs.readFileSync(path.join(__dirname, "..", "src", "services", "authService.js"), "utf8");
    assert.match(authService, /sub:\s*String\(userRow\.id\)/);
    const authMw = fs.readFileSync(path.join(__dirname, "..", "src", "middleware", "authMiddleware.js"), "utf8");
    assert.match(authMw, /fromCookie = req\.cookies\?\.\[AUTH_COOKIE_NAME\]/);
    assert.match(authMw, /getTokenFromHeader\(req\.headers\.authorization\)/);
    const rbac = fs.readFileSync(path.join(__dirname, "..", "src", "middleware", "rbacMiddleware.js"), "utf8");
    assert.match(rbac, /getUserRowByIdForAuthz\(req\.user\.sub\)/);
    assert.match(rbac, /req\.user\.id = Number\(legacyUser\.id\)/);
    const authCtrl = fs.readFileSync(path.join(__dirname, "..", "src", "controllers", "authController.js"), "utf8");
    assert.match(authCtrl, /getPublicUserById\(req\.user\.sub\)/);
  });

  it("article apply still calls Bildazo prerequisite before Bid reserve; S2S client is gated", () => {
    const apps = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "marketplaceArticleApplicationsService.js"),
      "utf8",
    );
    const gateAt = apps.indexOf("assertBildazoAuthorLinkedForArticleApply");
    const reserveAt = apps.indexOf("reserveBidCreditsFefo");
    assert.ok(gateAt > 0 && reserveAt > gateAt);
    const clientSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "bildazoAuthorIntegrationClient.js"),
      "utf8",
    );
    assert.match(clientSrc, /BILDAZO_INTEGRATION_NOT_IMPLEMENTED/);
    assert.match(clientSrc, /linkOrCreateBildazoAuthor/);
    assert.match(clientSrc, /BILDAZO_AUTHOR_SYNC_ENABLED|getBildazoAuthorSyncConfig/);
    assert.doesNotMatch(clientSrc, /\baxios\b/);
    assert.doesNotMatch(clientSrc, /console\.(log|info|warn|error)\([^)]*secret/i);
    const syncCfg = fs.readFileSync(
      path.join(__dirname, "..", "src", "config", "bildazoAuthorSync.js"),
      "utf8",
    );
    assert.match(syncCfg, /BILDAZO_AUTHOR_SYNC_ENABLED/);
  });
});
