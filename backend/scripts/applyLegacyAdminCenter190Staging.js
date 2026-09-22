/**
 * Apply Legacy Freelancer Admin Center migration 190 on STAGING only.
 * Additive. No Production. No Campaign 2 / token changes.
 * Requires migration 189 already applied.
 *
 * Usage (from backend/):
 *   node scripts/applyLegacyAdminCenter190Staging.js
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

const VERSION = "190_legacy_freelancer_admin_center";
const FILE = "190_legacy_freelancer_admin_center.sql";
const PREREQ = "189_legacy_freelancer_member_id";

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  printStagingBanner(target);

  assertNonProductionDatabase("apply legacy admin center 190 on staging");
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
        EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='legacy_entry_method') AS entry_method_ok,
        EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='must_change_password') AS must_change_ok,
        to_regclass('public.legacy_freelancer_identity_documents') IS NOT NULL AS identity_tbl,
        to_regclass('public.legacy_freelancer_document_types') IS NOT NULL AS doc_types_tbl,
        to_regclass('public.legacy_freelancer_signed_documents') IS NOT NULL AS signed_tbl,
        to_regclass('public.legacy_freelancer_historical_money_received') IS NOT NULL AS money_tbl,
        to_regclass('public.legacy_freelancer_package_assignments') IS NOT NULL AS package_tbl,
        (SELECT COUNT(*)::int FROM legacy_freelancer_document_types
          WHERE code IN ('CONTRACTOR_AGREEMENT','TRAINING_AGREEMENT')) AS default_types
    `,
      [VERSION],
    );
    console.log(JSON.stringify({ phase: "verify", ...verify.rows[0], campaign2Untouched: true }));
    const v = verify.rows[0];
    if (
      !v.recorded ||
      !v.entry_method_ok ||
      !v.must_change_ok ||
      !v.identity_tbl ||
      !v.doc_types_tbl ||
      !v.signed_tbl ||
      !v.money_tbl ||
      !v.package_tbl ||
      Number(v.default_types) < 2
    ) {
      applyResult = "FAILED";
    }
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
  if (applyResult === "FAILED") process.exit(1);
}

main().catch((err) => {
  console.error("APPLY_190_STAGING_FATAL", err.message);
  process.exit(1);
});
