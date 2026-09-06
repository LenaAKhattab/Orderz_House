/**
 * Guardrails for FAZAT staging/local scripts and optional live schema-only rollout.
 * Never print full DATABASE_URL.
 */

function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function inspectDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  const u = String(databaseUrl || "").trim();
  if (!u) {
    return {
      hasDb: false,
      host: null,
      dbName: null,
      looksLocal: false,
      looksNeon: false,
      looksProductionLike: true,
      safeForMigrationOrSeed: false,
      allowsLiveSchemaRollout: false,
      reason: "DATABASE_URL missing",
    };
  }

  let host = "";
  let dbName = "";
  try {
    const parsed = new URL(u);
    host = parsed.hostname || "";
    dbName = (parsed.pathname || "").replace(/^\//, "") || null;
  } catch {
    return {
      hasDb: true,
      host: null,
      dbName: null,
      looksLocal: false,
      looksNeon: false,
      looksProductionLike: true,
      safeForMigrationOrSeed: false,
      allowsLiveSchemaRollout: false,
      reason: "DATABASE_URL parse failed",
    };
  }

  const looksLocal = host === "localhost" || host === "127.0.0.1";
  const looksNeon = /\.neon\.tech$/i.test(host);
  const nameHints = /prod|production|live|orderzhouse/i.test(`${host} ${dbName || ""}`);
  // Dedicated staging hosts may be Neon; require explicit allow + confirm.
  const explicitAllow = String(process.env.FAZAT_ALLOW_REMOTE_STAGING_DB || "") === "1";
  const confirm = String(process.env.FAZAT_SEED_CONFIRM || "") === "STAGING";

  // Live schema-only override (migration 125). NEVER enables seed/E2E.
  const liveSchemaFlag = truthy(process.env.FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT);
  const liveSchemaConfirm = String(process.env.FAZAT_LIVE_SCHEMA_CONFIRM || "").trim() === "LIVE_SCHEMA_ONLY";
  const allowsLiveSchemaRollout = liveSchemaFlag && liveSchemaConfirm;

  let safeForMigrationOrSeed = false;
  let reason = "";
  if (looksLocal) {
    safeForMigrationOrSeed = true;
    reason = "local postgres host";
  } else if (looksNeon && !explicitAllow) {
    safeForMigrationOrSeed = false;
    reason =
      "Neon remote host blocked (treat as production-like unless FAZAT_ALLOW_REMOTE_STAGING_DB=1 + FAZAT_SEED_CONFIRM=STAGING)";
  } else if (!looksLocal && !(explicitAllow && confirm)) {
    safeForMigrationOrSeed = false;
    reason = "non-local host blocked without explicit staging confirmation";
  } else if (explicitAllow && confirm) {
    safeForMigrationOrSeed = true;
    reason = "explicit remote staging allow";
  } else {
    safeForMigrationOrSeed = false;
    reason = "unsafe or unknown host";
  }

  return {
    hasDb: true,
    host,
    dbName,
    looksLocal,
    looksNeon,
    looksProductionLike: looksNeon || nameHints || !looksLocal,
    safeForMigrationOrSeed,
    allowsLiveSchemaRollout,
    reason,
  };
}

/** Seed / E2E / partner test data — never uses live schema override. */
function assertSafeFazatDbOrThrow(actionLabel = "FAZAT DB action") {
  const info = inspectDatabaseUrl();
  if (truthy(process.env.FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT)) {
    const err = new Error(
      `[${actionLabel}] refused: FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT does NOT authorize seed/E2E/data writes. Use local or staging only.`,
    );
    err.code = "FAZAT_LIVE_SCHEMA_ONLY";
    throw err;
  }
  if (!info.safeForMigrationOrSeed) {
    const err = new Error(
      `[${actionLabel}] refused: ${info.reason}. host=${info.host || "unknown"} db=${info.dbName || "unknown"}`,
    );
    err.code = "FAZAT_UNSAFE_DB";
    throw err;
  }
  return info;
}

/**
 * Migration 125 only: local/staging OR explicit live schema rollout.
 * Does not authorize seed or E2E.
 */
function assertSafeForSchemaMigrationOrThrow(actionLabel = "FAZAT schema migration") {
  const info = inspectDatabaseUrl();
  if (info.safeForMigrationOrSeed) return { ...info, mode: "safe_local_or_staging" };
  if (info.allowsLiveSchemaRollout) {
    return { ...info, mode: "live_schema_only" };
  }
  const err = new Error(
    `[${actionLabel}] refused: ${info.reason}. For live schema-only rollout set FAZAT_ALLOW_LIVE_SCHEMA_ROLLOUT=true and FAZAT_LIVE_SCHEMA_CONFIRM=LIVE_SCHEMA_ONLY (owner-approved). host=${info.host || "unknown"}`,
  );
  err.code = "FAZAT_UNSAFE_DB";
  throw err;
}

module.exports = {
  inspectDatabaseUrl,
  assertSafeFazatDbOrThrow,
  assertSafeForSchemaMigrationOrThrow,
  truthy,
};
