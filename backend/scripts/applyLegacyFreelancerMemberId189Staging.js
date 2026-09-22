/**
 * Apply Legacy Freelancer member ID migration 189 on STAGING only.
 * Additive. No Production. No Campaign 2 / token changes.
 *
 * Usage (from backend/):
 *   node scripts/applyLegacyFreelancerMemberId189Staging.js
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

const VERSION = "189_legacy_freelancer_member_id";
const FILE = "189_legacy_freelancer_member_id.sql";

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  printStagingBanner(target);

  assertNonProductionDatabase("apply legacy freelancer member id 189 on staging");
  const host = String(classifyDatabaseUrl().host || "").toLowerCase();
  if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
    throw new Error("Refusing: DATABASE_URL looks like Production.");
  }
  if (host.includes("wandering-cherry")) {
    throw new Error("REFUSED: production host marker wandering-cherry");
  }
  if (!host.includes("solitary-band")) {
    throw new Error("REFUSED: staging host must include solitary-band");
  }

  console.log(
    JSON.stringify({
      phase: "target",
      maskedTarget: maskDatabaseTarget(),
      solitaryBand: true,
      wanderingCherry: false,
    }),
  );

  const filePath = path.join(__dirname, "..", "sql", "migrations", FILE);
  const raw = fs.readFileSync(filePath, "utf8");
  const sqlBody = raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  const scan = scanSqlForDangerousStatements(sqlBody);
  if (scan.dangerous) {
    throw new Error(`REFUSED: migration dangerous findings: ${scan.findings.join(", ")}`);
  }
  console.log(JSON.stringify({ phase: "migration_review", safe: true, findings: scan.findings || [] }));

  await assertDatabaseWritable();
  await assertStagingWriteProbe();

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
        EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS recorded,
        EXISTS (
          SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'users'
             AND column_name = 'freelancer_member_id'
             AND data_type = 'character varying'
             AND character_maximum_length = 32
             AND is_nullable = 'YES'
        ) AS column_ok,
        EXISTS (
          SELECT 1 FROM pg_indexes
           WHERE tablename = 'users' AND indexname = 'users_legacy_freelancer_member_id_uidx'
        ) AS partial_uidx_ok
    `,
      [VERSION],
    );
    console.log(JSON.stringify({ phase: "verify", ...verify.rows[0], campaign2Untouched: true }));
    if (!verify.rows[0].recorded || !verify.rows[0].column_ok || !verify.rows[0].partial_uidx_ok) {
      applyResult = "FAILED";
    }
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
  if (applyResult === "FAILED") process.exit(1);
}

main().catch((err) => {
  console.error("APPLY_189_STAGING_FATAL", err.message);
  process.exit(1);
});
