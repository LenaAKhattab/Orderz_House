/**
 * Apply Legacy admin package semantics migration 191 on STAGING only.
 * Additive. No Production. Requires 190 already applied.
 *
 * Usage (from backend/):
 *   node scripts/applyLegacyAdminPackageSemantics191Staging.js
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

const VERSION = "191_legacy_admin_package_semantics";
const FILE = "191_legacy_admin_package_semantics.sql";
const PREREQ = "190_legacy_freelancer_admin_center";

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  printStagingBanner(target);

  assertNonProductionDatabase("apply legacy admin package semantics 191 on staging");
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
    if (!applied.includes(PREREQ)) {
      throw new Error(`REFUSED: prerequisite ${PREREQ} not applied on staging`);
    }
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
        (
          SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
           WHERE conname = 'freelancer_subscriptions_check'
             AND conrelid = 'freelancer_subscriptions'::regclass
        ) AS check_def
      `,
      [VERSION],
    );
    const row = verify.rows[0] || {};
    const def = String(row.check_def || "");
    const ok =
      row.recorded === true &&
      def.includes("not_required") &&
      def.includes("has_first_order = false");
    console.log(
      JSON.stringify({
        phase: "verify",
        ok,
        recorded: row.recorded,
        checkIncludesAdminCase: def.includes("not_required"),
      }),
    );
    if (!ok) throw new Error("VERIFY_FAILED");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
