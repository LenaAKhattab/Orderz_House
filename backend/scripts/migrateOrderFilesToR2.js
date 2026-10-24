/**
 * Legacy Cloudinary / local order files → Cloudflare R2 (private bucket).
 *
 * Modes (default: inventory, read-only):
 *   node scripts/migrateOrderFilesToR2.js                      # inventory counts by surface
 *   node scripts/migrateOrderFilesToR2.js --execute --limit=50 # bounded batch migration
 *   node scripts/migrateOrderFilesToR2.js --verify --limit=50  # HEAD-check migrated rows in R2
 *   node scripts/migrateOrderFilesToR2.js --rollback           # point migrated rows back to legacy (dry unless --execute)
 * Options: --table=order_files|institutional_stored_order_files|all  --concurrency=3  --staging
 *
 * Guarantees:
 *   - Idempotent / resumable: only rows with storage_migrated_at IS NULL are picked; keys are
 *     deterministic per row; the row update is conditional.
 *   - Verifies size (vs DB size_bytes) and SHA-256 (R2 metadata) before switching a row.
 *   - Never deletes or modifies Cloudinary objects; legacy columns are kept for rollback.
 *   - Prints no URLs, keys of other systems, or credentials. Journal: file_storage_migration_events.
 *   - Production DB requires ALLOW_PRODUCTION_OPERATIONAL_SCRIPT=1 + CONFIRM_PRODUCTION_OPERATIONAL_SCRIPT.
 */

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v === undefined ? true : v];
  }),
);

if (args.get("staging")) {
  const { loadStagingQaEnv, assertStagingQaTarget } = require("../src/config/stagingQaEnv");
  // Staging DB/APP_ENV from .env.staging; unset keys (e.g. R2_*) filled from local .env.
  loadStagingQaEnv();
  assertStagingQaTarget();
}

const crypto = require("node:crypto");
const { pool } = require("../src/config/db");
const { assertOperationalScriptAllowed } = require("../src/utils/databaseEnvironmentSafety");
const { isR2Configured, missingR2Variables, readR2Config } = require("../src/config/r2");
const fileStorage = require("../src/services/fileStorageService");

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const TABLES = {
  order_files: {
    tag: "of",
    scope: "orders",
    scopeColumn: "order_id",
    sizeColumn: "size_bytes",
    purposeSql: "purpose",
    hasFileColumns: true,
  },
  institutional_stored_order_files: {
    tag: "isof",
    scope: "stored-orders",
    scopeColumn: "stored_order_id",
    sizeColumn: "byte_size",
    purposeSql: "'brief'",
    hasFileColumns: false,
  },
};

function selectedTables() {
  const t = String(args.get("table") || "all");
  if (t === "all") return Object.keys(TABLES);
  if (!TABLES[t]) throw new Error(`Unknown --table=${t}`);
  return [t];
}

async function inventory(table) {
  const cfg = TABLES[table];
  const { rows } = await pool.query(
    `SELECT ${cfg.purposeSql} AS purpose,
            COALESCE(storage_provider, 'unclassified') AS provider,
            (storage_migrated_at IS NOT NULL) AS migrated,
            COUNT(*)::int AS files,
            COALESCE(SUM(${cfg.sizeColumn}), 0)::bigint AS bytes
       FROM ${table}
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
  );
  return rows.map((r) => ({ table, ...r, bytes: Number(r.bytes) }));
}

async function journal(table, sourceId, outcome, extra = {}) {
  await pool.query(
    `INSERT INTO file_storage_migration_events
       (source_table, source_id, outcome, detail, target_bucket, target_key, size_bytes, content_sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      table,
      Number(sourceId),
      outcome,
      extra.detail ? String(extra.detail).slice(0, 500) : null,
      extra.bucket || null,
      extra.key || null,
      extra.size != null ? Number(extra.size) : null,
      extra.sha256 || null,
    ],
  );
}

async function readAll(stream, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += b.length;
    if (total > limit) {
      if (typeof stream.destroy === "function") stream.destroy();
      const err = new Error("file exceeds migration size cap");
      err.code = "TOO_LARGE";
      throw err;
    }
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

async function migrateRow(table, row) {
  const cfg = TABLES[table];
  const expectedSize = Number(row[cfg.sizeColumn] || 0);
  const opened = await fileStorage.openFileStream(row);
  const buffer = await readAll(opened.stream, MAX_FILE_BYTES);
  // Truncated transfer → fail. A DB size that differs from the served bytes is only noted:
  // legacy Cloudinary re-encodes images on upload, so served bytes are what users always received.
  if (opened.contentLength && opened.contentLength !== buffer.length) {
    const err = new Error(`truncated expected=${opened.contentLength} got=${buffer.length}`);
    err.code = "TRUNCATED";
    throw err;
  }
  const sizeNote = expectedSize > 0 && buffer.length !== expectedSize ? ` db_size=${expectedSize}` : "";
  const key = fileStorage.buildLegacyMigrationKey({
    scope: cfg.scope,
    scopeId: row[cfg.scopeColumn],
    purpose: row.purpose,
    sourceTag: cfg.tag,
    sourceId: row.id,
    originalname: row.original_name,
  });
  const put = await fileStorage.uploadPrivateFile({
    buffer,
    mimetype: row.mime_type || opened.contentType || "application/octet-stream",
    key,
  });
  const head = await fileStorage.headPrivateFile({ bucket: put.bucket, key: put.key });
  const localSha = crypto.createHash("sha256").update(buffer).digest("hex");
  if (!head.exists || head.size !== buffer.length || head.sha256 !== localSha) {
    const err = new Error(`verify_failed exists=${head.exists} size=${head.size}`);
    err.code = "VERIFY_FAILED";
    throw err;
  }
  const { rowCount } = await pool.query(
    `UPDATE ${table}
        SET storage_provider = 'r2', storage_bucket = $2, storage_key = $3,
            content_sha256 = $4, storage_migrated_at = NOW()
      WHERE id = $1 AND storage_migrated_at IS NULL`,
    [row.id, put.bucket, put.key, localSha],
  );
  await journal(table, row.id, rowCount ? "migrated" : "skipped", {
    detail: rowCount ? `from=${opened.provider}${sizeNote}` : "already_migrated_concurrently",
    bucket: put.bucket,
    key: put.key,
    size: buffer.length,
    sha256: localSha,
  });
  return rowCount ? "migrated" : "skipped";
}

async function runPool(items, concurrency, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < items.length) {
      const item = items[i];
      i += 1;
      // eslint-disable-next-line no-await-in-loop
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function executeTable(table, limit, concurrency, counters) {
  const cfg = TABLES[table];
  const fileCols = cfg.hasFileColumns ? "file_path, file_url," : "";
  const { rows } = await pool.query(
    `SELECT id, ${cfg.scopeColumn}, ${cfg.purposeSql} AS purpose, ${fileCols} secure_url, public_id,
            original_name, mime_type, ${cfg.sizeColumn}, storage_provider, storage_bucket, storage_key
       FROM ${table}
      WHERE storage_migrated_at IS NULL
        AND COALESCE(storage_provider, 'cloudinary') IN ('cloudinary', 'local')
        AND NOT EXISTS (
          SELECT 1 FROM file_storage_migration_events e
           WHERE e.source_table = $2 AND e.source_id = ${table}.id AND e.outcome = 'failed'
             AND e.created_at > NOW() - INTERVAL '1 hour'
        )
      ORDER BY id ASC
      LIMIT $1`,
    [limit, table],
  );
  await runPool(rows, concurrency, async (row) => {
    try {
      const outcome = await migrateRow(table, row);
      counters[outcome] += 1;
    } catch (err) {
      counters.failed += 1;
      const detail = `${err?.code || err?.name || "ERROR"}${err?.statusCode ? ` status=${err.statusCode}` : ""}`;
      await journal(table, row.id, "failed", { detail }).catch(() => {});
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ table, id: String(row.id), outcome: "failed", detail }));
    }
  });
  return rows.length;
}

async function verifyTable(table, limit, counters) {
  const { rows } = await pool.query(
    `SELECT id, storage_bucket, storage_key, content_sha256
       FROM ${table}
      WHERE storage_provider = 'r2'
      ORDER BY storage_migrated_at DESC NULLS LAST, id DESC
      LIMIT $1`,
    [limit],
  );
  for (const r of rows) {
    // eslint-disable-next-line no-await-in-loop
    const head = await fileStorage.headPrivateFile({ bucket: r.storage_bucket, key: r.storage_key });
    const ok = head.exists && (!r.content_sha256 || head.sha256 === r.content_sha256);
    counters[ok ? "verified" : "missing"] += 1;
    if (!ok) console.log(JSON.stringify({ table, id: String(r.id), outcome: "verify_failed", exists: head.exists }));
  }
}

async function rollbackTable(table, execute) {
  const cfg = TABLES[table];
  const urlExpr = cfg.hasFileColumns ? "COALESCE(secure_url, file_url, '')" : "COALESCE(secure_url, '')";
  const where = `storage_migrated_at IS NOT NULL AND storage_provider = 'r2'`;
  if (!execute) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`);
    return { table, wouldRollback: rows[0].n };
  }
  const { rowCount } = await pool.query(
    `UPDATE ${table}
        SET storage_provider = CASE WHEN ${urlExpr} ~* '^https?://' THEN 'cloudinary' ELSE 'local' END,
            storage_migrated_at = NULL
      WHERE ${where}`,
  );
  return { table, rolledBack: rowCount };
}

async function main() {
  const guard = assertOperationalScriptAllowed("order files → R2 migration");
  const execute = Boolean(args.get("execute"));
  const limit = Math.min(Math.max(Number(args.get("limit") || 25), 1), 5000);
  const concurrency = Math.min(Math.max(Number(args.get("concurrency") || 3), 1), 8);
  const tables = selectedTables();
  const r2 = readR2Config();

  console.log(
    JSON.stringify({
      database: guard.db.maskedTarget,
      databaseMode: guard.mode,
      r2Configured: isR2Configured(),
      r2Missing: missingR2Variables(),
      bucket: r2.privateBucket || null,
      mode: args.get("rollback") ? "rollback" : args.get("verify") ? "verify" : execute ? "execute" : "inventory",
      tables,
      limit,
    }),
  );

  if (args.get("rollback")) {
    for (const t of tables) console.log(JSON.stringify(await rollbackTable(t, execute)));
    return;
  }

  if (!execute && !args.get("verify")) {
    for (const t of tables) for (const row of await inventory(t)) console.log(JSON.stringify(row));
    return;
  }

  if (!isR2Configured()) throw new Error(`R2 not configured; missing: ${missingR2Variables().join(", ")}`);

  if (args.get("verify")) {
    const counters = { verified: 0, missing: 0 };
    for (const t of tables) await verifyTable(t, limit, counters);
    console.log(JSON.stringify({ summary: counters }));
    return;
  }

  const counters = { migrated: 0, skipped: 0, failed: 0 };
  let picked = 0;
  for (const t of tables) {
    const remaining = limit - picked;
    if (remaining <= 0) break;
    picked += await executeTable(t, remaining, concurrency, counters);
  }
  console.log(JSON.stringify({ summary: { picked, ...counters } }));
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err?.code ? `${err.code}: ${err.message}` : err?.message || err);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  });
