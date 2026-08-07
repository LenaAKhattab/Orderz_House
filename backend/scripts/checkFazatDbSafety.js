/**
 * Print FAZAT DB safety classification (never prints full DATABASE_URL).
 * Exit 0 if safe for migrate/seed; exit 2 if unsafe.
 *
 *   npm run check:fazat-db-safety
 */
require("dotenv").config({ quiet: true });

const { inspectDatabaseUrl } = require("../src/utils/fazatDbSafety");

function classify(info) {
  if (!info.hasDb) return "UNKNOWN";
  if (info.looksLocal) return "SAFE_LOCAL";
  if (info.safeForMigrationOrSeed && !info.looksLocal) return "SAFE_STAGING";
  if (info.looksNeon || info.looksProductionLike) return "UNSAFE_REMOTE_OR_PRODUCTION";
  return "UNKNOWN";
}

const info = inspectDatabaseUrl();
const classification = classify(info);
const out = {
  classification,
  host: info.host,
  dbName: info.dbName,
  looksLocal: info.looksLocal,
  looksNeon: info.looksNeon,
  safeForMigrationOrSeed: info.safeForMigrationOrSeed,
  allowsLiveSchemaRollout: info.allowsLiveSchemaRollout,
  reason: info.reason,
  note:
    "Live schema-only needs FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT=true + FAZAT_LIVE_SCHEMA_CONFIRM=LIVE_SCHEMA_ONLY (never for seed).",
};
console.log(JSON.stringify(out, null, 2));

if (info.safeForMigrationOrSeed) {
  console.log("[check:fazat-db-safety] SAFE for FAZAT migrate/seed");
  process.exit(0);
}

if (info.allowsLiveSchemaRollout) {
  console.log(
    "[check:fazat-db-safety] LIVE_SCHEMA_ONLY gate armed — migrate:fazat-safe allowed; seed/E2E still forbidden",
  );
  process.exit(0);
}

console.error(
  "[check:fazat-db-safety] UNSAFE — refuse migrate/seed. See docs/integrations/FAZAT_LIVE_DB_ROLLOUT.md",
);
process.exit(2);
