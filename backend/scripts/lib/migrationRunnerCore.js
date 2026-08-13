/**
 * Canonical migration discovery + single-file apply helpers.
 * Shared by runAllMigrations.js and runNextProductionMigration.js.
 *
 * Does not load env, connect to DB, or enforce production guards.
 */

const fs = require("fs");
const path = require("path");

const { splitSqlStatements, stripSqlLineComments } = require("./splitSqlStatements");
const { scanSqlForDangerousStatements } = require("../../src/utils/databaseEnvironmentSafety");

const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, "..", "..", "sql", "migrations");

function versionFromMigrationFilename(file) {
  return String(file || "").replace(/\.sql$/i, "");
}

function normalizeMigrationVersion(version) {
  return String(version || "")
    .trim()
    .replace(/\.sql$/i, "");
}

function isValidExpectedMigrationVersion(version) {
  const v = normalizeMigrationVersion(version);
  if (!v) return false;
  if (/[\\/]/.test(v) || v.includes("..")) return false;
  // Canonical Orderz House migration filenames: NNN_snake_case
  return /^\d{3}_[A-Za-z0-9_]+$/.test(v);
}

function listMigrationFilenames(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isMigrationApplied(client, version) {
  try {
    const { rows } = await client.query(
      `SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1`,
      [version],
    );
    return Boolean(rows[0]);
  } catch (err) {
    if (err && err.code === "42P01") return false;
    throw err;
  }
}

async function listAppliedMigrationVersions(client) {
  try {
    const { rows } = await client.query(`SELECT version FROM schema_migrations`);
    return rows.map((r) => r.version);
  } catch (err) {
    if (err && err.code === "42P01") return [];
    throw err;
  }
}

/**
 * Discover pending migrations in canonical order.
 * @returns {Promise<Array<{ file: string, version: string, filePath: string, raw: string, scan: object }>>}
 */
async function discoverPendingMigrations(client, {
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  scanDangerous = true,
  appliedVersions = null,
} = {}) {
  const files = listMigrationFilenames(migrationsDir);
  const appliedSet =
    appliedVersions == null ? null : new Set(appliedVersions.map((v) => String(v)));
  const pending = [];
  for (const file of files) {
    const version = versionFromMigrationFilename(file);
    if (appliedSet) {
      if (appliedSet.has(version)) continue;
    } else {
      // eslint-disable-next-line no-await-in-loop
      if (await isMigrationApplied(client, version)) continue;
    }
    const filePath = path.join(migrationsDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const scan = scanDangerous
      ? scanSqlForDangerousStatements(raw)
      : { dangerous: false, findings: [] };
    pending.push({ file, version, filePath, raw, scan });
  }
  return pending;
}

/**
 * Pin the first pending migration to EXPECTED_MIGRATION_VERSION.
 * Never skips ahead. Never applies out of order.
 */
function resolveNextMigrationPin({
  pendingFiles = [],
  appliedVersions = [],
  expectedVersion,
} = {}) {
  const expected = normalizeMigrationVersion(expectedVersion);
  if (!expected) {
    return { ok: false, code: "EXPECTED_MIGRATION_VERSION_REQUIRED" };
  }
  if (!isValidExpectedMigrationVersion(expected)) {
    return { ok: false, code: "EXPECTED_MIGRATION_VERSION_INVALID", expected };
  }

  if (!pendingFiles.length) {
    const appliedSet = new Set(appliedVersions);
    if (appliedSet.has(expected)) {
      return { ok: false, code: "NO_PENDING_MIGRATIONS", expected, alreadyApplied: true };
    }
    return { ok: false, code: "NO_PENDING_MIGRATIONS", expected, alreadyApplied: false };
  }

  const next = pendingFiles[0];
  if (next.version === expected) {
    return {
      ok: true,
      code: "NEXT_PENDING_MATCHED",
      migration: next,
      remainingPendingAfter: pendingFiles.length - 1,
      remainingPendingVersionsAfter: pendingFiles.slice(1).map((p) => p.version),
    };
  }

  const appliedSet = new Set(appliedVersions);
  if (appliedSet.has(expected)) {
    return {
      ok: false,
      code: "EXPECTED_MIGRATION_ALREADY_APPLIED",
      expected,
      nextPending: next.version,
      nextPendingFile: next.file,
    };
  }

  return {
    ok: false,
    code: "EXPECTED_MIGRATION_DOES_NOT_MATCH_NEXT_PENDING",
    expected,
    nextPending: next.version,
    nextPendingFile: next.file,
  };
}

/**
 * Apply exactly one migration file using the same statement semantics as runAllMigrations.
 * Does not loop to subsequent pending files.
 *
 * @returns {Promise<{ applied: boolean, version: string, file: string, statementCount: number }>}
 */
async function applyOneMigration(client, migration, { log = console.log } = {}) {
  const { file, version, raw } = migration;
  const cleaned = stripSqlLineComments(raw);
  const statements = splitSqlStatements(cleaned);

  if (statements.length === 0) {
    // Preserve existing runner behavior for empty files.
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
      [version],
    );
    log(`[warn] ${file}: no statements`);
    return { applied: true, version, file, statementCount: 0 };
  }

  log(`[run] ${file} (${statements.length} statement(s))`);
  try {
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = statements[i];
      // eslint-disable-next-line no-await-in-loop
      await client.query(stmt);
      const preview = stmt.replace(/\s+/g, " ").slice(0, 72);
      log(`  [${i + 1}/${statements.length}] OK ${preview}${stmt.length > 72 ? "…" : ""}`);
    }
    await client.query(
      `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
      [version],
    );
    log(`[ok] ${file}`);
    return { applied: true, version, file, statementCount: statements.length };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore — connection may already be idle */
    }
    const err = e instanceof Error ? e : new Error(String(e));
    err.migrationFile = file;
    err.migrationVersion = version;
    throw err;
  }
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  versionFromMigrationFilename,
  normalizeMigrationVersion,
  isValidExpectedMigrationVersion,
  listMigrationFilenames,
  ensureMigrationsTable,
  isMigrationApplied,
  listAppliedMigrationVersions,
  discoverPendingMigrations,
  resolveNextMigrationPin,
  applyOneMigration,
  splitSqlStatements,
  stripSqlLineComments,
};
