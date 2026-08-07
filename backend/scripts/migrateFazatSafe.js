/**
 * Apply ONLY migration 125 (FAZAT tables) when DB is safe OR owner-approved live schema rollout.
 * Does NOT run seed. Does NOT enable FAZAT_INTEGRATION_ENABLED.
 *
 * Safe local/staging:
 *   npm run migrate:fazat-safe
 *
 * Live schema-only (OWNER APPROVAL REQUIRED — do not run casually):
 *   FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT=true FAZAT_LIVE_SCHEMA_CONFIRM=LIVE_SCHEMA_ONLY npm run migrate:fazat-safe
 *
 * Then immediately UNSET those flags. Keep FAZAT_INTEGRATION_ENABLED=false.
 */
const path = require("node:path");
const fs = require("node:fs");

const dotenvPath = process.env.DOTENV_CONFIG_PATH
  ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
  : path.resolve(process.cwd(), ".env");
require("dotenv").config({ path: dotenvPath, quiet: true });

const {
  assertSafeForSchemaMigrationOrThrow,
  inspectDatabaseUrl,
} = require("../src/utils/fazatDbSafety");

(async () => {
  const info = inspectDatabaseUrl();
  console.log(
    JSON.stringify(
      {
        action: "migrate:fazat-safe",
        host: info.host,
        dbName: info.dbName,
        safeForMigrationOrSeed: info.safeForMigrationOrSeed,
        allowsLiveSchemaRollout: info.allowsLiveSchemaRollout,
        reason: info.reason,
        fazatIntegrationEnabled: String(process.env.FAZAT_INTEGRATION_ENABLED || ""),
      },
      null,
      2,
    ),
  );

  const gate = assertSafeForSchemaMigrationOrThrow("migrate:fazat-safe");

  if (gate.mode === "live_schema_only") {
    console.error("");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error(" WARNING: LIVE/REMOTE SCHEMA-ONLY ROLLOUT");
    console.error(" This applies migration 125 ONLY (new FAZAT tables).");
    console.error(" It must NOT be followed by seed, E2E, or enabling FAZAT.");
    console.error(" Keep FAZAT_INTEGRATION_ENABLED=false until explicit pilot.");
    console.error(" Unset FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT after this run.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("");
    if (truthyIntegrationEnabled()) {
      throw new Error(
        "Refusing live schema rollout while FAZAT_INTEGRATION_ENABLED is truthy. Set it false first.",
      );
    }
  }

  const sqlPath = path.join(__dirname, "..", "sql", "migrations", "125_fazat_workforce_provider.sql");
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Missing migration file: ${sqlPath}`);
  }

  const { spawnSync } = require("node:child_process");
  const r = spawnSync(process.execPath, [path.join(__dirname, "runSqlFile.js"), sqlPath], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: process.env,
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }

  const { pool } = require("../src/config/db");
  const needed = [
    "integration_partners",
    "partner_freelancer_profiles",
    "partner_orders",
    "partner_order_messages",
    "partner_request_nonces",
    "partner_webhook_events",
    "partner_integration_audit_logs",
  ];
  const { rows } = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [needed],
  );
  const found = new Set(rows.map((x) => x.table_name));
  const missing = needed.filter((t) => !found.has(t));

  let partnerRow = null;
  try {
    const pr = await pool.query(
      `SELECT code, enabled FROM integration_partners WHERE code = 'FAZAT' LIMIT 1`,
    );
    partnerRow = pr.rows[0] || null;
  } catch {
    partnerRow = null;
  }

  console.log(
    JSON.stringify(
      {
        tablesOk: missing.length === 0,
        found: [...found],
        missing,
        fazatPartnerRow: partnerRow,
        reminder: "Unset FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT; keep FAZAT_INTEGRATION_ENABLED=false",
      },
      null,
      2,
    ),
  );
  await pool.end();
  if (missing.length) process.exit(1);
  console.log("[migrate:fazat-safe] PASS");
})().catch(async (err) => {
  console.error("[migrate:fazat-safe] FAIL", err && err.message ? err.message : err);
  process.exit(1);
});

function truthyIntegrationEnabled() {
  const s = String(process.env.FAZAT_INTEGRATION_ENABLED || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}
