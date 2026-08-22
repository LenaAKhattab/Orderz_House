/**
 * Staging-only migrations — loads backend/.env.staging, never production DATABASE_URL.
 *
 * Usage (from backend/):
 *   npm run db:migrate:staging
 *   npm run db:migrate:status:staging
 *
 * Requires:
 *   - backend/.env.staging with APP_ENV=staging
 *   - DATABASE_URL pointing at Neon branch staging-ord20 (not production)
 *
 * Does NOT run migrations when invoked with --status (read-only status only).
 */

const { spawnSync } = require("child_process");
const path = require("path");
const { loadStagingEnvOnly, logStagingTarget, BACKEND_ROOT } = require("./lib/loadStagingEnvOnly");

const statusOnly = process.argv.includes("--status");

function exitOnError(err) {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  process.exit(1);
}

function main() {
  let gate;
  try {
    gate = loadStagingEnvOnly(statusOnly ? "staging migration status" : "staging database migration");
  } catch (err) {
    exitOnError(err);
    return;
  }

  logStagingTarget(gate.db);

  const scriptName = statusOnly ? "migrateStatus.js" : "runAllMigrations.js";
  const scriptPath = path.join(__dirname, scriptName);
  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: BACKEND_ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

main();
