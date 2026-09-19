/**
 * Apply Legacy Freelancer Shared Invite migration 187 on STAGING only.
 * Additive. No Production. No payments/Stripe/wallets.
 *
 * Usage (from backend/):
 *   node scripts/applyLegacyInvite187Staging.js
 */
const path = require("node:path");
const fs = require("node:fs");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  assertDatabaseWritable,
  assertStagingWriteProbe,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");
const {
  assertNonProductionDatabase,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  scanSqlForDangerousStatements,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");
const {
  ensureMigrationsTable,
  listAppliedMigrationVersions,
  applyOneMigration,
} = require("./lib/migrationRunnerCore");

const VERSION = "187_legacy_freelancer_shared_invite";
const FILE = "187_legacy_freelancer_shared_invite.sql";

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  printStagingBanner(target);

  const db = assertNonProductionDatabase("apply legacy invite 187 on staging");
  const host = String(classifyDatabaseUrl().host || "").toLowerCase();
  if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
    throw new Error("REFUSED: production Neon host detected");
  }
  if (db.isProduction) {
    throw new Error("REFUSED: production database classification");
  }

  console.log(
    JSON.stringify({
      phase: "target",
      appEnv: target.appEnv,
      classification: target.db.classification,
      isProduction: false,
      maskedTarget: maskDatabaseTarget(),
      prodHostHit: false,
    }),
  );

  const writable = await assertDatabaseWritable();
  const writeProbe = await assertStagingWriteProbe();
  console.log(JSON.stringify({ phase: "write_check", default_transaction_read_only: writable, writeProbe }));

  const filePath = path.join(__dirname, "..", "sql", "migrations", FILE);
  const raw = fs.readFileSync(filePath, "utf8");
  const scan = scanSqlForDangerousStatements(raw);
  if (scan.dangerous) {
    throw new Error(`REFUSED: migration dangerous findings: ${scan.findings.join(", ")}`);
  }
  // Strip SQL comments before heuristic destructive markers (header may mention "db push" as prohibition).
  const sqlBody = raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  if (/^\s*DROP\s+TABLE\b/im.test(sqlBody) || /^\s*TRUNCATE\b/im.test(sqlBody) || /\bDELETE\s+FROM\s+users\b/i.test(sqlBody)) {
    throw new Error("REFUSED: migration contains destructive SQL markers");
  }
  console.log(JSON.stringify({ phase: "migration_review", safe: true, findings: scan.findings }));

  const { pool } = require("../src/config/db");
  const client = await pool.connect();
  let applyResult = "FAILED";
  try {
    await ensureMigrationsTable(client);
    const applied = await listAppliedMigrationVersions(client);
    if (applied.includes(VERSION)) {
      applyResult = "ALREADY_APPLIED";
    } else {
      await applyOneMigration(client, { file: FILE, version: VERSION, raw });
      applyResult = "APPLIED";
    }
    console.log(JSON.stringify({ phase: "migrate", result: applyResult, version: VERSION }));

    const verify = await client.query(
      `
      SELECT
        to_regclass('public.legacy_freelancer_invite_campaigns') IS NOT NULL AS campaigns_ok,
        to_regclass('public.legacy_freelancer_invite_redemptions') IS NOT NULL AS redemptions_ok,
        to_regclass('public.legacy_freelancer_invite_audit_logs') IS NOT NULL AS audit_ok,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'onboarding_source'
        ) AS users_onboarding_source_ok,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'identity_verification_source'
        ) AS users_identity_source_ok,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'training_waiver_reason'
        ) AS users_training_waiver_ok,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'final_exam_waiver_reason'
        ) AS users_exam_waiver_ok,
        EXISTS (
          SELECT 1 FROM schema_migrations WHERE version = $1
        ) AS version_recorded
    `,
      [VERSION],
    );
    console.log(JSON.stringify({ phase: "verify", ...verify.rows[0] }));
  } finally {
    client.release();
  }

  await pool.end();
  console.log(JSON.stringify({ phase: "done", productionTouched: false }));
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
