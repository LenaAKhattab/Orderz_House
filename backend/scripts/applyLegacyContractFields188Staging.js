/**
 * Apply Legacy Freelancer contract fields migration 188 on STAGING only.
 * Additive. No Production. No Campaign 2 / token changes.
 *
 * Usage (from backend/):
 *   node scripts/applyLegacyContractFields188Staging.js
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

const VERSION = "188_legacy_freelancer_contract_fields";
const FILE = "188_legacy_freelancer_contract_fields.sql";

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  printStagingBanner(target);

  const db = assertNonProductionDatabase("apply legacy contract fields 188 on staging");
  const host = String(classifyDatabaseUrl().host || "").toLowerCase();
  if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
    throw new Error("REFUSED: production Neon host detected");
  }
  if (db.isProduction) {
    throw new Error("REFUSED: production database classification");
  }
  if (!String(host).includes("solitary-band")) {
    console.warn(
      JSON.stringify({
        warning: "host does not include solitary-band marker; continuing only if classified non-production",
        hostPrefix: String(db.host || "").slice(0, 28),
        classification: db.classification,
      }),
    );
  }

  console.log(
    JSON.stringify({
      phase: "target",
      classification: target.db.classification,
      isProduction: false,
      maskedTarget: maskDatabaseTarget(),
      solitaryBand: String(host).includes("solitary-band"),
      wanderingCherry: String(host).includes("wandering-cherry"),
    }),
  );

  const writable = await assertDatabaseWritable();
  const writeProbe = await assertStagingWriteProbe();
  console.log(JSON.stringify({ phase: "write_check", default_transaction_read_only: writable, writeProbe }));

  const filePath = path.join(__dirname, "..", "sql", "migrations", FILE);
  const raw = fs.readFileSync(filePath, "utf8");
  // Strip SQL comments before heuristics (header may mention DROP/TRUNCATE as prohibition).
  const sqlBody = raw
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  const scan = scanSqlForDangerousStatements(sqlBody);
  if (scan.dangerous) {
    throw new Error(`REFUSED: migration dangerous findings: ${scan.findings.join(", ")}`);
  }
  if (
    /^\s*DROP\s+TABLE\b/im.test(sqlBody) ||
    /^\s*TRUNCATE\b/im.test(sqlBody) ||
    /\bDELETE\s+FROM\s+users\b/i.test(sqlBody)
  ) {
    throw new Error("REFUSED: migration contains destructive SQL markers");
  }
  console.log(JSON.stringify({ phase: "migration_review", safe: true, findings: scan.findings || [] }));

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

    const verify = await client.query(`
      SELECT
        EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1) AS recorded,
        to_regclass('public.legacy_freelancer_invite_campaign_fields') IS NOT NULL AS fields_ok,
        to_regclass('public.legacy_freelancer_invite_answers') IS NOT NULL AS answers_ok,
        (SELECT COUNT(*)::int FROM pg_indexes WHERE tablename = 'legacy_freelancer_invite_campaign_fields') AS fields_idx,
        (SELECT COUNT(*)::int FROM pg_indexes WHERE tablename = 'legacy_freelancer_invite_answers') AS answers_idx
    `, [VERSION]);
    console.log(JSON.stringify({ phase: "verify", ...verify.rows[0] }));
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
  if (applyResult === "FAILED") process.exit(1);
}

main().catch((err) => {
  console.error("APPLY_188_STAGING_FATAL", err.message);
  process.exit(1);
});
